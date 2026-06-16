# Real Testnet Execution Checklist

The mock proof shows SDK control flow. The live testnet proof shows real RPC data. A true executed testnet receipt needs the final signing and funding pieces.

## Current Commands

```bash
npm run proof:mock
npm run proof:testnet
npm run proof:ika-sui
npm run proof:bnb-public
```

## What `proof:testnet` Does Today

- Connects to live EVM Sepolia RPC.
- Connects to live Solana devnet RPC.
- Connects to live Sui testnet RPC.
- Creates a dWallet record through Ink.
- Resolves EVM, Solana, and Sui dWallet addresses.
- Reads real EVM chain ID, latest block, gas price, and dWallet nonce.
- Reads real Solana slot and latest blockhash.
- Reads real Sui checkpoint and chain identifier.
- Prints a machine-readable evidence object.
- Discovers real Ika testnet dWallet capabilities owned by the active Sui CLI address.
- Calls real public functions on the BNB Smart Chain testnet WBNB contract.

## What Is Still Required For Executed Receipts

To return real executed receipts instead of mock receipts, Ink needs:

1. A real Ika testnet connector.
2. A created/provisioned testnet dWallet.
3. Testnet funds for every target chain.
4. A real deployed EVM testnet contract function to call.
5. A real Solana devnet program instruction to call.
6. A real Sui testnet package Move function to call.
7. Chain-specific transaction serialization and signature attachment using the signatures returned by Ika.

## Required Environment Shape

```bash
EVM_TESTNET_RPC=https://ethereum-sepolia-rpc.publicnode.com
SOLANA_DEVNET_RPC=https://api.devnet.solana.com
SUI_TESTNET_RPC=https://sui-testnet-rpc.publicnode.com

IKA_NETWORK=testnet
IKA_DWALLET_ID=...
IKA_SIGN_ENDPOINT=...
IKA_API_KEY=...
```

## Non-Negotiable Rule

Do not label a transaction as `executed` unless a target chain RPC accepted it and a real receipt/confirmation was fetched.
