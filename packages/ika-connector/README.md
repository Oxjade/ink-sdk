# @ink-sdk/ika-connector

Ika connector package for Ink.

## Connectors

- `IkaEvmSigningConnector` creates/imports Ika SECP256K1 dWallets and signs EVM transactions.
- `IkaSolanaDWalletConnector` creates/imports Ika ED25519 dWallets and signs `solana-message` payloads.
- `IkaSuiDWalletConnector` creates/imports Ika ED25519 dWallets and signs `sui-transaction` bytes with Sui transaction intent.

Production connectors require funded Ika/Sui objects and the relevant `IKA_*` environment values.
