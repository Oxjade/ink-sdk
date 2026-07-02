# @ink-sdk/evm

EVM adapter for Ink.

```ts
import { createEthersEvmAdapter } from "@ink-sdk/evm";

const adapter = createEthersEvmAdapter({
  chain: { type: "evm", chainId: 97 },
  rpcUrl: process.env.BNB_TESTNET_RPC_URL,
  signerAddress: process.env.IKA_ETH_ADDRESS,
  broadcast: false,
});
```

## v0.2 highlights

- ABI calldata encoding through `ethers.Interface`.
- Built-in ethers RPC helpers for nonce, gas, fee, sign-only, broadcast, and receipts.
- Existing `EvmAdapter({ rpc, fromAddressResolver })` hook API remains supported.
