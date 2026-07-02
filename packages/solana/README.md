# @ink-sdk/solana

Solana adapter foundation for Ink.

The adapter builds Solana instruction-shaped payloads and accepts custom send, confirm, and estimate hooks.

In v0.2, the default adapter no longer returns fake executed receipts. Real Solana execution requires send/confirm hooks and a connector such as `IkaSolanaDWalletConnector` for ED25519 message signing.
