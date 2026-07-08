# Ink SDK Integration Guide

Ink is a developer-first SDK for programmable cross-chain execution. Developers bring the chain, function, and arguments; Ink builds the chain action payload, routes the signing payload to a connector, attaches the returned signature or signed transaction, submits when a real adapter is configured, and returns a receipt.

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
| Existing real Ika dWallet import | Implemented |
| Real Ika EVM signing | Implemented and tested on Ika/Sui testnet |
| Real Ika Solana ED25519 dWallet creation | Implemented through `IkaSolanaDWalletConnector` |
| Real Ika Solana ED25519 message signing | Implemented for `solana-message` payloads |
| Real Ika Sui ED25519 dWallet creation | Implemented through `IkaSuiDWalletConnector` |
| Real Ika Sui transaction-byte signing | Implemented for `sui-transaction` bytes with Sui intent |
| EVM ABI calldata encoding | Implemented with `ethers.Interface` |
| EVM broadcast | Implemented when RPC broadcaster and target-chain gas are available |
| Built-in ethers EVM RPC helpers | Implemented |
| Storage and idempotency | Implemented |
| Production mode connector guard | Implemented |
| SDK-side policy controls | Implemented |
| Lifecycle events | Implemented |
| Solana adapter shape | Implemented as adapter foundation |
| Solana fake execution fallback | Removed; real send/confirm hooks are required |
| Native Solana signing/broadcast | Integration pending |
| Sui adapter shape | Implemented as adapter foundation; no fake execution fallback |
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
import { createEthersEvmAdapter } from "@ink-sdk/evm";
import { IkaEvmSigningConnector } from "@ink-sdk/ika-connector";
import { createInkClient } from "@ink-sdk/sdk";
```

When published, apps should install the packages they need:

```bash
npm install @ink-sdk/sdk @ink-sdk/evm @ink-sdk/ika-connector
```

For the standard production EVM path, install the SDK and Ika connector directly:

```bash
npm install @ink-sdk/sdk @ink-sdk/evm @ink-sdk/ika-connector
```

## Create a Client

```ts
import { createEthersEvmAdapter } from "@ink-sdk/evm";
import { IkaEvmSigningConnector } from "@ink-sdk/ika-connector";
import { createInkClient } from "@ink-sdk/sdk";

const ink = createInkClient({
  mode: "production",
  projectId: "my-project",
  ika: {
    network: "testnet",
    connector: new IkaEvmSigningConnector({
      env: process.env,
    }),
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
  adapters: [
    createEthersEvmAdapter({
      chain: {
        type: "evm",
        chainId: 97,
        rpcUrl: "https://bsc-testnet-rpc.publicnode.com",
        explorerUrl: "https://testnet.bscscan.com",
      },
      rpcUrl: "https://bsc-testnet-rpc.publicnode.com",
      signerAddress: process.env.IKA_ETH_ADDRESS!,
      broadcast: false,
    }),
  ],
});
```

If `chains` is set, Ink rejects calls to chains that are not configured. If `chains` is omitted, Ink allows any chain supported by the configured adapters.

InkClient requires a real `ika.connector`. Without one, client creation fails immediately. `IkaEvmSigningConnector` validates the base Ika/Sui env vars during construction, can create SECP256K1 dWallets, and signs EVM payloads through the Ika signing transaction flow.

Required production Ika env vars:

```bash
IKA_NETWORK=testnet
IKA_SUI_RPC=https://fullnode.testnet.sui.io:443
IKA_SUI_PRIVATE_KEY=suiprivkey...
IKA_COIN_ID=0x...
IKA_SUI_COIN_ID=0x...
```

For signing with an already-created EVM dWallet, also provide `IKA_DWALLET_ID`, `IKA_DWALLET_CAP_ID`, `IKA_PRESIGN_ID`, `IKA_UNVERIFIED_PRESIGN_CAP_ID`, and `IKA_ETH_ADDRESS`, or import/store those values from the wallet record returned by `ink.dwallet.create()`.

## dWallet Setup

Ink exposes dWallet operations through `ink.dwallet`.

### Create a Real Ika dWallet

```ts
import { IkaEvmSigningConnector } from "@ink-sdk/ika-connector";

const ink = new InkClient({
  mode: "production",
  ika: { connector: new IkaEvmSigningConnector({ env: process.env }) },
  chains: [{ type: "evm", chainId: 97 }],
});

const dwallet = await ink.dwallet.create({
  name: "project-executor",
  chains: [{ type: "evm", chainId: 97 }],
  config: {
    purpose: "cross_chain_execution",
    appId: "my_app",
  },
});
```

This submits the Ika DKG transaction through Sui, waits for the dWallet to become active, derives the EVM address, creates a presign, and returns the real Ika object IDs needed for later signing. Use `IkaSolanaDWalletConnector` or `IkaSuiDWalletConnector` the same way for ED25519 Solana/Sui wallets.

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
    source: "ika",
    signerAddress: process.env.IKA_ETH_ADDRESS,
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

## Create a Real Ika Solana dWallet

Use `IkaSolanaDWalletConnector` when you want Ika to create an ED25519 dWallet and derive a Solana address.

```ts
import { IkaSolanaDWalletConnector } from "@ink-sdk/ika-connector";
import { InkClient } from "@ink-sdk/sdk";

const ink = new InkClient({
  mode: "production",
  ika: {
    network: "testnet",
    connector: new IkaSolanaDWalletConnector({ env: process.env }),
  },
  chains: [{ type: "solana", cluster: "devnet" }],
});

const dwallet = await ink.dwallet.create({
  name: "solana-ed25519-wallet",
  chains: [{ type: "solana", cluster: "devnet" }],
});

const solanaAddress = await ink.dwallet.getAddress(dwallet.id, {
  type: "solana",
  cluster: "devnet",
});
```

Minimum env for creation:

```bash
IKA_NETWORK=testnet
IKA_SUI_RPC=https://sui-testnet-rpc.publicnode.com
IKA_SUI_PRIVATE_KEY=suiprivkey...
IKA_COIN_ID=0x...
IKA_SUI_COIN_ID=0x...
```

Recommended env for stable production use:

```bash
IKA_SOLANA_USER_SHARE_ENCRYPTION_KEYS_B64=...
IKA_SOLANA_DWALLET_ID=0x...
IKA_SOLANA_DWALLET_CAP_ID=0x...
IKA_SOLANA_PRESIGN_ID=0x...
IKA_SOLANA_UNVERIFIED_PRESIGN_CAP_ID=0x...
IKA_SOLANA_ENCRYPTED_USER_SECRET_KEY_SHARE_ID=0x...
IKA_SOLANA_ADDRESS=...
```

The connector signs `solana-message` payload bytes with Ika ED25519/EdDSA/SHA512. Full Solana transaction execution still requires a Solana adapter that supplies real serialized message bytes plus send/confirm RPC hooks.

## Create a Real Ika Sui dWallet

Use `IkaSuiDWalletConnector` when you want Ika to create an ED25519 dWallet and derive a Sui address.

```ts
import { IkaSuiDWalletConnector } from "@ink-sdk/ika-connector";
import { InkClient } from "@ink-sdk/sdk";

const ink = new InkClient({
  mode: "production",
  ika: {
    network: "testnet",
    connector: new IkaSuiDWalletConnector({ env: process.env }),
  },
  chains: [{ type: "sui", network: "testnet" }],
});

const dwallet = await ink.dwallet.create({
  name: "sui-ed25519-wallet",
  chains: [{ type: "sui", network: "testnet" }],
});

const suiAddress = await ink.dwallet.getAddress(dwallet.id, {
  type: "sui",
  network: "testnet",
});
```

Minimum env for creation:

```bash
IKA_NETWORK=testnet
IKA_SUI_RPC=https://sui-testnet-rpc.publicnode.com
IKA_SUI_PRIVATE_KEY=suiprivkey...
IKA_COIN_ID=0x...
IKA_SUI_COIN_ID=0x...
```

Recommended env for stable production use:

```bash
IKA_SUI_USER_SHARE_ENCRYPTION_KEYS_B64=...
IKA_SUI_DWALLET_ID=0x...
IKA_SUI_DWALLET_CAP_ID=0x...
IKA_SUI_PRESIGN_ID=0x...
IKA_SUI_UNVERIFIED_PRESIGN_CAP_ID=0x...
IKA_SUI_ENCRYPTED_USER_SECRET_KEY_SHARE_ID=0x...
IKA_SUI_ADDRESS=0x...
```

The connector signs `sui-transaction` bytes using Sui transaction intent and returns `metadata.serializedSignature`. Full Sui execution still requires a Sui adapter hook that submits the transaction bytes with that serialized signature and waits for the digest.

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

The Solana adapter currently builds a native instruction-shaped payload and supports adapter hooks for send, confirm, and compute estimation. It no longer marks actions executed without real send/confirm hooks.

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

Production Sui support still needs native programmable transaction construction, signing, and execution against a real package. The default Sui adapter now refuses to generate fake digests or mark actions executed without RPC hooks.

## Use Persistent Storage

Ink can persist statuses, receipts, dWallet metadata, and idempotency mappings.

```ts
import { InkClient, createJsonFileStorage } from "@ink-sdk/sdk";

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

## Add SDK-Side Policies

Use policies to reject unsafe calls before Ink builds/signs a transaction:

```ts
const ink = new InkClient({
  policies: {
    allowedChains: [{ type: "evm", chainId: 97 }],
    allowedEvmContracts: ["0xae13d989dac2f0debff460ac112a837c89baa7cd"],
    allowedFunctions: ["transfer", "deposit"],
    maxEvmValue: "1000000000000000000",
    requireIdempotencyKey: true,
  },
});
```

Policy failures throw `InkPolicyError`, emit `action:error`, and mark the preflight action `failed`.

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

Use `IkaEvmSigningConnector` for the real Ika EVM signing path and `createEthersEvmAdapter()` for nonce, gas, broadcast, and receipt handling.

```ts
import { createEthersEvmAdapter } from "@ink-sdk/evm";
import { IkaEvmSigningConnector } from "@ink-sdk/ika-connector";
import { InkClient } from "@ink-sdk/sdk";

const chain = {
  type: "evm",
  chainId: 97,
  rpcUrl: "https://bsc-testnet-rpc.publicnode.com",
  explorerUrl: "https://testnet.bscscan.com",
};

const ink = new InkClient({
  projectId: "ika-bnb-signing",
  ika: {
    network: "testnet",
    connector: new IkaEvmSigningConnector({ env: process.env }),
  },
  chains: [chain],
  adapters: [
    createEthersEvmAdapter({
      chain,
      rpcUrl: chain.rpcUrl,
      signerAddress: process.env.IKA_ETH_ADDRESS!,
      broadcast: process.env.INK_BROADCAST_IKA_SIGNED_TX === "true",
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

1. Create a real Ika dWallet with `ink.dwallet.create()` and the connector for the target chain.
2. Use `ink.dwallet.importExisting()` only when the wallet was provisioned outside the SDK.
3. Add `createJsonFileStorage()` or a database-backed `InkStorage`.
4. Call an EVM testnet contract with `ink.call()`.
5. Use `IkaEvmSigningConnector` for real Ika signing.
6. Fund the dWallet EVM address on the target testnet.
7. Turn on broadcast and verify the target-chain receipt.
8. Add Solana/Sui native adapters as the next production integration layer.
