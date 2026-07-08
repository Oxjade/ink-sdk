# Ink SDK

Ink is a developer-first programmable cross-chain function execution SDK powered by Ika/dWallet signing.

Ink lets developers call blockchain functions through one SDK while Ika/dWallet provides programmable signing. A developer defines the target chain, contract/program/module, function, args, and signing method; Ink builds the native transaction for that chain, routes it through Ika/dWallet signing, attaches the returned signature, executes or returns the signed transaction, and gives back a clean receipt.

Ink supports EVM chains, Solana, and Sui through chain adapters. For EVM, it builds ABI function calls, estimates gas, creates the EVM transaction, gets an Ika-backed secp256k1 signature, serializes the signed transaction, and can broadcast it. The SDK also re-exports the Ika connector classes for EVM, Solana, and Sui dWallet creation/signing.

The goal is programmable cross-chain execution for DeFi apps, automation, AI agents, vaults, protocols, and developer tools that need to perform real actions across multiple chains without rebuilding signing and transaction logic for every network.

## Documentation

- [Integration Guide](docs/INTEGRATION.md) - install, configure, create/import dWallets, call functions, use storage/idempotency, and run the real Ika EVM signing proof.
- [Real Testnet Checklist](examples/REAL_TESTNET.md) - live proof commands, Ika env shape, and execution requirements.

## Install From npm

```bash
npm install @ink-sdk/sdk @ink-sdk/evm
```

## Product Line

Ink is a programmable cross-chain function-call SDK.

Sharper:

EVM by chain ID. Solana by program instruction. Sui by Move call. Ika signs EVM today. Ink coordinates the action lifecycle.

## Packages

This repository is organized as a TypeScript workspace:

- `@ink-sdk/sdk` - core client, `createInkClient()`, `ink.call()`, `ink.batch()`, lifecycle events, status, receipts, chain configuration, policy checks, and dWallet facade.
- `@ink-sdk/evm` - EVM adapter for ABI calls, transaction building, ethers RPC helpers, signing payloads, signature attachment, broadcast, and receipts.
- `@ink-sdk/solana` - Solana adapter foundation for program instruction payloads. Real Solana execution requires native RPC/signing hooks.
- `@ink-sdk/sui` - Sui adapter foundation for Move-call payloads. Real Sui execution requires native RPC/signing hooks.
- `@ink-sdk/ika-connector` - lower-level Ika/dWallet connector package re-exported by `@ink-sdk/sdk`.
- `@ink-sdk/react` - React bindings for apps that want hooks around the core SDK.

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

## dWallet Creation

Ink expects real Ika dWallets. Create a new dWallet through an Ika connector that supports creation, or import an already-provisioned Ika dWallet with `ink.dwallet.importExisting()`.

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
import { createEthersEvmAdapter } from "@ink-sdk/evm";
import { IkaEvmSigningConnector } from "@ink-sdk/sdk";
import { createInkClient } from "@ink-sdk/sdk";

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
  adapters: [
    createEthersEvmAdapter({
      chain: {
        type: "evm",
        chainId: 56,
        rpcUrl: "https://bsc-dataseed.binance.org",
        explorerUrl: "https://bscscan.com",
      },
      rpcUrl: "https://bsc-dataseed.binance.org",
      signerAddress: process.env.IKA_ETH_ADDRESS!,
      broadcast: false,
    }),
  ],
});

ink.on("action:status", ({ actionId, status }) => {
  console.info("[ink]", actionId, status);
});

const dwallet = await ink.dwallet.create({
  name: "project-executor",
  chains: [
    { type: "evm", chainId: 56 },
  ],
  config: {
    purpose: "cross_chain_execution",
  },
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

Import real Ika dWallet. Define function. Sign with Ika. Execute or return the signed EVM transaction. Return receipt.

## Current SDK Capabilities

- `ink.call()` orchestrates build -> signing payload -> Ika/dWallet signing -> signature attachment -> submit -> receipt.
- `ink.batch()` runs multiple calls sequentially and returns all receipts.
- `ink.estimate()` asks the selected chain adapter for gas, fee, or compute estimates when available.
- `ink.getStatus()` and `ink.getReceipt()` expose execution state and stored receipts.
- `ink.on("action:status" | "action:receipt" | "action:error")` exposes lifecycle events for product UI, logs, and reconciliation.
- `ink.dwallet.create()`, `ink.dwallet.importExisting()`, `ink.dwallet.get()`, `ink.dwallet.list()`, `ink.dwallet.getAddress()`, and `ink.dwallet.linkChains()` provide the dWallet facade.
- Optional `storage` lets apps persist receipts, statuses, idempotency keys, and dWallet metadata.
- `createJsonFileStorage(path)` provides a Node-friendly JSON storage implementation for local tools and examples.
- `@ink-sdk/evm` now uses real ABI calldata encoding through `ethers.Interface`.
- `createEthersEvmAdapter()` and `createEthersEvmRpc()` provide built-in ethers nonce, gas, broadcast, and receipt hooks.
- `IkaEvmSigningConnector` can create/import real Ika SECP256K1 dWallets, derive EVM addresses, and sign EVM transactions.
- `IkaSolanaDWalletConnector` can create/import real Ika ED25519 dWallets, derive Solana addresses, and sign `solana-message` payloads.
- `IkaSuiDWalletConnector` can create/import real Ika ED25519 dWallets, derive Sui addresses, and sign Sui transaction bytes with Sui transaction intent.
- Optional `policies` let apps allowlist chains, targets, functions, EVM value, and require idempotency before signing.

InkClient requires a real Ika connector. If `ika.connector` is omitted, the SDK throws during client creation. `IkaEvmSigningConnector` creates and signs with SECP256K1 dWallets for EVM flows. `IkaSolanaDWalletConnector` and `IkaSuiDWalletConnector` create and sign with ED25519 dWallets for Solana and Sui flows. Full Solana/Sui execution still requires adapters that provide real serialized transaction/message bytes plus submit/confirm hooks.

## Real Solana dWallets

```ts
import { IkaSolanaDWalletConnector } from "@ink-sdk/sdk";
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

Required env for creation:

```bash
IKA_NETWORK=testnet
IKA_SUI_RPC=https://sui-testnet-rpc.publicnode.com
IKA_SUI_PRIVATE_KEY=suiprivkey...
IKA_COIN_ID=0x...
IKA_SUI_COIN_ID=0x...
```

For stable production access, also provide `IKA_SOLANA_USER_SHARE_ENCRYPTION_KEYS_B64`; otherwise the connector creates an in-memory user-share key for the current process only.

## Real Sui dWallets

```ts
import { IkaSuiDWalletConnector } from "@ink-sdk/sdk";
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

The Sui connector signs `sui-transaction` bytes using Sui transaction intent and returns `metadata.serializedSignature`, which a real Sui submit hook can pass to Sui RPC with the transaction bytes.

## Storage and Idempotency

```ts
import { InkClient, createJsonFileStorage } from "@ink-sdk/sdk";

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

Run the real testnet proof:

```bash
npm run proof
```

The proof scripts demonstrate the current SDK path with live RPC data:

1. Create a dWallet through Ink.
2. Call an EVM contract function.
3. Resolve live chain metadata and Ika object state.
4. Return and assert receipts only for paths backed by real RPC confirmation.

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
- Transaction simulation, richer policy backends, replay protection, and scoped on-chain approvals.
