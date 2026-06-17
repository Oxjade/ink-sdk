# Ink SDK Integration Guide

Ink is a developer-first SDK for programmable cross-chain execution. Developers bring the chain, function, and arguments; Ink builds the native transaction, routes the signing payload to Ika/dWallet, attaches the returned signature, submits when configured, and returns a receipt.

The core API is:

```ts
const receipt = await ink.call({
  targetChain,
  target,
  signing,
  execution,
});
```

## What You Can Build

Ink is designed for applications that need to perform real actions across chains without rebuilding chain-specific transaction logic every time:

- Cross-chain DeFi actions such as vault deposits, repayments, swaps, and treasury payouts.
- Agent-driven execution where an app or AI agent decides which chain function to call.
- Protocol automation that calls EVM contracts, Solana programs, and Sui Move functions through one SDK surface.
- dWallet-backed workflows where an Ika/dWallet signs native chain transactions.
- Receipt-driven systems that need status tracking, idempotency, and execution history.

## Current Capability Matrix

| Area | Status |
| --- | --- |
| Core `ink.call()` flow | Implemented |
| dWallet facade | Implemented |
| Local dWallet mock/dev connector | Implemented |
| Existing real Ika dWallet import | Implemented |
| Real Ika EVM signing | Implemented and tested on Ika/Sui testnet |
| EVM ABI calldata encoding | Implemented with `ethers.Interface` |
| EVM broadcast | Implemented when RPC broadcaster and target-chain gas are available |
| Storage and idempotency | Implemented |
| Production mode connector guard | Implemented |
| Lifecycle events | Implemented |
| Solana adapter shape | Implemented as adapter foundation |
| Native Solana signing/broadcast | Integration pending |
| Sui adapter shape | Implemented as adapter foundation |
| Native Sui Move execution/broadcast | Integration pending |
| Real Ika dWallet provisioning from `ink.dwallet.create()` | Integration pending |

## Install

Inside this workspace:

```bash
npm install
npm run build
```

Package names used by the SDK:

```ts
import { createInkClient } from "@ink/sdk";
import { EvmAdapter } from "@ink/evm";
import { IkaEvmSigningConnector } from "@ink/ika-connector";
```

When published, apps should install the packages they need:

```bash
npm install @ink/sdk @ink/evm @ink/ika-connector
```

## Create a Client

```ts
import { createInkClient } from "@ink/sdk";
import { IkaEvmSigningConnector } from "@ink/ika-connector";

const ink = createInkClient({
  mode: "production",
  projectId: "my-project",
  ika: {
    network: "testnet",
    connector: new IkaEvmSigningConnector(),
  },
  chains: [
    {
      type: "evm",
      chainId: 97,
      rpcUrl: "https://bsc-testnet-rpc.publicnode.com",
      explorerUrl: "https://testnet.bscscan.com",
    },
    {
      type: "solana",
      cluster: "devnet",
      rpcUrl: "https://api.devnet.solana.com",
      explorerUrl: "https://explorer.solana.com",
    },
    {
      type: "sui",
      network: "testnet",
      rpcUrl: "https://sui-testnet-rpc.publicnode.com",
      explorerUrl: "https://suiscan.xyz/testnet",
    },
  ],
});
```

If `chains` is set, Ink rejects calls to chains that are not configured. If `chains` is omitted, Ink allows any chain supported by the configured adapters.

Production mode requires a real `ika.connector`. Without one, client creation fails immediately so a mock signer cannot accidentally ship to users.

## dWallet Setup

Ink exposes dWallet operations through `ink.dwallet`.

### Create a dWallet Record

```ts
const dwallet = await ink.dwallet.create({
  name: "project-executor",
  chains: [
    { type: "evm", chainId: 97 },
    { type: "solana", cluster: "devnet" },
    { type: "sui", network: "testnet" },
  ],
  config: {
    purpose: "cross_chain_execution",
    appId: "my_app",
  },
});
```

In the default local connector, this creates a deterministic development dWallet record. In production, wire `ink.dwallet.create()` to a real Ika provisioning connector once that API is available.

### Import an Existing Ika dWallet

Use this when you already have an Ika dWallet ID and want Ink to call functions with it:

```ts
await ink.dwallet.importExisting({
  dWalletId: "0x5fba...",
  chains: [
    {
      type: "evm",
      chainId: 97,
      rpcUrl: "https://bsc-testnet-rpc.publicnode.com",
      explorerUrl: "https://testnet.bscscan.com",
    },
  ],
  metadata: {
    source: "ika-testnet",
    signerAddress: "0x04b40c698F241fE2AeE37f9e368A55408070C576",
  },
});
```

### Other dWallet Helpers

```ts
await ink.dwallet.get(dwallet.id);
await ink.dwallet.list();
await ink.dwallet.getAddress(dwallet.id, { type: "evm", chainId: 97 });
await ink.dwallet.linkChains(dwallet.id, [{ type: "sui", network: "testnet" }]);
```

## Call an EVM Contract Function

EVM calls use ABI encoding through `ethers.Interface`.

```ts
const receipt = await ink.call({
  targetChain: {
    type: "evm",
    chainId: 97,
    rpcUrl: "https://bsc-testnet-rpc.publicnode.com",
    explorerUrl: "https://testnet.bscscan.com",
  },
  target: {
    contract: "0xae13d989dac2f0debff460ac112a837c89baa7cd",
    abi: [
      {
        type: "function",
        name: "symbol",
        inputs: [],
        outputs: [{ name: "", type: "string" }],
        stateMutability: "view",
      },
    ],
    functionName: "symbol",
    args: [],
    value: "0",
  },
  signing: {
    provider: "ika",
    dWalletId: dwallet.id,
  },
  execution: {
    waitForReceipt: true,
    returnExplorerUrl: true,
    idempotencyKey: "bnb-wbnb-symbol-001",
  },
});
```

The returned receipt has a stable shape:

```ts
receipt.actionId;
receipt.status;
receipt.transaction?.hash;
receipt.transaction?.explorerUrl;
receipt.receipt?.confirmed;
```

## Call a Solana Program Instruction

The Solana adapter currently builds a native instruction-shaped payload and supports adapter hooks for send, confirm, and compute estimation.

```ts
await ink.call({
  targetChain: {
    type: "solana",
    cluster: "devnet",
    explorerUrl: "https://explorer.solana.com",
  },
  target: {
    programId: "Program1111111111111111111111111111111111",
    instruction: "rebalance_vault",
    accounts: [
      { pubkey: "Vault111111111111111111111111111111111", isSigner: false, isWritable: true },
      { pubkey: "Authority111111111111111111111111111111", isSigner: false, isWritable: false },
    ],
    args: {
      amount: "1000000",
    },
  },
  signing: {
    provider: "ika",
    dWalletId: dwallet.id,
  },
  execution: {
    waitForReceipt: true,
  },
});
```

Production Solana support still needs native message serialization and a real dWallet-compatible signature flow.

## Call a Sui Move Function

The Sui adapter currently builds a Move-call-shaped transaction payload and supports adapter hooks for submit, wait, and fee estimation.

```ts
await ink.call({
  targetChain: {
    type: "sui",
    network: "testnet",
    explorerUrl: "https://suiscan.xyz/testnet",
  },
  target: {
    packageId: "0xpackage",
    module: "vault",
    functionName: "deposit",
    typeArguments: ["0x2::sui::SUI"],
    arguments: ["0xVaultObject", "1000000"],
  },
  signing: {
    provider: "ika",
    dWalletId: dwallet.id,
  },
  execution: {
    waitForReceipt: true,
  },
});
```

Production Sui support still needs native programmable transaction construction and execution against a real package.

## Use Persistent Storage

Ink can persist statuses, receipts, dWallet metadata, and idempotency mappings.

```ts
import { InkClient, createJsonFileStorage } from "@ink/sdk";

const ink = new InkClient({
  storage: await createJsonFileStorage(".ink/ink-store.json"),
});
```

Use an idempotency key when an operation must not be duplicated:

```ts
const receipt = await ink.call({
  targetChain,
  target,
  signing,
  execution: {
    waitForReceipt: true,
    idempotencyKey: "vault-rebalance-2026-06-17",
  },
});
```

If the same idempotency key is used again, Ink returns the stored receipt.

## Subscribe to Lifecycle Events

```ts
const unsubscribeStatus = ink.on("action:status", ({ actionId, status }) => {
  console.info("[ink]", actionId, status);
});

const unsubscribeReceipt = ink.on("action:receipt", ({ receipt }) => {
  reconcileReceipt(receipt);
});

ink.on("action:error", ({ actionId, error }) => {
  reportExecutionFailure(actionId, error);
});

unsubscribeStatus();
unsubscribeReceipt();
```

For production apps, implement the `InkStorage` interface with your database:

```ts
const storage = {
  async setReceipt(receipt) {
    await db.receipts.upsert(receipt);
  },
  async getReceipt(actionId) {
    return db.receipts.find(actionId);
  },
  async setStatus(actionId, status) {
    await db.statuses.upsert({ actionId, status });
  },
};
```

## Real Ika EVM Signing

Use `IkaEvmSigningConnector` for the real Ika EVM signing path.

```ts
import { InkClient } from "@ink/sdk";
import { EvmAdapter } from "@ink/evm";
import { IkaEvmSigningConnector } from "@ink/ika-connector";

const ink = new InkClient({
  projectId: "ika-bnb-signing",
  ika: {
    network: "testnet",
    connector: new IkaEvmSigningConnector({ env: process.env }),
  },
  chains: [
    {
      type: "evm",
      chainId: 97,
      rpcUrl: "https://bsc-testnet-rpc.publicnode.com",
      explorerUrl: "https://testnet.bscscan.com",
    },
  ],
  adapters: [
    new EvmAdapter({
      // Supply RPC hooks in production so Ink can fetch nonce/gas,
      // broadcast raw txs, and wait for receipts.
    }),
  ],
});
```

Required environment values for the current Ika testnet proof:

```bash
IKA_NETWORK=testnet
IKA_SUI_RPC=https://sui-testnet-rpc.publicnode.com
IKA_SUI_PRIVATE_KEY=suiprivkey...
IKA_ETH_ADDRESS=0x...
IKA_DWALLET_ID=0x...
IKA_DWALLET_CAP_ID=0x...
IKA_PRESIGN_ID=0x...
IKA_UNVERIFIED_PRESIGN_CAP_ID=0x...
IKA_COIN_ID=0x...
IKA_SUI_COIN_ID=0x...
IKA_USER_SHARE_ENCRYPTION_KEYS_B64=...
```

Optional gas and execution controls:

```bash
IKA_GAS_COIN_ID=0x...
IKA_SIGN_GAS_COIN_ID=0x...
IKA_REFRESH_PRESIGN_GAS_BUDGET=50000000
IKA_SIGN_GAS_BUDGET=100000000
IKA_SIGN_TIMEOUT_MS=180000
IKA_SIGN_POLL_INTERVAL_MS=3000
INK_AUTO_REFRESH_IKA_PRESIGN=true
INK_BROADCAST_IKA_SIGNED_TX=false
```

Run the live proof:

```bash
INK_AUTO_REFRESH_IKA_PRESIGN=true npm run proof:ika-sign-bnb
```

By default, the proof signs but does not broadcast. To broadcast on BNB testnet, fund the Ika EVM signer address with tBNB and run:

```bash
INK_BROADCAST_IKA_SIGNED_TX=true npm run proof:ika-sign-bnb
```

## Run Included Proofs

Mock end-to-end SDK proof:

```bash
npm run proof:mock
```

Live public BNB testnet reads:

```bash
npm run proof:bnb-public
```

Real Ika/Sui object discovery:

```bash
npm run proof:ika-sui
```

Real Ika EVM signing proof:

```bash
INK_AUTO_REFRESH_IKA_PRESIGN=true npm run proof:ika-sign-bnb
```

## Status Values

Ink tracks:

| Status | Meaning |
| --- | --- |
| `built` | Native transaction was built |
| `signing` | Signing payload was sent to Ika/dWallet |
| `signed` | Signature or signed transaction was returned |
| `broadcast` | Transaction was submitted or prepared for submission |
| `executed` | Target-chain confirmation was fetched |
| `sign_failed` | Signing stage failed |
| `broadcast_failed` | Submit or receipt stage failed |
| `failed` | Generic failure state |

## Production Notes

- Do not mark a transaction `executed` unless a target-chain RPC accepted it and a real receipt/confirmation was fetched.
- Use idempotency keys for user actions, treasury operations, and automation jobs.
- Persist receipts and dWallet metadata outside process memory for real apps.
- Simulate transactions before signing when the target chain supports simulation.
- Add policy controls for limits, allowed contracts/programs, allowed functions, and replay protection.
- Keep private keys and user-share material out of source control and logs.

## Recommended Integration Path

1. Start with `npm run proof:mock` to understand the SDK flow.
2. Use `ink.dwallet.importExisting()` with a known Ika dWallet.
3. Add `createJsonFileStorage()` or a database-backed `InkStorage`.
4. Call an EVM testnet contract with `ink.call()`.
5. Use `IkaEvmSigningConnector` for real Ika signing.
6. Fund the dWallet EVM address on the target testnet.
7. Turn on broadcast and verify the target-chain receipt.
8. Add Solana/Sui native adapters as the next production integration layer.
