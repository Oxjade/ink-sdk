# @ink-sdk/ika-connector

Ika connector package for Ink.

## Connectors

- `IkaEvmSigningConnector` signs EVM transactions through Ika secp256k1 flows.
- `IkaSolanaDWalletConnector` creates/imports Ika ED25519 dWallets and signs `solana-message` payloads.
- `IkaSuiDWalletConnector` creates/imports Ika ED25519 dWallets and signs `sui-transaction` bytes with Sui transaction intent.
- `InMemoryIkaConnector` is development-only.

Production connectors require funded Ika/Sui objects and the relevant `IKA_*` environment values.
