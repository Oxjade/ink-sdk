import { EvmAdapter } from "@ink-sdk/evm";
import { InMemoryIkaConnector } from "@ink-sdk/ika-connector";
import { SolanaAdapter } from "@ink-sdk/solana";
import { SuiAdapter } from "@ink-sdk/sui";
import type {
  ChainAdapter,
  DWalletCreateRequest,
  DWalletImportRequest,
  DWalletRecord,
  IkaConnector,
  InkActionStatus,
  InkCallParams,
  InkChain,
  InkClientOptions,
  InkEstimate,
  InkReceipt,
  InkStorage,
} from "@ink-sdk/types";

export type InkClientEventMap = {
  "action:status": { actionId: string; status: InkActionStatus };
  "action:receipt": { receipt: InkReceipt };
  "action:error": { actionId?: string; error: Error };
};

export type InkClientEventName = keyof InkClientEventMap;
export type InkClientEventListener<TEvent extends InkClientEventName> = (
  event: InkClientEventMap[TEvent],
) => void;

export type {
  ChainAdapter,
  ChainSignature,
  DWalletCreateRequest,
  DWalletImportRequest,
  DWalletRecord,
  EvmChain,
  EvmTarget,
  ExecutionConfig,
  IkaConnector,
  InkActionStatus,
  InkCallParams,
  InkChain,
  InkClientOptions,
  InkEstimate,
  InkReceipt,
  InkStorage,
  SigningConfig,
  SolanaChain,
  SolanaTarget,
  SuiChain,
  SuiTarget,
} from "@ink-sdk/types";

export class InkClient {
  readonly dwallet: {
    create: (request: DWalletCreateRequest) => Promise<DWalletRecord>;
    get: (dWalletId: string) => Promise<DWalletRecord>;
    list: () => Promise<DWalletRecord[]>;
    getAddress: (dWalletId: string, chain: InkChain) => Promise<string>;
    linkChains: (dWalletId: string, chains: InkChain[]) => Promise<DWalletRecord>;
    importExisting: (request: DWalletImportRequest) => Promise<DWalletRecord>;
  };

  private chains: InkChain[];
  private readonly adapters: ChainAdapter[];
  private readonly ika: IkaConnector;
  private readonly storage?: InkStorage;
  private readonly statuses = new Map<string, InkActionStatus>();
  private readonly receipts = new Map<string, InkReceipt>();
  private readonly idempotencyKeys = new Map<string, string>();
  private readonly listeners = new Map<InkClientEventName, Set<InkClientEventListener<any>>>();

  constructor(options: InkClientOptions = {}) {
    if (options.mode === "production" && !options.ika?.connector) {
      throw new Error("InkClient production mode requires a real Ika connector");
    }

    this.chains = options.chains ?? [];
    this.adapters = options.adapters ?? [
      new EvmAdapter(),
      new SolanaAdapter(),
      new SuiAdapter(),
    ];
    this.ika = options.ika?.connector ?? new InMemoryIkaConnector();
    this.storage = options.storage;

    this.dwallet = {
      create: (request) => this.createDWallet(request),
      get: (dWalletId) => this.getDWallet(dWalletId),
      list: () => this.listDWallets(),
      getAddress: (dWalletId, chain) => this.getDWalletAddress(dWalletId, chain),
      linkChains: (dWalletId, chains) => this.linkDWalletChains(dWalletId, chains),
      importExisting: (request) => this.importExistingDWallet(request),
    };
  }

  on<TEvent extends InkClientEventName>(
    eventName: TEvent,
    listener: InkClientEventListener<TEvent>,
  ): () => void {
    const listeners = this.listeners.get(eventName) ?? new Set();
    listeners.add(listener);
    this.listeners.set(eventName, listeners);
    return () => this.off(eventName, listener);
  }

  off<TEvent extends InkClientEventName>(
    eventName: TEvent,
    listener: InkClientEventListener<TEvent>,
  ): void {
    this.listeners.get(eventName)?.delete(listener);
  }

  configureChains(chains: InkChain[]): void {
    this.chains = chains;
  }

  async call<TParams extends InkCallParams>(params: TParams): Promise<InkReceipt> {
    validateCallParams(params);

    const idempotencyKey = params.execution?.idempotencyKey;
    if (idempotencyKey) {
      const existing = await this.getReceiptByIdempotencyKey(idempotencyKey);
      if (existing) return existing;
    }

    const adapter = this.getAdapter(params.targetChain);
    this.ensureConfigured(params.targetChain);

    const built = await adapter.buildTransaction(params as never);
    await this.setStatus(built.actionId, "built");

    try {
      const signingPayload = await adapter.getSigningPayload(built);
      await this.setStatus(built.actionId, "signing");

      const signature = await this.ika.sign({
        dWalletId: params.signing.dWalletId,
        targetChain: params.targetChain,
        payload: signingPayload,
      });
      await this.setStatus(built.actionId, "signed");

      const signedTx = await adapter.attachSignature(built, signature);
      const result = await adapter.submit(signedTx, params as never);
      await this.setStatus(built.actionId, "broadcast");

      const receipt = params.execution?.waitForReceipt
        ? await adapter.waitForReceipt(result, params as never)
        : adapter.formatResult(result, params as never);

      const normalizedReceipt = {
        ...receipt,
        actionId: built.actionId,
      };
      await this.setStatus(built.actionId, normalizedReceipt.status);
      await this.setReceipt(normalizedReceipt, idempotencyKey);
      return normalizedReceipt;
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      await this.setStatus(
        built.actionId,
        /broadcast|transaction|receipt/i.test(normalizedError.message)
          ? "broadcast_failed"
          : "sign_failed"
      );
      this.emit("action:error", { actionId: built.actionId, error: normalizedError });
      throw normalizedError;
    }
  }

  async batch(params: InkCallParams[]): Promise<InkReceipt[]> {
    const receipts: InkReceipt[] = [];
    for (const callParams of params) {
      receipts.push(await this.call(callParams));
    }
    return receipts;
  }

  async estimate<TParams extends InkCallParams>(params: TParams): Promise<InkEstimate> {
    const adapter = this.getAdapter(params.targetChain);
    if (!adapter.estimate) {
      throw new Error(`Adapter for ${params.targetChain.type} does not support estimate`);
    }
    return adapter.estimate(params as never);
  }

  async getStatus(actionId: string): Promise<InkActionStatus | undefined> {
    return this.statuses.get(actionId) ?? await this.storage?.getStatus?.(actionId);
  }

  async getReceipt(actionId: string): Promise<InkReceipt | undefined> {
    return this.receipts.get(actionId) ?? await this.storage?.getReceipt?.(actionId);
  }

  private async createDWallet(request: DWalletCreateRequest): Promise<DWalletRecord> {
    const wallet = await this.ika.createDWallet(request);
    await this.storage?.setDWallet?.(wallet);
    return wallet;
  }

  private async getDWallet(dWalletId: string): Promise<DWalletRecord> {
    try {
      const wallet = await this.ika.getDWallet(dWalletId);
      await this.storage?.setDWallet?.(wallet);
      return wallet;
    } catch (error) {
      const stored = await this.storage?.getDWallet?.(dWalletId);
      if (stored) return stored;
      throw error;
    }
  }

  private async listDWallets(): Promise<DWalletRecord[]> {
    const live = await this.ika.listDWallets();
    const stored = await this.storage?.listDWallets?.() ?? [];
    const byId = new Map<string, DWalletRecord>();
    for (const wallet of stored) byId.set(wallet.id, wallet);
    for (const wallet of live) {
      byId.set(wallet.id, wallet);
      await this.storage?.setDWallet?.(wallet);
    }
    return Array.from(byId.values());
  }

  private async getDWalletAddress(dWalletId: string, chain: InkChain): Promise<string> {
    try {
      return await this.ika.getAddress(dWalletId, chain);
    } catch (error) {
      const wallet = await this.storage?.getDWallet?.(dWalletId);
      const address = wallet?.addresses[chain.type];
      if (address) return address;
      throw error;
    }
  }

  private async linkDWalletChains(dWalletId: string, chains: InkChain[]): Promise<DWalletRecord> {
    const wallet = await this.ika.linkChains(dWalletId, chains);
    await this.storage?.setDWallet?.(wallet);
    return wallet;
  }

  private async importExistingDWallet(request: DWalletImportRequest): Promise<DWalletRecord> {
    const wallet = await this.ika.importExisting(request);
    await this.storage?.setDWallet?.(wallet);
    return wallet;
  }

  private async setStatus(actionId: string, status: InkActionStatus): Promise<void> {
    this.statuses.set(actionId, status);
    await this.storage?.setStatus?.(actionId, status);
    this.emit("action:status", { actionId, status });
  }

  private async setReceipt(receipt: InkReceipt, idempotencyKey?: string): Promise<void> {
    this.receipts.set(receipt.actionId, receipt);
    await this.storage?.setReceipt?.(receipt);
    if (idempotencyKey) {
      this.idempotencyKeys.set(idempotencyKey, receipt.actionId);
      await this.storage?.setIdempotencyKey?.(idempotencyKey, receipt.actionId);
    }
    this.emit("action:receipt", { receipt });
  }

  private async getReceiptByIdempotencyKey(key: string): Promise<InkReceipt | undefined> {
    const actionId = this.idempotencyKeys.get(key);
    if (actionId) return this.getReceipt(actionId);
    return this.storage?.getReceiptByIdempotencyKey?.(key);
  }

  private getAdapter(chain: InkChain): ChainAdapter {
    const adapter = this.adapters.find((candidate) => candidate.supports(chain));
    if (!adapter) {
      throw new Error(`No Ink adapter configured for chain type: ${chain.type}`);
    }
    return adapter;
  }

  private ensureConfigured(chain: InkChain): void {
    if (this.chains.length === 0) return;
    const configured = this.chains.some((candidate) => sameChain(candidate, chain));
    if (!configured) {
      throw new Error(`Chain is not configured: ${describeChain(chain)}`);
    }
  }

  private emit<TEvent extends InkClientEventName>(
    eventName: TEvent,
    event: InkClientEventMap[TEvent],
  ): void {
    for (const listener of this.listeners.get(eventName) ?? []) {
      listener(event);
    }
  }
}

export function createInkClient(options: InkClientOptions = {}): InkClient {
  return new InkClient(options);
}

export async function createJsonFileStorage(filePath: string): Promise<InkStorage> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  type Store = {
    statuses: Record<string, InkActionStatus>;
    receipts: Record<string, InkReceipt>;
    idempotencyKeys: Record<string, string>;
    dWallets: Record<string, DWalletRecord>;
  };

  const empty = (): Store => ({
    statuses: {},
    receipts: {},
    idempotencyKeys: {},
    dWallets: {},
  });
  const read = async (): Promise<Store> => {
    try {
      return JSON.parse(await fs.readFile(filePath, "utf8")) as Store;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty();
      throw error;
    }
  };
  const write = async (store: Store): Promise<void> => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`);
  };
  const update = async (mutate: (store: Store) => void): Promise<void> => {
    const store = await read();
    mutate(store);
    await write(store);
  };

  return {
    async getStatus(actionId) {
      return (await read()).statuses[actionId];
    },
    async setStatus(actionId, status) {
      await update((store) => {
        store.statuses[actionId] = status;
      });
    },
    async getReceipt(actionId) {
      return (await read()).receipts[actionId];
    },
    async setReceipt(receipt) {
      await update((store) => {
        store.receipts[receipt.actionId] = receipt;
      });
    },
    async getReceiptByIdempotencyKey(key) {
      const store = await read();
      const actionId = store.idempotencyKeys[key];
      return actionId ? store.receipts[actionId] : undefined;
    },
    async setIdempotencyKey(key, actionId) {
      await update((store) => {
        store.idempotencyKeys[key] = actionId;
      });
    },
    async getDWallet(dWalletId) {
      return (await read()).dWallets[dWalletId];
    },
    async setDWallet(wallet) {
      await update((store) => {
        store.dWallets[wallet.id] = wallet;
      });
    },
    async listDWallets() {
      return Object.values((await read()).dWallets);
    },
  };
}

function sameChain(left: InkChain, right: InkChain): boolean {
  if (left.type !== right.type) return false;
  if (left.type === "evm" && right.type === "evm") return left.chainId === right.chainId;
  if (left.type === "solana" && right.type === "solana") return left.cluster === right.cluster;
  if (left.type === "sui" && right.type === "sui") return left.network === right.network;
  return false;
}

function describeChain(chain: InkChain): string {
  if (chain.type === "evm") return `evm:${chain.chainId}`;
  if (chain.type === "solana") return `solana:${chain.cluster}`;
  return `sui:${chain.network}`;
}

function validateCallParams(params: InkCallParams): void {
  if (!params || typeof params !== "object") {
    throw new Error("Ink call params are required");
  }
  if (!params.targetChain || typeof params.targetChain.type !== "string") {
    throw new Error("Ink targetChain is required");
  }
  if (!params.target) {
    throw new Error("Ink target is required");
  }
  if (params.signing?.provider !== "ika") {
    throw new Error("Ink signing.provider must be 'ika'");
  }
  if (!params.signing.dWalletId || typeof params.signing.dWalletId !== "string") {
    throw new Error("Ink signing.dWalletId is required");
  }
  const idempotencyKey = params.execution?.idempotencyKey;
  if (idempotencyKey !== undefined && idempotencyKey.trim().length === 0) {
    throw new Error("Ink execution.idempotencyKey cannot be empty");
  }
}
