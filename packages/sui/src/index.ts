import type {
  BuiltTransaction,
  ChainAdapter,
  ChainSignature,
  InkCallParams,
  InkEstimate,
  InkReceipt,
  InkTransactionResult,
  SigningPayload,
  SuiChain,
} from "@ink-sdk/types";

export type SuiRpc = {
  submitTransaction?: (transaction: unknown, chain: SuiChain) => Promise<InkTransactionResult>;
  waitForTransaction?: (result: InkTransactionResult, chain: SuiChain) => Promise<InkReceipt["receipt"]>;
  estimateFee?: (transaction: unknown, chain: SuiChain) => Promise<string>;
};

export class SuiAdapter implements ChainAdapter<SuiChain> {
  readonly chainType = "sui" as const;

  constructor(private readonly rpc: SuiRpc = {}) {}

  supports(chain: { type: string }): chain is SuiChain {
    return chain.type === "sui";
  }

  async buildTransaction(params: InkCallParams<SuiChain>): Promise<BuiltTransaction> {
    validateSuiParams(params);
    return {
      actionId: createActionId("sui"),
      targetChain: params.targetChain,
      target: {
        packageId: params.target.packageId,
        module: params.target.module,
        functionName: params.target.functionName,
      },
      nativeTransaction: {
        network: params.targetChain.network,
        moveCall: {
          packageId: params.target.packageId,
          module: params.target.module,
          functionName: params.target.functionName,
          typeArguments: params.target.typeArguments ?? [],
          arguments: params.target.arguments ?? [],
        },
      },
    };
  }

  async getSigningPayload(transaction: BuiltTransaction): Promise<SigningPayload> {
    return {
      kind: "sui-transaction",
      bytes: JSON.stringify(transaction.nativeTransaction),
      metadata: { actionId: transaction.actionId },
    };
  }

  async attachSignature(transaction: BuiltTransaction, signature: ChainSignature): Promise<unknown> {
    return {
      transactionBlock: transaction.nativeTransaction,
      signature,
      actionId: transaction.actionId,
    };
  }

  async submit(signedTransaction: unknown, params: InkCallParams<SuiChain>): Promise<InkTransactionResult> {
    if (this.rpc.submitTransaction) {
      return this.rpc.submitTransaction(signedTransaction, params.targetChain);
    }
    return {
      digest: createActionId("sui_digest"),
      raw: signedTransaction,
    };
  }

  async waitForReceipt(result: InkTransactionResult, params: InkCallParams<SuiChain>): Promise<InkReceipt> {
    const receipt = this.rpc.waitForTransaction
      ? await this.rpc.waitForTransaction(result, params.targetChain)
      : { confirmed: true };
    return {
      ...this.formatResult(result, params),
      status: "executed",
      receipt,
    };
  }

  formatResult(result: InkTransactionResult, params: InkCallParams<SuiChain>): InkReceipt {
    const digest = result.digest ?? result.hash;
    return {
      actionId: createActionId("receipt"),
      status: "broadcast",
      targetChain: params.targetChain,
      target: {
        packageId: params.target.packageId,
        module: params.target.module,
        functionName: params.target.functionName,
      },
      transaction: {
        digest,
        explorerUrl: params.execution?.returnExplorerUrl && digest && params.targetChain.explorerUrl
          ? `${params.targetChain.explorerUrl.replace(/\/$/, "")}/tx/${digest}`
          : undefined,
      },
      signing: params.signing,
    };
  }

  async estimate(params: InkCallParams<SuiChain>): Promise<InkEstimate> {
    const built = await this.buildTransaction(params);
    return {
      targetChain: params.targetChain,
      fee: this.rpc.estimateFee
        ? await this.rpc.estimateFee(built.nativeTransaction, params.targetChain)
        : undefined,
      raw: built.nativeTransaction,
    };
  }
}

function createActionId(prefix: string): string {
  return `ink_${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function validateSuiParams(params: InkCallParams<SuiChain>): void {
  if (!params.targetChain.network) {
    throw new Error("Sui network is required");
  }
  if (!params.target.packageId) {
    throw new Error("Sui packageId is required");
  }
  if (!params.target.module) {
    throw new Error("Sui module is required");
  }
  if (!params.target.functionName) {
    throw new Error("Sui functionName is required");
  }
  if (params.target.typeArguments !== undefined && !Array.isArray(params.target.typeArguments)) {
    throw new Error("Sui typeArguments must be an array");
  }
  if (params.target.arguments !== undefined && !Array.isArray(params.target.arguments)) {
    throw new Error("Sui arguments must be an array");
  }
}
