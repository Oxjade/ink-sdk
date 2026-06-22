import type {
  BuiltTransaction,
  ChainAdapter,
  ChainSignature,
  EvmChain,
  InkCallParams,
  InkEstimate,
  InkReceipt,
  InkTransactionResult,
  SigningPayload,
} from "@ink-sdk/types";
import { Interface, isAddress, type InterfaceAbi } from "ethers";

export type EvmRpc = {
  estimateGas?: (tx: EvmUnsignedTransaction) => Promise<string>;
  getNonce?: (address: string, chain: EvmChain) => Promise<number>;
  getGasPrice?: (chain: EvmChain) => Promise<string>;
  broadcastRawTransaction?: (rawTransaction: string, chain: EvmChain) => Promise<InkTransactionResult>;
  waitForReceipt?: (result: InkTransactionResult, chain: EvmChain) => Promise<InkReceipt["receipt"]>;
};

export type EvmAdapterOptions = {
  rpc?: EvmRpc;
  fromAddressResolver?: (params: InkCallParams<EvmChain>) => Promise<string>;
};

export type EvmUnsignedTransaction = {
  chainId: number;
  to: string;
  data: string;
  value: string;
  nonce?: number;
  gas?: string;
  gasPrice?: string;
  from?: string;
};

export class EvmAdapter implements ChainAdapter<EvmChain> {
  readonly chainType = "evm" as const;

  constructor(private readonly options: EvmAdapterOptions = {}) {}

  supports(chain: { type: string }): chain is EvmChain {
    return chain.type === "evm";
  }

  async buildTransaction(params: InkCallParams<EvmChain>): Promise<BuiltTransaction> {
    const target = params.target;
    validateEvmParams(params);
    const from = this.options.fromAddressResolver
      ? await this.options.fromAddressResolver(params)
      : undefined;
    const tx: EvmUnsignedTransaction = {
      chainId: params.targetChain.chainId,
      to: target.contract,
      data: encodeFunctionCall(target.abi, target.functionName, target.args ?? []),
      value: target.value ?? "0",
      from,
    };

    if (from && this.options.rpc?.getNonce) {
      tx.nonce = await this.options.rpc.getNonce(from, params.targetChain);
    }
    if (this.options.rpc?.estimateGas) {
      tx.gas = await this.options.rpc.estimateGas(tx);
    }
    if (this.options.rpc?.getGasPrice) {
      tx.gasPrice = await this.options.rpc.getGasPrice(params.targetChain);
    }

    return {
      actionId: createActionId("evm"),
      targetChain: params.targetChain,
      target: {
        contract: target.contract,
        functionName: target.functionName,
      },
      nativeTransaction: tx,
    };
  }

  async getSigningPayload(transaction: BuiltTransaction): Promise<SigningPayload> {
    return {
      kind: "evm-transaction",
      bytes: JSON.stringify(transaction.nativeTransaction),
      metadata: {
        actionId: transaction.actionId,
      },
    };
  }

  async attachSignature(transaction: BuiltTransaction, signature: ChainSignature): Promise<unknown> {
    if (signature.metadata?.serializedTransaction) {
      return {
        unsignedTransaction: transaction.nativeTransaction,
        signature,
        serialized: signature.metadata.serializedTransaction,
        actionId: transaction.actionId,
      };
    }

    return {
      unsignedTransaction: transaction.nativeTransaction,
      signature,
      serialized: JSON.stringify({
        tx: transaction.nativeTransaction,
        signature: normalizeSignature(signature),
      }),
      actionId: transaction.actionId,
    };
  }

  async submit(signedTransaction: unknown, params: InkCallParams<EvmChain>): Promise<InkTransactionResult> {
    const raw = extractSerialized(signedTransaction);
    if (this.options.rpc?.broadcastRawTransaction) {
      return this.options.rpc.broadcastRawTransaction(raw, params.targetChain);
    }
    return {
      hash: `0x${createActionId("evm").replace(/_/g, "")}`,
      raw: signedTransaction,
    };
  }

  async waitForReceipt(result: InkTransactionResult, params: InkCallParams<EvmChain>): Promise<InkReceipt> {
    const receipt = this.options.rpc?.waitForReceipt
      ? await this.options.rpc.waitForReceipt(result, params.targetChain)
      : {
          confirmed: true,
          gasUsed: undefined,
        };
    return {
      ...this.formatResult(result, params),
      status: receipt?.confirmed ? "executed" : isBroadcastSkipped(receipt) ? "signed" : "broadcast",
      receipt,
    };
  }

  formatResult(result: InkTransactionResult, params: InkCallParams<EvmChain>): InkReceipt {
    return {
      actionId: createActionId("receipt"),
      status: "broadcast",
      targetChain: params.targetChain,
      target: {
        contract: params.target.contract,
        functionName: params.target.functionName,
      },
      transaction: {
        hash: result.hash,
        explorerUrl: params.execution?.returnExplorerUrl && result.hash
          ? buildExplorerUrl(params.targetChain, result.hash)
          : undefined,
      },
      signing: params.signing,
    };
  }

  async estimate(params: InkCallParams<EvmChain>): Promise<InkEstimate> {
    const built = await this.buildTransaction(params);
    const tx = built.nativeTransaction as EvmUnsignedTransaction;
    return {
      targetChain: params.targetChain,
      gas: tx.gas,
      fee: tx.gas && tx.gasPrice ? String(BigInt(tx.gas) * BigInt(tx.gasPrice)) : undefined,
      raw: tx,
    };
  }
}

export function encodeFunctionCall(abi: unknown[], functionName: string, args: unknown[]): string {
  const iface = new Interface(abi as InterfaceAbi);
  return iface.encodeFunctionData(functionName, args as readonly unknown[]);
}

function validateEvmParams(params: InkCallParams<EvmChain>): void {
  if (!Number.isInteger(params.targetChain.chainId) || params.targetChain.chainId <= 0) {
    throw new Error("EVM chainId must be a positive integer");
  }
  if (!isAddress(params.target.contract)) {
    throw new Error(`Invalid EVM contract address: ${params.target.contract}`);
  }
  if (!Array.isArray(params.target.abi) || params.target.abi.length === 0) {
    throw new Error("EVM target ABI is required");
  }
  if (!params.target.functionName) {
    throw new Error("EVM target functionName is required");
  }
  if (params.target.value !== undefined) {
    try {
      BigInt(params.target.value);
    } catch {
      throw new Error("EVM target value must be a bigint-compatible string");
    }
  }
}

function buildExplorerUrl(chain: EvmChain, hash: string): string | undefined {
  if (!chain.explorerUrl) return undefined;
  return `${chain.explorerUrl.replace(/\/$/, "")}/tx/${hash}`;
}

function normalizeSignature(signature: ChainSignature): string {
  return typeof signature.signature === "string"
    ? signature.signature
    : bytesToHex(signature.signature);
}

function extractSerialized(value: unknown): string {
  if (value && typeof value === "object" && "serialized" in value) {
    return String((value as { serialized: unknown }).serialized);
  }
  return JSON.stringify(value);
}

function createActionId(prefix: string): string {
  return `ink_${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isBroadcastSkipped(receipt: InkReceipt["receipt"]): boolean {
  const raw = receipt?.raw;
  return Boolean(
    raw &&
    typeof raw === "object" &&
    "broadcastSkipped" in raw &&
    (raw as { broadcastSkipped?: unknown }).broadcastSkipped === true
  );
}

function bytesToHex(input: Uint8Array): string {
  return Array.from(input, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
