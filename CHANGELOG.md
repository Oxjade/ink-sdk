# Ink SDK Changelog

## 0.2.0

- Added `createEthersEvmAdapter()` and `createEthersEvmRpc()` for ethers-backed EVM nonce, gas, sign-only, broadcast, and receipt handling.
- Added SDK-side `policies` to reject unsafe calls before signing.
- Added `IkaSolanaDWalletConnector` for real Ika ED25519 Solana dWallet creation/import and `solana-message` signing.
- Added `IkaSuiDWalletConnector` for real Ika ED25519 Sui dWallet creation/import and Sui transaction-intent signing.
- Removed fake Solana execution from the default adapter; real send/confirm hooks are required before Solana actions can be marked executed.
- Updated examples and docs to use `@ink-sdk/*` package names and import-first production dWallet setup.
