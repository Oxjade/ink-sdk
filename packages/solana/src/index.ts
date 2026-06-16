import type {
  BuiltTransaction,
  ChainAdapter,
  ChainSignature,
  InkCallParams,
  InkEstimate,
  InkReceipt,
  InkTransactionResult,
  SigningPayload,
  SolanaChain,
} from "@ink/types";

export type SolanaRpc = {
  sendTransaction?: (transaction: unknown, chain: SolanaChain) => Promise<InkTransactionResult>;
  confirmTransaction?: (result: InkTransactionResult, chain: SolanaChain) => Promise<InkReceipt["receipt"]>;
  estimateComputeUnits?: (transaction: unknown, chain: SolanaChain) => Promise<number>;
};

export class SolanaAdapter implements ChainAdapter<SolanaChain> {
  readonly chainType = "solana" as const;

  constructor(private readonly rpc: SolanaRpc = {}) {}

  supports(chain: { type: string }): chain is SolanaChain {
    return chain.type === "solana";
  }

  async buildTransaction(params: InkCallParams<SolanaChain>): Promise<BuiltTransaction> {
    return {
      actionId: createActionId("solana"),
      targetChain: params.targetChain,
      target: {
        programId: params.target.programId,
        instruction: params.target.instruction,
      },
      nativeTransaction: {
        cluster: params.targetChain.cluster,
        programId: params.target.programId,
        instruction: params.target.instruction,
        accounts: params.target.accounts,
        args: params.target.args ?? {},
      },
    };
  }

  async getSigningPayload(transaction: BuiltTransaction): Promise<SigningPayload> {
    return {
      kind: "solana-message",
      bytes: JSON.stringify(transaction.nativeTransaction),
      metadata: { actionId: transaction.actionId },
    };
  }

  async attachSignature(transaction: BuiltTransaction, signature: ChainSignature): Promise<unknown> {
    return {
      message: transaction.nativeTransaction,
      signatures: [signature],
      actionId: transaction.actionId,
    };
  }

  async submit(signedTransaction: unknown, params: InkCallParams<SolanaChain>): Promise<InkTransactionResult> {
    if (this.rpc.sendTransaction) {
      return this.rpc.sendTransaction(signedTransaction, params.targetChain);
    }
    return {
      signature: createActionId("sol_sig"),
      raw: signedTransaction,
    };
  }

  async waitForReceipt(result: InkTransactionResult, params: InkCallParams<SolanaChain>): Promise<InkReceipt> {
    const receipt = this.rpc.confirmTransaction
      ? await this.rpc.confirmTransaction(result, params.targetChain)
      : { confirmed: true };
    return {
      ...this.formatResult(result, params),
      status: "executed",
      receipt,
    };
  }

  formatResult(result: InkTransactionResult, params: InkCallParams<SolanaChain>): InkReceipt {
    const hash = result.signature ?? result.hash;
    return {
      actionId: createActionId("receipt"),
      status: "broadcast",
      targetChain: params.targetChain,
      target: {
        programId: params.target.programId,
        instruction: params.target.instruction,
      },
      transaction: {
        hash,
        explorerUrl: params.execution?.returnExplorerUrl && hash && params.targetChain.explorerUrl
          ? `${params.targetChain.explorerUrl.replace(/\/$/, "")}/tx/${hash}`
          : undefined,
      },
      signing: params.signing,
    };
  }

  async estimate(params: InkCallParams<SolanaChain>): Promise<InkEstimate> {
    const built = await this.buildTransaction(params);
    return {
      targetChain: params.targetChain,
      computeUnits: this.rpc.estimateComputeUnits
        ? await this.rpc.estimateComputeUnits(built.nativeTransaction, params.targetChain)
        : undefined,
      raw: built.nativeTransaction,
    };
  }
}

function createActionId(prefix: string): string {
  return `ink_${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

