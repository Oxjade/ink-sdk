# @ink-sdk/sdk

Core Ink client for programmable Ika-backed execution.

```ts
import { createInkClient } from "@ink-sdk/sdk";

const ink = createInkClient({
  mode: "production",
  ika: { connector },
  chains,
  policies,
  storage,
});
```

## v0.2 highlights

- `ink.call()`, `ink.batch()`, `ink.estimate()`, receipts, statuses, and lifecycle events.
- `ink.dwallet.create()`, `importExisting()`, `getAddress()`, `list()`, and `linkChains()`.
- SDK-side `policies` for allowed chains, targets, functions, EVM value, and required idempotency.
- JSON file storage helper for local tools and proofs.

See the workspace README and integration guide for full examples.
