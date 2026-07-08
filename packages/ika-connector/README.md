# @ink-sdk/ika-connector

Private legacy workspace for the Ika/dWallet connector implementation.

Use `@ink-sdk/sdk` directly. The Ika connector classes are built into and exported from `@ink-sdk/sdk`, so this package is not published as part of the public release.

## Connectors

- `IkaEvmSigningConnector` creates/imports Ika SECP256K1 dWallets and signs EVM transactions.
- `IkaSolanaDWalletConnector` creates/imports Ika ED25519 dWallets and signs `solana-message` payloads.
- `IkaSuiDWalletConnector` creates/imports Ika ED25519 dWallets and signs `sui-transaction` bytes with Sui transaction intent.

Production connectors require funded Ika/Sui objects and the relevant `IKA_*` environment values.
