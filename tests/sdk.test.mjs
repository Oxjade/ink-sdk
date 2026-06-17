import assert from "node:assert/strict";
import test from "node:test";
import { InkClient, createInkClient } from "../packages/sdk/dist/index.js";

const evmChain = {
  type: "evm",
  chainId: 97,
  explorerUrl: "https://testnet.bscscan.com",
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

async function createClientAndWallet() {
  const ink = createInkClient({
    chains: [evmChain],
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

test("production mode refuses to use the development connector implicitly", () => {
  assert.throws(
    () => new InkClient({ mode: "production" }),
    /production mode requires a real Ika connector/,
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

test("invalid EVM targets fail before signing", async () => {
  const { ink, wallet } = await createClientAndWallet();
  const call = createEvmCall(wallet.id, "invalid-contract");
  call.target.contract = "not-an-address";

  await assert.rejects(
    () => ink.call(call),
    /Invalid EVM contract address/,
  );
});
