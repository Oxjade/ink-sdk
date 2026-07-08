import assert from "node:assert/strict";
import test from "node:test";
import { ethers } from "ethers";
import { createEthersEvmAdapter, createEthersEvmRpc } from "../packages/evm/dist/index.js";
import { IkaEvmSigningConnector, IkaSolanaDWalletConnector, IkaSuiDWalletConnector } from "../packages/ika-connector/dist/index.js";
import { InkClient, createInkClient } from "../packages/sdk/dist/index.js";

const evmChain = {
  type: "evm",
  chainId: 97,
  explorerUrl: "https://testnet.bscscan.com",
};

const suiChain = {
  type: "sui",
  network: "testnet",
  explorerUrl: "https://suiscan.xyz/testnet",
};

const solanaChain = {
  type: "solana",
  cluster: "devnet",
  explorerUrl: "https://explorer.solana.com",
};

const transferAbi = [
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
];

class TestIkaConnector {
  constructor() {
    this.wallets = new Map();
    this.sequence = 1;
  }

  async createDWallet(request) {
    const id = `test_dwallet_${String(this.sequence++).padStart(3, "0")}`;
    const wallet = {
      id,
      name: request.name,
      addresses: Object.fromEntries(request.chains.map((chain) => [chain.type, `${chain.type}:${id}`])),
      supportedChains: request.chains,
      metadata: { testOnly: true },
    };
    this.wallets.set(id, wallet);
    return wallet;
  }

  async getDWallet(dWalletId) {
    const wallet = this.wallets.get(dWalletId);
    if (!wallet) throw new Error(`test dWallet not found: ${dWalletId}`);
    return wallet;
  }

  async listDWallets() {
    return Array.from(this.wallets.values());
  }

  async getAddress(dWalletId, chain) {
    return (await this.getDWallet(dWalletId)).addresses[chain.type];
  }

  async linkChains(dWalletId, chains) {
    const wallet = await this.getDWallet(dWalletId);
    wallet.supportedChains = [...wallet.supportedChains, ...chains];
    return wallet;
  }

  async importExisting(request) {
    const wallet = {
      id: request.dWalletId,
      addresses: {},
      supportedChains: request.chains ?? [],
      metadata: request.metadata,
    };
    this.wallets.set(wallet.id, wallet);
    return wallet;
  }

  async sign(input) {
    await this.getDWallet(input.dWalletId);
    return {
      signature: `test_signature_${input.targetChain.type}_${input.dWalletId}`,
      metadata: { payloadKind: input.payload.kind, testOnly: true },
    };
  }
}

async function createClientAndWallet() {
  const ink = createInkClient({
    chains: [evmChain],
    ika: { connector: new TestIkaConnector() },
  });
  const wallet = await ink.dwallet.create({
    name: "test-wallet",
    chains: [evmChain],
  });
  return { ink, wallet };
}

function createEvmCall(dWalletId, idempotencyKey = "transfer-001") {
  return {
    targetChain: evmChain,
    target: {
      contract: "0xae13d989dac2f0debff460ac112a837c89baa7cd",
      abi: transferAbi,
      functionName: "transfer",
      args: ["0x0000000000000000000000000000000000000001", "1"],
      value: "0",
    },
    signing: {
      provider: "ika",
      dWalletId,
    },
    execution: {
      waitForReceipt: true,
      returnExplorerUrl: true,
      idempotencyKey,
    },
  };
}

test("InkClient refuses implicit dWallet connectors", () => {
  assert.throws(
    () => new InkClient({ chains: [evmChain] }),
    /requires an explicit Ika connector/,
  );
});

test("real Ika EVM connector requires real configuration and rejects non-EVM signing", async () => {
  assert.throws(
    () => new IkaEvmSigningConnector({ env: {} }),
    /Missing required Ika EVM dWallet env vars/,
  );

  const connector = new IkaEvmSigningConnector({
    env: {
      IKA_DWALLET_ID: "0xdwallet",
      IKA_DWALLET_CAP_ID: "0xcap",
      IKA_PRESIGN_ID: "0xpresign",
      IKA_UNVERIFIED_PRESIGN_CAP_ID: "0xpresigncap",
      IKA_COIN_ID: "0xika",
      IKA_SUI_COIN_ID: "0xsui",
      IKA_ETH_ADDRESS: "0x0000000000000000000000000000000000000001",
      IKA_SUI_PRIVATE_KEY: "suiprivkey-placeholder",
    },
  });

  await assert.rejects(
    () => connector.sign({
      dWalletId: "0xdwallet",
      targetChain: { type: "solana", cluster: "devnet" },
      payload: { kind: "solana-message", bytes: new Uint8Array() },
    }),
    /only supports real EVM signing/,
  );
});

test("Ika EVM connector requires base Ika env before creating real dWallets", async () => {
  assert.throws(
    () => new IkaEvmSigningConnector({ env: {} }),
    /Missing required Ika EVM dWallet env vars/,
  );
});

test("Ika Solana connector imports Solana dWallet metadata and refuses wrong chain signing", async () => {
  const connector = new IkaSolanaDWalletConnector({
    env: {
      IKA_SOLANA_ADDRESS: "11111111111111111111111111111111",
    },
  });
  const wallet = await connector.importExisting({
    dWalletId: "0xsolana",
    chains: [solanaChain],
    metadata: {
      solanaAddress: "11111111111111111111111111111111",
    },
  });

  assert.equal(wallet.addresses.solana, "11111111111111111111111111111111");
  assert.equal(wallet.metadata.curve, "ED25519");
  assert.equal(wallet.metadata.signatureAlgorithm, "EdDSA");
  assert.equal(await connector.getAddress("0xsolana", solanaChain), "11111111111111111111111111111111");

  await assert.rejects(
    () => connector.sign({
      dWalletId: "0xsolana",
      targetChain: evmChain,
      payload: { kind: "evm-transaction", bytes: "{}" },
    }),
    /only supports real Solana dWallet signing/,
  );
});

test("Ika Solana connector requires Ika env before creating real dWallets", async () => {
  const connector = new IkaSolanaDWalletConnector({ env: {} });

  await assert.rejects(
    () => connector.createDWallet({
      name: "solana-real-wallet",
      chains: [solanaChain],
    }),
    /Missing required Ika ED25519 dWallet env vars/,
  );
});

test("Ika Sui connector imports Sui dWallet metadata and refuses wrong chain signing", async () => {
  const connector = new IkaSuiDWalletConnector({
    env: {
      IKA_SUI_ADDRESS: "0x0000000000000000000000000000000000000000000000000000000000000001",
    },
  });
  const wallet = await connector.importExisting({
    dWalletId: "0xsui",
    chains: [suiChain],
    metadata: {
      suiAddress: "0x0000000000000000000000000000000000000000000000000000000000000001",
    },
  });

  assert.equal(wallet.addresses.sui, "0x0000000000000000000000000000000000000000000000000000000000000001");
  assert.equal(wallet.metadata.curve, "ED25519");
  assert.equal(wallet.metadata.signatureAlgorithm, "EdDSA");
  assert.equal(wallet.metadata.suiSignatureScheme, "ED25519");
  assert.equal(await connector.getAddress("0xsui", suiChain), "0x0000000000000000000000000000000000000000000000000000000000000001");

  await assert.rejects(
    () => connector.sign({
      dWalletId: "0xsui",
      targetChain: evmChain,
      payload: { kind: "evm-transaction", bytes: "{}" },
    }),
    /only supports real Sui dWallet signing/,
  );
});

test("Ika Sui connector requires Ika env before creating real dWallets", async () => {
  const connector = new IkaSuiDWalletConnector({ env: {} });

  await assert.rejects(
    () => connector.createDWallet({
      name: "sui-real-wallet",
      chains: [suiChain],
    }),
    /Missing required Ika ED25519 dWallet env vars/,
  );
});

test("call emits lifecycle events and persists idempotent receipts", async () => {
  const { ink, wallet } = await createClientAndWallet();
  const statuses = [];
  const receipts = [];

  ink.on("action:status", (event) => statuses.push(event.status));
  ink.on("action:receipt", (event) => receipts.push(event.receipt));

  const first = await ink.call(createEvmCall(wallet.id));
  const second = await ink.call(createEvmCall(wallet.id));

  assert.equal(first.actionId, second.actionId);
  assert.equal(first.status, "executed");
  assert.equal(receipts.length, 1);
  assert.deepEqual(statuses, ["built", "signing", "signed", "broadcast", "executed"]);
  assert.match(first.transaction.hash, /^0x/);
  assert.match(first.transaction.explorerUrl, /testnet\.bscscan\.com\/tx\//);
});

test("ethers EVM helper fills transaction fields and supports sign-only results", async () => {
  const calls = [];
  const provider = {
    async getTransactionCount(address, tag) {
      calls.push(["getTransactionCount", address, tag]);
      return 7;
    },
    async getFeeData() {
      calls.push(["getFeeData"]);
      return { gasPrice: 2_000_000_000n };
    },
    async estimateGas(request) {
      calls.push(["estimateGas", request]);
      return 21_000n;
    },
  };
  const signerAddress = "0x0000000000000000000000000000000000000001";
  const adapter = createEthersEvmAdapter({
    chain: evmChain,
    provider,
    signerAddress,
  });
  const built = await adapter.buildTransaction(createEvmCall("dwallet_001"));
  const tx = built.nativeTransaction;

  assert.equal(tx.from, signerAddress);
  assert.equal(tx.nonce, 7);
  assert.equal(tx.gas, "21000");
  assert.equal(tx.gasPrice, "2000000000");
  assert.deepEqual(calls.map(([name]) => name), ["getTransactionCount", "estimateGas", "getFeeData"]);

  const wallet = ethers.Wallet.createRandom();
  const rawTransaction = await wallet.signTransaction({
    chainId: evmChain.chainId,
    to: "0x0000000000000000000000000000000000000001",
    nonce: 0,
    gasLimit: 21_000,
    gasPrice: 1_000_000_000,
    value: 0,
  });
  const rpc = createEthersEvmRpc({
    chain: evmChain,
    provider,
    signerAddress,
    broadcast: false,
  });
  const result = await rpc.broadcastRawTransaction(rawTransaction, evmChain);
  const receipt = await rpc.waitForReceipt(result, evmChain);

  assert.equal(result.hash, ethers.Transaction.from(rawTransaction).hash);
  assert.equal(receipt.confirmed, false);
  assert.equal(receipt.raw.broadcastSkipped, true);
});

test("ethers EVM helper broadcasts and waits when enabled", async () => {
  const wallet = ethers.Wallet.createRandom();
  const rawTransaction = await wallet.signTransaction({
    chainId: evmChain.chainId,
    to: "0x0000000000000000000000000000000000000001",
    nonce: 0,
    gasLimit: 21_000,
    gasPrice: 1_000_000_000,
    value: 0,
  });
  const provider = {
    async getTransactionCount() {
      return 0;
    },
    async getFeeData() {
      return { gasPrice: 1_000_000_000n };
    },
    async estimateGas() {
      return 21_000n;
    },
    async broadcastTransaction(raw) {
      return { hash: ethers.Transaction.from(raw).hash };
    },
    async waitForTransaction(hash, confirmations, timeoutMs) {
      return {
        hash,
        status: 1,
        blockNumber: 42,
        gasUsed: 21_000n,
        confirmations,
        timeoutMs,
      };
    },
  };
  const rpc = createEthersEvmRpc({
    chain: evmChain,
    provider,
    signerAddress: "0x0000000000000000000000000000000000000001",
    broadcast: true,
    confirmations: 2,
    timeoutMs: 5000,
  });

  const result = await rpc.broadcastRawTransaction(rawTransaction, evmChain);
  const receipt = await rpc.waitForReceipt(result, evmChain);

  assert.equal(receipt.confirmed, true);
  assert.equal(receipt.blockNumber, 42);
  assert.equal(receipt.gasUsed, "21000");
  assert.equal(receipt.raw.confirmations, 2);
  assert.equal(receipt.raw.timeoutMs, 5000);
});

test("policy controls allow valid EVM calls and reject unsafe calls before signing", async () => {
  const allowed = new InkClient({
    chains: [evmChain],
    ika: { connector: new TestIkaConnector() },
    policies: {
      allowedChains: [evmChain],
      allowedEvmContracts: ["0xae13d989dac2f0debff460ac112a837c89baa7cd"],
      allowedFunctions: ["transfer"],
      maxEvmValue: "0",
      requireIdempotencyKey: true,
    },
  });
  const allowedWallet = await allowed.dwallet.create({
    name: "policy-wallet",
    chains: [evmChain],
  });
  const receipt = await allowed.call(createEvmCall(allowedWallet.id, "policy-ok"));
  assert.equal(receipt.status, "executed");

  const rejectedStatuses = [];
  allowed.on("action:status", (event) => rejectedStatuses.push(event.status));
  const disallowed = createEvmCall(allowedWallet.id, "policy-bad-contract");
  disallowed.target.contract = "0x0000000000000000000000000000000000000002";
  await assert.rejects(
    () => allowed.call(disallowed),
    /EVM contract is not allowed/,
  );
  assert.equal(rejectedStatuses.at(-1), "failed");

  await assert.rejects(
    () => allowed.call({
      ...createEvmCall(allowedWallet.id),
      execution: { waitForReceipt: true },
    }),
    /idempotencyKey is required/,
  );
});

test("invalid EVM targets fail before signing", async () => {
  const { ink, wallet } = await createClientAndWallet();
  const call = createEvmCall(wallet.id, "invalid-contract");
  call.target.contract = "not-an-address";

  await assert.rejects(
    () => ink.call(call),
    /Invalid EVM contract address/,
  );
});

test("default Sui adapter refuses fake execution without real RPC hooks", async () => {
  const ink = createInkClient({
    chains: [suiChain],
    ika: { connector: new TestIkaConnector() },
  });
  const wallet = await ink.dwallet.create({
    name: "sui-wallet",
    chains: [suiChain],
  });

  await assert.rejects(
    () => ink.call({
      targetChain: suiChain,
      target: {
        packageId: "0x2",
        module: "coin",
        functionName: "value",
        arguments: [],
      },
      signing: {
        provider: "ika",
        dWalletId: wallet.id,
      },
      execution: {
        waitForReceipt: true,
      },
    }),
    /Sui submitTransaction RPC hook is required/,
  );
});

test("default Solana adapter refuses fake execution without real RPC hooks", async () => {
  const ink = createInkClient({
    chains: [solanaChain],
    ika: { connector: new TestIkaConnector() },
  });
  const wallet = await ink.dwallet.create({
    name: "solana-wallet",
    chains: [solanaChain],
  });

  await assert.rejects(
    () => ink.call({
      targetChain: solanaChain,
      target: {
        programId: "Program1111111111111111111111111111111111",
        instruction: "rebalance",
        accounts: [
          { pubkey: "Vault111111111111111111111111111111111", isSigner: false, isWritable: true },
        ],
        args: {},
      },
      signing: {
        provider: "ika",
        dWalletId: wallet.id,
      },
      execution: {
        waitForReceipt: true,
      },
    }),
    /Solana sendTransaction RPC hook is required/,
  );
});
