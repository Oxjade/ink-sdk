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
import { ethers } from "ethers";

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

export type IkaEvmSigningConnectorOptions = {
  env?: Record<string, string | undefined>;
  providerForChain?: (chain: InkChain) => ethers.Provider;
  onTiming?: (timings: Record<string, number>) => void;
};

export class IkaEvmSigningConnector implements IkaConnector {
  private readonly env: Record<string, string | undefined>;
  private readonly providerForChain?: (chain: InkChain) => ethers.Provider;
  private readonly onTiming?: (timings: Record<string, number>) => void;
  private readonly importedWallets = new Map<string, DWalletRecord>();
  private signerPromise?: Promise<RealIkaEthereumSigner>;

  constructor(options: IkaEvmSigningConnectorOptions = {}) {
    this.env = options.env ?? process.env;
    this.providerForChain = options.providerForChain;
    this.onTiming = options.onTiming;
    validateIkaEvmSigningEnv(this.env);
  }

  async createDWallet(_request: DWalletCreateRequest): Promise<DWalletRecord> {
    throw new Error(
      "IkaEvmSigningConnector does not mock or provision dWallets. Create the dWallet with Ika, then call ink.dwallet.importExisting()."
    );
  }

  async getDWallet(dWalletId: string): Promise<DWalletRecord> {
    const imported = this.importedWallets.get(dWalletId);
    if (imported) return imported;

    if (dWalletId !== this.expectedDWalletId) {
      throw new Error(`IkaEvmSigningConnector is configured for dWallet ${this.expectedDWalletId}, not ${dWalletId}`);
    }

    const signer = await this.getSigner();
    return signer.getDWalletRecord(this.defaultChains);
  }

  async listDWallets(): Promise<DWalletRecord[]> {
    const configured = await this.getDWallet(this.expectedDWalletId);
    const byId = new Map<string, DWalletRecord>([[configured.id, configured]]);
    for (const wallet of this.importedWallets.values()) byId.set(wallet.id, wallet);
    return Array.from(byId.values());
  }

  async getAddress(dWalletId: string, chain: InkChain): Promise<string> {
    const wallet = await this.getDWallet(dWalletId);
    const address = wallet.addresses[chain.type];
    if (!address) {
      throw new Error(`No ${chain.type} address configured for Ika dWallet ${dWalletId}`);
    }
    return address;
  }

  async linkChains(_dWalletId: string, _chains: InkChain[]): Promise<DWalletRecord> {
    throw new Error(
      "IkaEvmSigningConnector cannot link mock chains. Update the real Ika dWallet configuration, then import it again."
    );
  }

  async importExisting(request: DWalletImportRequest): Promise<DWalletRecord> {
    if (request.dWalletId !== this.expectedDWalletId) {
      throw new Error(`Imported dWallet ${request.dWalletId} does not match configured IKA_DWALLET_ID ${this.expectedDWalletId}`);
    }

    const chains = request.chains?.length ? request.chains : this.defaultChains;
    const wallet: DWalletRecord = {
      id: request.dWalletId,
      addresses: buildConfiguredAddresses(this.env, chains),
      supportedChains: chains,
      metadata: {
        ...request.metadata,
        source: "ika",
        production: true,
      },
    };
    this.importedWallets.set(wallet.id, wallet);
    return wallet;
  }

  async sign(input: {
    dWalletId: string;
    targetChain: InkChain;
    payload: SigningPayload;
  }): Promise<ChainSignature> {
    if (input.targetChain.type !== "evm") {
      throw new Error("IkaEvmSigningConnector only supports real EVM signing. Configure a production connector for this chain type.");
    }
    if (input.dWalletId !== this.expectedDWalletId) {
      throw new Error(`IkaEvmSigningConnector is configured for dWallet ${this.expectedDWalletId}, not ${input.dWalletId}`);
    }

    const signer = await this.getSigner();
    const unsignedTx = parseEvmUnsignedTransaction(input.payload);
    const provider = this.providerForChain
      ? this.providerForChain(input.targetChain)
      : providerFromChain(input.targetChain);
    const from = this.env.IKA_ETH_ADDRESS;
    const timings: Record<string, number> = {};

    const serializedTransaction = await signer.signTransaction(unsignedTx, {
      provider,
      from,
      onTiming: (nextTimings) => {
        Object.assign(timings, nextTimings);
        this.onTiming?.(nextTimings);
      },
    });

    return {
      signature: "ika_evm_serialized_transaction",
      metadata: {
        serializedTransaction,
        signerAddress: from,
        timings,
      },
    };
  }

  private getSigner(): Promise<RealIkaEthereumSigner> {
    this.signerPromise ??= createRealIkaEthereumSignerFromEnv(this.env);
    return this.signerPromise;
  }

  private get expectedDWalletId(): string {
    return requiredValue(this.env, "IKA_DWALLET_ID");
  }

  private get defaultChains(): InkChain[] {
    const chainId = cleanEnvValue(this.env.IKA_EVM_CHAIN_ID)
      ? Number(cleanEnvValue(this.env.IKA_EVM_CHAIN_ID))
      : undefined;
    return chainId
      ? [{
          type: "evm",
          chainId,
          rpcUrl: cleanEnvValue(this.env.IKA_EVM_RPC),
          explorerUrl: cleanEnvValue(this.env.IKA_EVM_EXPLORER_URL),
        }]
      : [];
  }
}

type RealIkaEthereumSignerOptions = {
  ikaClient: any;
  Transaction: any;
  IkaTransaction: any;
  Curve: any;
  Hash: any;
  SignatureAlgorithm: any;
  dWalletId: string;
  dWalletCapId: string;
  presignId: string;
  unverifiedPresignCapId: string;
  ikaCoinId: string;
  suiCoinId: string;
  ethereumAddress: string;
  importedKey?: boolean;
  encryptedUserSecretKeyShareId?: string;
  secretShare?: Uint8Array;
  publicOutput?: Uint8Array;
  userShareEncryptionKeys?: any;
  executeSuiTransaction: (transaction: any) => Promise<any>;
  signGasBudget?: number;
  getSignGasPayment?: () => Promise<{ objectId: string; version: string | number; digest: string }>;
  signTimeoutMs?: number;
  signPollIntervalMs?: number;
};

class RealIkaEthereumSigner {
  constructor(private readonly options: RealIkaEthereumSignerOptions) {}

  async getDWalletRecord(chains: InkChain[]): Promise<DWalletRecord> {
    const dWallet = await this.options.ikaClient.getDWalletInParticularState(
      this.options.dWalletId,
      "Active",
      { timeout: this.options.signTimeoutMs ?? 120000 },
    );

    return {
      id: this.options.dWalletId,
      addresses: buildConfiguredAddresses(
        { IKA_ETH_ADDRESS: this.options.ethereumAddress },
        chains,
      ),
      supportedChains: chains,
      metadata: {
        source: "ika",
        production: true,
        state: dWallet?.state?.$kind ?? "Active",
        kind: dWallet?.kind,
      },
    };
  }

  async signTransaction(unsignedTx: Record<string, unknown>, context: {
    provider: ethers.Provider;
    from?: string;
    onTiming?: (timings: Record<string, number>) => void;
  }): Promise<string> {
    const startedAt = nowMs();
    let lastMark = startedAt;
    const timings: Record<string, number> = {};
    const mark = (name: string) => {
      const current = nowMs();
      timings[name] = current - lastMark;
      lastMark = current;
    };

    const {
      ikaClient,
      Transaction,
      IkaTransaction,
      Curve,
      Hash,
      SignatureAlgorithm,
      dWalletId,
      dWalletCapId,
      presignId,
      unverifiedPresignCapId,
      ikaCoinId,
      suiCoinId,
      ethereumAddress,
      importedKey = false,
      encryptedUserSecretKeyShareId,
      secretShare,
      publicOutput,
      userShareEncryptionKeys,
      executeSuiTransaction,
      signGasBudget,
      getSignGasPayment,
      signTimeoutMs = 120000,
      signPollIntervalMs = 1500,
    } = this.options;

    const ethTx = await prepareUnsignedTransaction(unsignedTx, {
      provider: context.provider,
      from: context.from || ethereumAddress,
    });
    mark("prepareUnsignedTransactionMs");

    const message = ethers.getBytes(ethTx.unsignedSerialized);
    const [dWallet, presign] = await Promise.all([
      ikaClient.getDWalletInParticularState(dWalletId, "Active", {
        timeout: signTimeoutMs,
      }),
      ikaClient.getPresignInParticularState(presignId, "Completed", {
        timeout: signTimeoutMs,
      }),
    ]);
    mark("loadIkaStateMs");

    let encryptedUserSecretKeyShare;
    if (encryptedUserSecretKeyShareId) {
      encryptedUserSecretKeyShare =
        await ikaClient.getEncryptedUserSecretKeyShareInParticularState(
          encryptedUserSecretKeyShareId,
          "KeyHolderSigned",
          { timeout: signTimeoutMs }
        );
    }
    mark("loadEncryptedShareMs");

    const suiTx = new Transaction();
    const ikaTx = new IkaTransaction({
      ikaClient,
      transaction: suiTx,
      userShareEncryptionKeys,
    });

    const verifiedPresignCap = ikaTx.verifyPresignCap({
      unverifiedPresignCap: unverifiedPresignCapId,
    });
    const approval = importedKey
      ? ikaTx.approveImportedKeyMessage({
          dWalletCap: dWalletCapId,
          curve: Curve.SECP256K1,
          signatureAlgorithm: SignatureAlgorithm.ECDSASecp256k1,
          hashScheme: Hash.KECCAK256,
          message,
        })
      : ikaTx.approveMessage({
          dWalletCap: dWalletCapId,
          curve: Curve.SECP256K1,
          signatureAlgorithm: SignatureAlgorithm.ECDSASecp256k1,
          hashScheme: Hash.KECCAK256,
          message,
        });

    const signParams: Record<string, unknown> = {
      dWallet,
      hashScheme: Hash.KECCAK256,
      verifiedPresignCap,
      presign,
      encryptedUserSecretKeyShare,
      secretShare,
      publicOutput,
      message,
      signatureScheme: SignatureAlgorithm.ECDSASecp256k1,
      ikaCoin: suiTx.object(ikaCoinId),
      suiCoin: suiTx.object(suiCoinId),
    };

    if (importedKey) {
      signParams.importedKeyMessageApproval = approval;
      await ikaTx.requestSignWithImportedKey(signParams);
    } else {
      signParams.messageApproval = approval;
      await ikaTx.requestSign(signParams);
    }
    if (signGasBudget !== undefined) {
      suiTx.setGasBudget(signGasBudget);
    }
    if (getSignGasPayment) {
      suiTx.setGasPayment([await getSignGasPayment()]);
    }
    mark("buildIkaRequestMs");

    const suiResult = await executeSuiTransaction(suiTx);
    mark("executeSuiTransactionMs");

    const signId = extractSignId(suiResult);
    const signSession = await ikaClient.getSignInParticularState(
      signId,
      Curve.SECP256K1,
      SignatureAlgorithm.ECDSASecp256k1,
      "Completed",
      { timeout: signTimeoutMs, interval: signPollIntervalMs }
    );
    mark("waitForIkaSignatureMs");

    const signature = signatureFromIkaBytes(
      signSession.state.Completed.signature,
      ethTx.unsignedHash,
      context.from || ethereumAddress
    );
    ethTx.signature = signature;

    const recovered = ethTx.from;
    if (
      recovered &&
      recovered.toLowerCase() !== (context.from || ethereumAddress).toLowerCase()
    ) {
      throw new Error(`Ika signature recovered ${recovered}, expected ${context.from || ethereumAddress}`);
    }

    timings.totalMs = nowMs() - startedAt;
    context.onTiming?.(timings);
    return ethTx.serialized;
  }
}

async function createRealIkaEthereumSignerFromEnv(
  env: Record<string, string | undefined>,
): Promise<RealIkaEthereumSigner> {
  validateIkaEvmSigningEnv(env);

  const [ikaSdk, suiJsonRpcModule, suiTxModule, ed25519Module, cryptographyModule] =
    await Promise.all([
      import("@ika.xyz/sdk"),
      import("@mysten/sui/jsonRpc"),
      import("@mysten/sui/transactions"),
      import("@mysten/sui/keypairs/ed25519"),
      import("@mysten/sui/cryptography"),
    ]);

  const network = (env.IKA_NETWORK || "testnet") as "testnet" | "mainnet" | "devnet" | "localnet";
  const suiRpcUrl =
    cleanEnvValue(env.IKA_SUI_RPC) || suiJsonRpcModule.getJsonRpcFullnodeUrl?.(network);
  if (!suiRpcUrl) {
    throw new Error("IKA_SUI_RPC is required when the Sui SDK cannot infer a fullnode URL");
  }

  const suiClient = new suiJsonRpcModule.SuiJsonRpcClient({
    url: suiRpcUrl,
    network,
  });
  const config = ikaSdk.getNetworkConfig(network as Parameters<typeof ikaSdk.getNetworkConfig>[0]);
  const ikaClient = new ikaSdk.IkaClient({
    suiClient,
    config,
    encryptionKeyOptions: env.IKA_NETWORK_ENCRYPTION_KEY_ID
      ? { encryptionKeyID: env.IKA_NETWORK_ENCRYPTION_KEY_ID }
      : undefined,
  });

  const decoded = cryptographyModule.decodeSuiPrivateKey(requiredValue(env, "IKA_SUI_PRIVATE_KEY"));
  const suiKeyScheme = decoded.scheme;
  if (suiKeyScheme !== "ED25519") {
    throw new Error(`Unsupported Sui private key schema for Ika signing: ${suiKeyScheme}`);
  }
  const suiSigner = ed25519Module.Ed25519Keypair.fromSecretKey(decoded.secretKey);
  const userShareEncryptionKeys = cleanEnvValue(env.IKA_USER_SHARE_ENCRYPTION_KEYS_B64)
    ? ikaSdk.UserShareEncryptionKeys.fromShareEncryptionKeysBytes(
        base64ToBytes(cleanEnvValue(env.IKA_USER_SHARE_ENCRYPTION_KEYS_B64)!)
      )
    : undefined;

  return new RealIkaEthereumSigner({
    ikaClient,
    Transaction: suiTxModule.Transaction,
    IkaTransaction: ikaSdk.IkaTransaction,
    Curve: ikaSdk.Curve,
    Hash: ikaSdk.Hash,
    SignatureAlgorithm: ikaSdk.SignatureAlgorithm,
    dWalletId: requiredValue(env, "IKA_DWALLET_ID"),
    dWalletCapId: requiredValue(env, "IKA_DWALLET_CAP_ID"),
    presignId: requiredValue(env, "IKA_PRESIGN_ID"),
    unverifiedPresignCapId: requiredValue(env, "IKA_UNVERIFIED_PRESIGN_CAP_ID"),
    ikaCoinId: requiredValue(env, "IKA_COIN_ID"),
    suiCoinId: requiredValue(env, "IKA_SUI_COIN_ID"),
    ethereumAddress: requiredValue(env, "IKA_ETH_ADDRESS"),
    importedKey: env.IKA_IMPORTED_KEY_DWALLET === "true",
    encryptedUserSecretKeyShareId: env.IKA_ENCRYPTED_USER_SECRET_KEY_SHARE_ID,
    userShareEncryptionKeys,
    secretShare: cleanEnvValue(env.IKA_USER_SECRET_KEY_SHARE_HEX)
      ? hexToBytes(cleanEnvValue(env.IKA_USER_SECRET_KEY_SHARE_HEX)!)
      : undefined,
    publicOutput: cleanEnvValue(env.IKA_PUBLIC_OUTPUT_HEX)
      ? hexToBytes(cleanEnvValue(env.IKA_PUBLIC_OUTPUT_HEX)!)
      : undefined,
    executeSuiTransaction: (transaction: any) =>
      suiClient.signAndExecuteTransaction({
        signer: suiSigner,
        transaction,
        options: {
          showEvents: true,
          showObjectChanges: true,
          showEffects: true,
        },
      }),
    signGasBudget: env.IKA_SIGN_GAS_BUDGET ? Number(env.IKA_SIGN_GAS_BUDGET) : undefined,
    getSignGasPayment: cleanEnvValue(env.IKA_SIGN_GAS_COIN_ID)
      ? async () => {
          const gasObject = await suiClient.getObject({
            id: cleanEnvValue(env.IKA_SIGN_GAS_COIN_ID)!,
            options: {},
          });
          if (!gasObject.data) {
            throw new Error(`Unable to load Ika signing gas coin ${env.IKA_SIGN_GAS_COIN_ID}`);
          }
          return {
            objectId: gasObject.data.objectId,
            version: gasObject.data.version,
            digest: gasObject.data.digest,
          };
        }
      : undefined,
    signTimeoutMs: env.IKA_SIGN_TIMEOUT_MS ? Number(env.IKA_SIGN_TIMEOUT_MS) : undefined,
    signPollIntervalMs: env.IKA_SIGN_POLL_INTERVAL_MS ? Number(env.IKA_SIGN_POLL_INTERVAL_MS) : undefined,
  });
}

function validateIkaEvmSigningEnv(env: Record<string, string | undefined>): void {
  const required = [
    "IKA_DWALLET_ID",
    "IKA_DWALLET_CAP_ID",
    "IKA_PRESIGN_ID",
    "IKA_UNVERIFIED_PRESIGN_CAP_ID",
    "IKA_COIN_ID",
    "IKA_SUI_COIN_ID",
    "IKA_ETH_ADDRESS",
    "IKA_SUI_PRIVATE_KEY",
  ];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing required Ika signing env vars: ${missing.join(", ")}`);
  }
}

async function prepareUnsignedTransaction(
  unsignedTx: Record<string, unknown>,
  { provider, from }: { provider: ethers.Provider; from?: string },
): Promise<ethers.Transaction> {
  if (!from) throw new Error("IKA_ETH_ADDRESS is required for Ika EVM signing");

  const tx: Record<string, unknown> = { ...unsignedTx };
  tx.from = tx.from || from;
  tx.value = tx.value ?? 0n;
  tx.data = tx.data || "0x";

  if (tx.chainId === undefined || tx.chainId === null) {
    const network = await provider.getNetwork();
    tx.chainId = network.chainId;
  }
  if (tx.nonce === undefined || tx.nonce === null) {
    tx.nonce = await provider.getTransactionCount(from, "pending");
  }
  if (tx.gasLimit === undefined && tx.gas === undefined) {
    tx.gasLimit = await provider.estimateGas(tx);
  } else if (tx.gasLimit === undefined) {
    tx.gasLimit = tx.gas;
  }
  if (tx.gasPrice === undefined && tx.maxFeePerGas === undefined) {
    const feeData = await provider.getFeeData();
    if (feeData.maxFeePerGas !== null && feeData.maxPriorityFeePerGas !== null) {
      tx.type = tx.type ?? 2;
      tx.maxFeePerGas = feeData.maxFeePerGas;
      tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
    } else if (feeData.gasPrice !== null) {
      tx.type = tx.type ?? 0;
      tx.gasPrice = feeData.gasPrice;
    } else {
      throw new Error("Unable to determine EVM gas price for Ika-signed transaction");
    }
  }

  delete tx.from;
  delete tx.gas;
  return ethers.Transaction.from(tx);
}

function signatureFromIkaBytes(
  signatureBytes: unknown,
  digest: string,
  expectedAddress?: string,
): ethers.Signature {
  const bytes = normalizeSignatureBytes(signatureBytes);
  if (bytes.length !== 64 && bytes.length !== 65) {
    throw new Error(`Expected 64 or 65 signature bytes from Ika, received ${bytes.length}`);
  }

  const r = ethers.hexlify(bytes.slice(0, 32));
  const s = ethers.hexlify(bytes.slice(32, 64));

  if (bytes.length === 65) {
    const recovery = bytes[64];
    const yParity = recovery >= 27 ? recovery - 27 : recovery;
    if (yParity !== 0 && yParity !== 1) {
      throw new Error(`Unsupported ECDSA recovery id from Ika: ${recovery}`);
    }
    return ethers.Signature.from({ r, s, yParity });
  }

  if (!expectedAddress) {
    throw new Error("IKA_ETH_ADDRESS is required when Ika returns a 64-byte signature without recovery id");
  }

  for (const yParity of [0, 1] as const) {
    const candidate = ethers.Signature.from({ r, s, yParity });
    const recovered = ethers.recoverAddress(digest, candidate);
    if (recovered.toLowerCase() === expectedAddress.toLowerCase()) {
      return candidate;
    }
  }

  throw new Error("Unable to recover expected Ethereum address from Ika signature");
}

function extractSignId(result: any): string {
  const directSignId = findObjectId(result?.events);
  if (directSignId) {
    return directSignId;
  }

  const objectChanges = result?.objectChanges || [];
  for (const change of objectChanges) {
    if (
      change.type === "created" &&
      typeof change.objectType === "string" &&
      change.objectType.includes("SignSession")
    ) {
      return change.objectId;
    }
  }

  const status = result?.effects?.status;
  throw new Error(
    `Unable to extract Ika sign session ID from Sui transaction result. Effects status: ${JSON.stringify(status)}`
  );
}

function findObjectId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findObjectId(entry);
      if (found) return found;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const parsed =
    (record.parsedJson as Record<string, unknown> | undefined) ||
    (record.parsedJSON as Record<string, unknown> | undefined);
  if (parsed) {
    const found = findObjectId(parsed);
    if (found) return found;
  }

  for (const key of ["sign_id", "signId", "signID", "signature_id", "signatureId", "id"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.startsWith("0x")) {
      return candidate;
    }
  }

  for (const nested of Object.values(record)) {
    const found = findObjectId(nested);
    if (found) return found;
  }
  return undefined;
}

function parseEvmUnsignedTransaction(payload: SigningPayload): Record<string, unknown> {
  if (payload.kind !== "evm-transaction") {
    throw new Error(`IkaEvmSigningConnector expected evm-transaction payload, received ${payload.kind}`);
  }
  if (typeof payload.bytes !== "string") {
    throw new Error("IkaEvmSigningConnector expected string serialized EVM transaction payload");
  }
  return JSON.parse(payload.bytes) as Record<string, unknown>;
}

function providerFromChain(chain: InkChain): ethers.Provider {
  if (chain.type !== "evm") {
    throw new Error("IkaEvmSigningConnector can only create providers for EVM chains");
  }
  const rpcUrl = chain.type === "evm" ? chain.rpcUrl : undefined;
  if (!rpcUrl) throw new Error("EVM targetChain.rpcUrl is required for real Ika signing");
  return new ethers.JsonRpcProvider(rpcUrl, chain.chainId, { staticNetwork: true });
}

function normalizeSignatureBytes(signature: unknown): Uint8Array {
  if (!signature) throw new Error("Ika sign session completed without a signature");
  if (typeof signature === "string") return hexToBytes(signature);
  if (signature instanceof Uint8Array) return signature;
  if (Array.isArray(signature)) return Uint8Array.from(signature);
  throw new Error("Unsupported Ika signature format");
}

function hexToBytes(value: string): Uint8Array {
  const hex = value.replace(/^0x/i, "");
  if (!hex || hex.length % 2 !== 0 || !/^[\da-f]+$/i.test(hex)) {
    throw new Error("Expected an even-length hex string");
  }
  return Uint8Array.from(hex.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(globalThis.Buffer
    ? Buffer.from(value, "base64")
    : atob(value).split("").map((char) => char.charCodeAt(0)));
}

function buildConfiguredAddresses(
  env: Record<string, string | undefined>,
  chains: InkChain[],
): ChainAddressMap {
  const addresses: ChainAddressMap = {};
  for (const chain of chains) {
    if (chain.type === "evm") {
      addresses.evm = requiredValue(env, "IKA_ETH_ADDRESS");
    }
  }
  return addresses;
}

function requiredValue(env: Record<string, string | undefined>, key: string): string {
  const value = cleanEnvValue(env[key]);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function cleanEnvValue(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function nowMs(): number {
  return Number(process.hrtime.bigint() / 1000000n);
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
