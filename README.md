# ink-sdk

TypeScript SDK for integrating Ink dWallet-powered chain interactions into apps.

## Install

```bash
pnpm add @ink/sdk
```

## Usage

```ts
import { InkClient } from "@ink/sdk";

const ink = new InkClient({
  apiKey: process.env.INK_API_KEY!,
  baseUrl: "https://api.ink.example",
});

await ink.actions.create({
  chain: "solana",
  walletId: "dwallet_123",
  action: "program.invoke",
  params: {
    programId: "INKPay...",
    method: "pay",
  },
});
```

