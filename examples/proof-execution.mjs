import assert from "node:assert/strict";
import { InkClient } from "@ink/sdk";

const chains = [
  {
    type: "evm",
    chainId: 56,
    explorerUrl: "https://bscscan.com",
  },
  {
    type: "solana",
    cluster: "devnet",
    explorerUrl: "https://explorer.solana.com",
  },
  {
    type: "sui",
    network: "testnet",
    explorerUrl: "https://suiexplorer.com",
  },
];

const ink = new InkClient({
  projectId: "proof_project_001",
  ika: {
    network: "mocknet",
  },
  chains,
});

const dwallet = await ink.dwallet.create({
  name: "proof-executor",
  chains,
  config: {
    purpose: "cross_chain_execution",
    appId: "proof_examples",
  },
});

console.log("created dWallet");
console.log(JSON.stringify(dwallet, null, 2));

const evmReceipt = await ink.call({
  targetChain: {
    type: "evm",
    chainId: 56,
    explorerUrl: "https://bscscan.com",
  },
  target: {
    contract: "0x1111111111111111111111111111111111111111",
    abi: [
      {
        type: "function",
        name: "buyAllocation",
        inputs: [
          { name: "saleId", type: "string" },
          { name: "amount", type: "uint256" },
          { name: "recipient", type: "address" },
        ],
      },
    ],
    functionName: "buyAllocation",
    args: ["sale_01", "100", "0x2222222222222222222222222222222222222222"],
    value: "0",
  },
  signing: {
    provider: "ika",
    dWalletId: dwallet.id,
  },
  execution: {
    waitForReceipt: true,
    returnExplorerUrl: true,
  },
});

const solanaReceipt = await ink.call({
  targetChain: {
    type: "solana",
    cluster: "devnet",
    explorerUrl: "https://explorer.solana.com",
  },
  target: {
    programId: "LaunchpadProgram11111111111111111111111111",
    instruction: "buy_allocation",
    accounts: [
      { pubkey: "BuyerAccount111111111111111111111111111", isSigner: false, isWritable: true },
      { pubkey: "SaleVault11111111111111111111111111111", isSigner: false, isWritable: true },
      { pubkey: "TokenMint11111111111111111111111111111", isSigner: false, isWritable: false },
    ],
    args: {
      saleId: "sale_01",
      amount: "100",
    },
  },
  signing: {
    provider: "ika",
    dWalletId: dwallet.id,
  },
  execution: {
    waitForReceipt: true,
    returnExplorerUrl: true,
  },
});

const suiReceipt = await ink.call({
  targetChain: {
    type: "sui",
    network: "testnet",
    explorerUrl: "https://suiexplorer.com",
  },
  target: {
    packageId: "0xpackage",
    module: "launchpad",
    functionName: "claim_tokens",
    typeArguments: ["0x2::sui::SUI"],
    arguments: ["0xSaleObject", "0xClaimCap", "100"],
  },
  signing: {
    provider: "ika",
    dWalletId: dwallet.id,
  },
  execution: {
    waitForReceipt: true,
    returnExplorerUrl: true,
  },
});

const receipts = {
  evm: evmReceipt,
  solana: solanaReceipt,
  sui: suiReceipt,
};

for (const [chain, receipt] of Object.entries(receipts)) {
  assert.equal(receipt.status, "executed", `${chain} receipt should execute`);
  assert.equal(receipt.receipt?.confirmed, true, `${chain} receipt should confirm`);
  assert.equal(receipt.signing.provider, "ika", `${chain} should use Ika signing`);
  assert.equal(receipt.signing.dWalletId, dwallet.id, `${chain} should use created dWallet`);

  const status = await ink.getStatus(receipt.actionId);
  const storedReceipt = await ink.getReceipt(receipt.actionId);
  assert.equal(status, "executed", `${chain} status should be tracked`);
  assert.deepEqual(storedReceipt, receipt, `${chain} receipt should be retrievable`);
}

console.log("proof receipts");
console.log(JSON.stringify(receipts, null, 2));
console.log("proof complete: create dWallet -> call function -> mock sign -> return receipt");

