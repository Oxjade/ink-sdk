import { EvmAdapter } from "@ink/evm";
import { InMemoryIkaConnector } from "@ink/ika-connector";
import { SolanaAdapter } from "@ink/solana";
import { SuiAdapter } from "@ink/sui";
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
} from "@ink/types";

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
  SigningConfig,
  SolanaChain,
  SolanaTarget,
  SuiChain,
  SuiTarget,
} from "@ink/types";

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
  private readonly statuses = new Map<string, InkActionStatus>();
  private readonly receipts = new Map<string, InkReceipt>();

  constructor(options: InkClientOptions = {}) {
    this.chains = options.chains ?? [];
    this.adapters = options.adapters ?? [
      new EvmAdapter(),
      new SolanaAdapter(),
      new SuiAdapter(),
    ];
    this.ika = options.ika?.connector ?? new InMemoryIkaConnector();

    this.dwallet = {
      create: (request) => this.ika.createDWallet(request),
      get: (dWalletId) => this.ika.getDWallet(dWalletId),
      list: () => this.ika.listDWallets(),
      getAddress: (dWalletId, chain) => this.ika.getAddress(dWalletId, chain),
      linkChains: (dWalletId, chains) => this.ika.linkChains(dWalletId, chains),
      importExisting: (request) => this.ika.importExisting(request),
    };
  }

  configureChains(chains: InkChain[]): void {
    this.chains = chains;
  }

  async call<TParams extends InkCallParams>(params: TParams): Promise<InkReceipt> {
    const adapter = this.getAdapter(params.targetChain);
    this.ensureConfigured(params.targetChain);

    const built = await adapter.buildTransaction(params as never);
    this.statuses.set(built.actionId, "built");

    const signingPayload = await adapter.getSigningPayload(built);
    this.statuses.set(built.actionId, "signing");

    const signature = await this.ika.sign({
      dWalletId: params.signing.dWalletId,
      targetChain: params.targetChain,
      payload: signingPayload,
    });
    this.statuses.set(built.actionId, "signed");

    const signedTx = await adapter.attachSignature(built, signature);
    const result = await adapter.submit(signedTx, params as never);
    this.statuses.set(built.actionId, "broadcast");

    const receipt = params.execution?.waitForReceipt
      ? await adapter.waitForReceipt(result, params as never)
      : adapter.formatResult(result, params as never);

    const normalizedReceipt = {
      ...receipt,
      actionId: built.actionId,
    };
    this.statuses.set(built.actionId, normalizedReceipt.status);
    this.receipts.set(built.actionId, normalizedReceipt);
    return normalizedReceipt;
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
    return this.statuses.get(actionId);
  }

  async getReceipt(actionId: string): Promise<InkReceipt | undefined> {
    return this.receipts.get(actionId);
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

