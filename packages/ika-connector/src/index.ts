import type {
  ChainAddressMap,
  ChainSignature,
  DWalletCreateRequest,
  DWalletImportRequest,
  DWalletRecord,
  IkaConnector,
  InkChain,
  SigningPayload,
} from "@ink/types";

export type IkaSdkLikeClient = {
  createDWallet?: (request: DWalletCreateRequest) => Promise<DWalletRecord>;
  getDWallet?: (dWalletId: string) => Promise<DWalletRecord>;
  listDWallets?: () => Promise<DWalletRecord[]>;
  getAddress?: (dWalletId: string, chain: InkChain) => Promise<string>;
  linkChains?: (dWalletId: string, chains: InkChain[]) => Promise<DWalletRecord>;
  importExisting?: (request: DWalletImportRequest) => Promise<DWalletRecord>;
  sign?: (input: {
    dWalletId: string;
    targetChain: InkChain;
    payload: SigningPayload;
  }) => Promise<ChainSignature>;
};

export class IkaConnectorAdapter implements IkaConnector {
  constructor(private readonly client: IkaSdkLikeClient) {}

  async createDWallet(request: DWalletCreateRequest): Promise<DWalletRecord> {
    if (!this.client.createDWallet) {
      throw new Error("Ika client does not implement createDWallet");
    }
    return this.client.createDWallet(request);
  }

  async getDWallet(dWalletId: string): Promise<DWalletRecord> {
    if (!this.client.getDWallet) {
      throw new Error("Ika client does not implement getDWallet");
    }
    return this.client.getDWallet(dWalletId);
  }

  async listDWallets(): Promise<DWalletRecord[]> {
    if (!this.client.listDWallets) {
      throw new Error("Ika client does not implement listDWallets");
    }
    return this.client.listDWallets();
  }

  async getAddress(dWalletId: string, chain: InkChain): Promise<string> {
    if (!this.client.getAddress) {
      const wallet = await this.getDWallet(dWalletId);
      const address = wallet.addresses[chain.type];
      if (!address) {
        throw new Error(`No ${chain.type} address found for dWallet ${dWalletId}`);
      }
      return address;
    }
    return this.client.getAddress(dWalletId, chain);
  }

  async linkChains(dWalletId: string, chains: InkChain[]): Promise<DWalletRecord> {
    if (!this.client.linkChains) {
      throw new Error("Ika client does not implement linkChains");
    }
    return this.client.linkChains(dWalletId, chains);
  }

  async importExisting(request: DWalletImportRequest): Promise<DWalletRecord> {
    if (!this.client.importExisting) {
      throw new Error("Ika client does not implement importExisting");
    }
    return this.client.importExisting(request);
  }

  async sign(input: {
    dWalletId: string;
    targetChain: InkChain;
    payload: SigningPayload;
  }): Promise<ChainSignature> {
    if (!this.client.sign) {
      throw new Error("Ika client does not implement sign");
    }
    return this.client.sign(input);
  }
}

export class InMemoryIkaConnector implements IkaConnector {
  private readonly wallets = new Map<string, DWalletRecord>();
  private sequence = 1;

  async createDWallet(request: DWalletCreateRequest): Promise<DWalletRecord> {
    const id = `dwallet_${String(this.sequence++).padStart(3, "0")}`;
    const wallet: DWalletRecord = {
      id,
      name: request.name,
      addresses: buildDeterministicAddresses(id, request.chains),
      supportedChains: request.chains,
      metadata: request.config,
    };
    this.wallets.set(id, wallet);
    return wallet;
  }

  async getDWallet(dWalletId: string): Promise<DWalletRecord> {
    const wallet = this.wallets.get(dWalletId);
    if (!wallet) {
      throw new Error(`dWallet not found: ${dWalletId}`);
    }
    return wallet;
  }

  async listDWallets(): Promise<DWalletRecord[]> {
    return Array.from(this.wallets.values());
  }

  async getAddress(dWalletId: string, chain: InkChain): Promise<string> {
    const wallet = await this.getDWallet(dWalletId);
    const address = wallet.addresses[chain.type];
    if (!address) {
      throw new Error(`No ${chain.type} address linked for dWallet ${dWalletId}`);
    }
    return address;
  }

  async linkChains(dWalletId: string, chains: InkChain[]): Promise<DWalletRecord> {
    const wallet = await this.getDWallet(dWalletId);
    const nextChains = mergeChains(wallet.supportedChains, chains);
    const nextWallet: DWalletRecord = {
      ...wallet,
      addresses: {
        ...wallet.addresses,
        ...buildDeterministicAddresses(dWalletId, chains),
      },
      supportedChains: nextChains,
    };
    this.wallets.set(dWalletId, nextWallet);
    return nextWallet;
  }

  async importExisting(request: DWalletImportRequest): Promise<DWalletRecord> {
    const chains = request.chains ?? [];
    const wallet: DWalletRecord = {
      id: request.dWalletId,
      addresses: buildDeterministicAddresses(request.dWalletId, chains),
      supportedChains: chains,
      metadata: request.metadata,
    };
    this.wallets.set(request.dWalletId, wallet);
    return wallet;
  }

  async sign(input: {
    dWalletId: string;
    targetChain: InkChain;
    payload: SigningPayload;
  }): Promise<ChainSignature> {
    await this.getDWallet(input.dWalletId);
    return {
      signature: `ink_mock_signature_${input.targetChain.type}_${input.dWalletId}`,
      metadata: {
        payloadKind: input.payload.kind,
        developmentOnly: true,
      },
    };
  }
}

function buildDeterministicAddresses(dWalletId: string, chains: InkChain[]): ChainAddressMap {
  const addresses: ChainAddressMap = {};
  for (const chain of chains) {
    if (chain.type === "evm") addresses.evm ??= `0x${hashish(`${dWalletId}:evm`).slice(0, 40)}`;
    if (chain.type === "solana") addresses.solana ??= `Ink${hashish(`${dWalletId}:solana`).slice(0, 40)}`;
    if (chain.type === "sui") addresses.sui ??= `0x${hashish(`${dWalletId}:sui`).slice(0, 64)}`;
  }
  return addresses;
}

function mergeChains(existing: InkChain[], incoming: InkChain[]): InkChain[] {
  const seen = new Set<string>();
  const merged: InkChain[] = [];
  for (const chain of [...existing, ...incoming]) {
    const key = chainKey(chain);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(chain);
  }
  return merged;
}

function chainKey(chain: InkChain): string {
  if (chain.type === "evm") return `evm:${chain.chainId}`;
  if (chain.type === "solana") return `solana:${chain.cluster}`;
  return `sui:${chain.network}`;
}

function hashish(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Array.from({ length: 16 }, (_, index) =>
    ((hash + index * 2654435761) >>> 0).toString(16).padStart(8, "0")
  ).join("");
}

