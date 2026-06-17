export type EvmChain = {
  type: "evm";
  chainId: number;
  rpcUrl?: string;
  explorerUrl?: string;
};

export type SolanaChain = {
  type: "solana";
  cluster: "mainnet-beta" | "devnet" | "testnet" | string;
  rpcUrl?: string;
  explorerUrl?: string;
};

export type SuiChain = {
  type: "sui";
  network: "mainnet" | "testnet" | "devnet" | string;
  rpcUrl?: string;
  explorerUrl?: string;
};

export type InkChain = EvmChain | SolanaChain | SuiChain;

export type ChainAddressMap = {
  evm?: string;
  solana?: string;
  sui?: string;
};

export type DWalletRecord = {
  id: string;
  name?: string;
  addresses: ChainAddressMap;
  supportedChains: InkChain[];
  metadata?: Record<string, unknown>;
};

export type DWalletCreateRequest = {
  name: string;
  chains: InkChain[];
  config?: Record<string, unknown>;
};

export type DWalletImportRequest = {
  dWalletId: string;
  chains?: InkChain[];
  metadata?: Record<string, unknown>;
};

export type EvmTarget = {
  contract: string;
  abi: unknown[];
  functionName: string;
  args?: unknown[];
  value?: string;
};

export type SolanaAccountMeta = {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
};

export type SolanaTarget = {
  programId: string;
  instruction: string;
  accounts: SolanaAccountMeta[];
  args?: Record<string, unknown>;
};

export type SuiTarget = {
  packageId: string;
  module: string;
  functionName: string;
  typeArguments?: string[];
  arguments?: unknown[];
};

export type TargetForChain<TChain extends InkChain = InkChain> =
  TChain extends EvmChain ? EvmTarget :
  TChain extends SolanaChain ? SolanaTarget :
  TChain extends SuiChain ? SuiTarget :
  never;

export type SigningConfig = {
  provider: "ika";
  dWalletId: string;
};

export type ExecutionConfig = {
  waitForReceipt?: boolean;
  returnExplorerUrl?: boolean;
  idempotencyKey?: string;
};

export type InkCallParams<TChain extends InkChain = InkChain> = {
  targetChain: TChain;
  target: TargetForChain<TChain>;
  signing: SigningConfig;
  execution?: ExecutionConfig;
};

export type InkActionStatus =
  | "created"
  | "built"
  | "signing"
  | "signed"
  | "broadcast"
  | "executed"
  | "sign_failed"
  | "broadcast_failed"
  | "failed";

export type InkTransactionResult = {
  hash?: string;
  digest?: string;
  signature?: string;
  raw?: unknown;
};

export type InkReceipt = {
  actionId: string;
  status: InkActionStatus;
  targetChain: InkChain;
  target: Record<string, unknown>;
  transaction?: {
    hash?: string;
    digest?: string;
    explorerUrl?: string;
  };
  signing: SigningConfig;
  receipt?: {
    confirmed: boolean;
    blockNumber?: number;
    slot?: number;
    checkpoint?: string;
    gasUsed?: string;
    raw?: unknown;
  };
};

export type InkEstimate = {
  targetChain: InkChain;
  fee?: string;
  gas?: string;
  computeUnits?: number;
  raw?: unknown;
};

export type SigningPayload = {
  kind: "evm-transaction" | "solana-message" | "sui-transaction";
  bytes: Uint8Array | string;
  metadata?: Record<string, unknown>;
};

export type ChainSignature = {
  signature: string | Uint8Array;
  recoveryId?: number;
  publicKey?: string;
  metadata?: Record<string, unknown> & {
    serializedTransaction?: string;
    signerAddress?: string;
    timings?: Record<string, number>;
  };
};

export type BuiltTransaction = {
  actionId: string;
  targetChain: InkChain;
  target: Record<string, unknown>;
  nativeTransaction: unknown;
  metadata?: Record<string, unknown>;
};

export interface ChainAdapter<TChain extends InkChain = InkChain> {
  readonly chainType: TChain["type"];
  supports(chain: InkChain): chain is TChain;
  buildTransaction(params: InkCallParams<TChain>): Promise<BuiltTransaction>;
  getSigningPayload(transaction: BuiltTransaction): Promise<SigningPayload>;
  attachSignature(transaction: BuiltTransaction, signature: ChainSignature): Promise<unknown>;
  submit(signedTransaction: unknown, params: InkCallParams<TChain>): Promise<InkTransactionResult>;
  waitForReceipt(result: InkTransactionResult, params: InkCallParams<TChain>): Promise<InkReceipt>;
  formatResult(result: InkTransactionResult, params: InkCallParams<TChain>): InkReceipt;
  estimate?(params: InkCallParams<TChain>): Promise<InkEstimate>;
}

export interface IkaConnector {
  createDWallet(request: DWalletCreateRequest): Promise<DWalletRecord>;
  getDWallet(dWalletId: string): Promise<DWalletRecord>;
  listDWallets(): Promise<DWalletRecord[]>;
  getAddress(dWalletId: string, chain: InkChain): Promise<string>;
  linkChains(dWalletId: string, chains: InkChain[]): Promise<DWalletRecord>;
  importExisting(request: DWalletImportRequest): Promise<DWalletRecord>;
  sign(input: {
    dWalletId: string;
    targetChain: InkChain;
    payload: SigningPayload;
  }): Promise<ChainSignature>;
}

export type InkClientOptions = {
  projectId?: string;
  ika?: {
    network?: string;
    connector?: IkaConnector;
  };
  chains?: InkChain[];
  adapters?: ChainAdapter[];
  storage?: InkStorage;
};

export interface InkStorage {
  getStatus?(actionId: string): Promise<InkActionStatus | undefined>;
  setStatus?(actionId: string, status: InkActionStatus): Promise<void>;
  getReceipt?(actionId: string): Promise<InkReceipt | undefined>;
  setReceipt?(receipt: InkReceipt): Promise<void>;
  getReceiptByIdempotencyKey?(key: string): Promise<InkReceipt | undefined>;
  setIdempotencyKey?(key: string, actionId: string): Promise<void>;
  getDWallet?(dWalletId: string): Promise<DWalletRecord | undefined>;
  setDWallet?(wallet: DWalletRecord): Promise<void>;
  listDWallets?(): Promise<DWalletRecord[]>;
}
