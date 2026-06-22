# Ink SDK

Ink is a developer-first programmable cross-chain function execution SDK powered by Ika/dWallet signing.

Ink lets developers call blockchain functions through one SDK while Ika/dWallet provides programmable signing. A developer defines the target chain, contract/program/module, function, args, and signing method; Ink builds the native transaction for that chain, routes it through Ika/dWallet signing, attaches the returned signature, executes or returns the signed transaction, and gives back a clean receipt.

Ink supports EVM chains, Solana, and Sui through chain adapters. For EVM, it builds ABI function calls, estimates gas, creates the EVM transaction, gets an Ika-backed secp256k1 signature, serializes the signed transaction, and can broadcast it. For Solana, the SDK is structured around program instruction creation, message serialization, dWallet-backed signing, transaction send, and confirmation. For Sui, it supports Move-call style execution and Ika/dWallet coordination through the Sui/Ika testnet environment.

The goal is programmable cross-chain execution for DeFi apps, automation, AI agents, vaults, protocols, and developer tools that need to perform real actions across multiple chains without rebuilding signing and transaction logic for every network.

## Documentation

- [Integration Guide](docs/INTEGRATION.md) - install, configure, create/import dWallets, call functions, use storage/idempotency, and run the real Ika EVM signing proof.
- [Real Testnet Checklist](examples/REAL_TESTNET.md) - live proof commands, Ika env shape, and execution requirements.

## Install From npm

```bash
npm install @ink/sdk @ink/ika-connector
```

## Product Line

Ink is a programmable cross-chain function-call SDK.

Sharper:

EVM by chain ID. Solana by program instruction. Sui by Move call. Ika signs. Ink executes.

## Packages

This repository is organized as a TypeScript workspace:

- `@ink/sdk` - core client, `createInkClient()`, `ink.call()`, `ink.batch()`, lifecycle events, status, receipts, chain configuration, and dWallet facade.
- `@ink/evm` - EVM adapter for ABI calls, transaction building, signing payloads, signature attachment, broadcast, and receipts.
- `@ink/solana` - Solana adapter for native program instructions, message serialization, signature attachment, send, confirm, and receipts.
- `@ink/sui` - Sui adapter for Move calls and programmable transaction execution.
- `@ink/ika-connector` - Ika/dWallet connector for provisioning, metadata, chain addresses, signing requests, and signature return.
- `@ink/react` - React bindings for apps that want hooks around the core SDK.

## Core Flow

```ts
const receipt = await ink.call({
  targetChain: {
    type: "evm",
    chainId: 56,
  },
  target: {
    contract: "0xContract",
    abi,
    functionName: "execute",
    args: ["arg1", "arg2"],
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
```

Internal execution:

1. Developer defines the target chain and target function.
2. Ink selects the correct chain adapter.
3. The adapter builds the native transaction format.
4. The adapter creates the correct signing payload.
5. Ink sends the signing payload to Ika/dWallet.
6. Ika/dWallet returns a chain-compatible signature.
7. The adapter attaches the signature to the transaction.
8. The adapter broadcasts to the target chain RPC.
9. Ink tracks confirmation.
10. Ink returns a clean receipt.

## dWallet Modes

Ink supports two dWallet modes:

- Existing dWallet mode: pass an already-created `dWalletId`.
- Custom dWallet mode: create/provision a dWallet through Ink.

```ts
const dwallet = await ink.dwallet.create({
  name: "project-executor",
  chains: [
    { type: "evm", chainId: 1 },
    { type: "evm", chainId: 56 },
    { type: "evm", chainId: 8453 },
    { type: "solana", cluster: "mainnet-beta" },
    { type: "sui", network: "mainnet" },
  ],
  config: {
    purpose: "cross_chain_execution",
    appId: "my_app_001",
  },
});
```

## Final Developer Goal

```ts
import { createInkClient } from "@ink/sdk";
import { IkaEvmSigningConnector } from "@ink/ika-connector";

const ink = createInkClient({
  mode: "production",
  projectId: "project_123",
  ika: {
    network: "testnet",
    connector: new IkaEvmSigningConnector({
      env: process.env,
    }),
  },
  chains: [
    { type: "evm", chainId: 56 },
    { type: "solana", cluster: "devnet" },
    { type: "sui", network: "testnet" },
  ],
});

ink.on("action:status", ({ actionId, status }) => {
  console.info("[ink]", actionId, status);
});

const dwallet = await ink.dwallet.create({
  name: "project-executor",
  chains: [
    { type: "evm", chainId: 56 },
    { type: "solana", cluster: "devnet" },
    { type: "sui", network: "testnet" },
  ],
});

const receipt = await ink.call({
  targetChain: {
    type: "evm",
    chainId: 56,
  },
  target: {
    contract: "0xContract",
    abi,
    functionName: "execute",
    args: ["arg1", "arg2"],
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
```

Create dWallet. Define function. Sign with Ika. Execute across chains. Return receipt.

## Current SDK Capabilities

- `ink.call()` orchestrates build -> signing payload -> Ika/dWallet signing -> signature attachment -> submit -> receipt.
- `ink.batch()` runs multiple calls sequentially and returns all receipts.
- `ink.estimate()` asks the selected chain adapter for gas, fee, or compute estimates when available.
- `ink.getStatus()` and `ink.getReceipt()` expose execution state and stored receipts.
- `ink.on("action:status" | "action:receipt" | "action:error")` exposes lifecycle events for product UI, logs, and reconciliation.
- `ink.dwallet.create()`, `ink.dwallet.importExisting()`, `ink.dwallet.get()`, `ink.dwallet.list()`, `ink.dwallet.getAddress()`, and `ink.dwallet.linkChains()` provide the dWallet facade.
- Optional `storage` lets apps persist receipts, statuses, idempotency keys, and dWallet metadata.
- `createJsonFileStorage(path)` provides a Node-friendly JSON storage implementation for local tools and examples.
- `@ink/evm` now uses real ABI calldata encoding through `ethers.Interface`.
- `IkaEvmSigningConnector` performs the real Ika EVM signing path for BNB/EVM testnet flows.

Production mode requires a real Ika connector. If `mode: "production"` is used without `ika.connector`, the SDK throws during client creation instead of silently using the development connector. `IkaEvmSigningConnector` is the production Ika/Sui EVM signing connector; it validates the required Ika env vars, uses a real Sui RPC client plus Ika network config, and refuses mock dWallet creation or mock non-EVM signing.

## Storage and Idempotency

```ts
import { InkClient, createJsonFileStorage } from "@ink/sdk";

const ink = new InkClient({
  storage: await createJsonFileStorage(".ink/ink-store.json"),
});

const receipt = await ink.call({
  targetChain,
  target,
  signing,
  execution: {
    waitForReceipt: true,
    idempotencyKey: "treasury-payout-001",
  },
});
```

When the same `idempotencyKey` is used again, Ink returns the stored receipt instead of sending a duplicate call.

## Real Ika Presign Refresh

For live Ika EVM signing, presigns are consumable. Refresh manually:

```bash
npm run ika:refresh-presign
```

Or refresh automatically before the signing proof:

```bash
INK_AUTO_REFRESH_IKA_PRESIGN=true npm run proof:ika-sign-bnb
```

Use `IKA_GAS_COIN_ID`, `IKA_SIGN_GAS_COIN_ID`, `IKA_REFRESH_PRESIGN_GAS_BUDGET`, and `IKA_SIGN_GAS_BUDGET` to select funded Sui testnet gas coins for Ika operations.

## Proof Examples

For complete setup and integration instructions, see [docs/INTEGRATION.md](docs/INTEGRATION.md).

Run the local mock proof milestone:

```bash
npm run proof
```

The proof script demonstrates the current end-to-end SDK path for all supported chain types:

1. Create a dWallet through Ink.
2. Call an EVM contract function.
3. Call a Solana program instruction.
4. Call a Sui Move function.
5. Mock sign each native transaction payload through the in-memory Ika connector.
6. Return and assert executed receipts.
7. Persist dWallets, statuses, receipts, and idempotency mappings in `.ink/proof-store.json`.

The example lives at `examples/proof-execution.mjs`.

Run the live testnet data proof:

```bash
npm run proof:testnet
```

This uses real public testnet RPCs to fetch current chain data for:

- EVM Sepolia
- Solana devnet
- Sui testnet

It creates an Ink dWallet record, resolves its chain addresses, reads real nonce/block/gas/slot/checkpoint data, and prints a JSON evidence object.

This script intentionally does not return a fake executed receipt. A real executed testnet receipt requires a funded testnet dWallet and a real Ika signing connector capable of returning chain-valid signatures.

See `examples/REAL_TESTNET.md` for the execution checklist.

Discover the active Sui CLI wallet's real Ika testnet objects:

```bash
npm run proof:ika-sui
```

Call real public functions on BNB Smart Chain testnet:

```bash
npm run proof:bnb-public
```

The BNB proof calls `name()`, `symbol()`, `decimals()`, and `totalSupply()` on the WBNB testnet contract using `eth_call`.

Run the real Ika EVM signing proof for BNB testnet:

```bash
npm run proof:ika-sign-bnb
```

This consumes the Ika signing environment from `../.env`, creates a real Ika signing request on Sui, receives the ECDSA signature, attaches it to a BNB testnet EVM transaction, and returns the signed transaction receipt object. It does not broadcast by default. Set `INK_BROADCAST_IKA_SIGNED_TX=true` only when the Ika EVM address is funded and you intentionally want to spend BNB testnet gas.

## Integration Roadmap

The repo now contains the SDK hooks for the full product path. Remaining production integrations are:

- Real Ika dWallet provisioning behind `ink.dwallet.create()`.
- Automatic production presign pools instead of example-level refresh scripts.
- Fully native Solana transaction serialization, dWallet signing, and broadcast.
- Fully native Sui programmable transaction construction, signing, and broadcast.
- Policy controls for spending limits, transaction simulation, replay protection, and scoped signing.
