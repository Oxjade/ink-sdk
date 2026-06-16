# Ink SDK

Ink is a developer-first programmable cross-chain function execution SDK powered by Ika/dWallet signing.

It is not a wallet-support product, wallet UX layer, mint SDK, payment SDK, launchpad-only SDK, or a set of hardcoded actions. The core primitive is `ink.call()`: developers bring the function, Ink builds the native transaction, Ika signs with a dWallet, and Ink executes on the target chain.

## Product Line

Ink is a programmable cross-chain function-call SDK.

Sharper:

EVM by chain ID. Solana by program instruction. Sui by Move call. Ika signs. Ink executes.

## Packages

This repository is organized as a TypeScript workspace:

- `@ink/sdk` - core client, `ink.call()`, `ink.batch()`, status, receipts, chain configuration, and dWallet facade.
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
import { InkClient } from "@ink/sdk";

const ink = new InkClient({
  projectId: "project_123",
  ika: {
    network: "testnet",
  },
  chains: [
    { type: "evm", chainId: 56 },
    { type: "solana", cluster: "devnet" },
    { type: "sui", network: "testnet" },
  ],
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

