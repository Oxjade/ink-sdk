# @ink-sdk/sui

Sui adapter foundation for Ink.

The adapter builds Move-call-shaped payloads and accepts custom submit, wait, and estimate hooks.

Use `IkaSuiDWalletConnector` from `@ink-sdk/ika-connector` to sign real Sui transaction bytes with Sui transaction intent. Full execution requires a submit hook that sends transaction bytes plus the serialized signature to Sui RPC.
