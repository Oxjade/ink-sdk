# @ink-sdk/react

React hooks for Ink SDK apps.

```tsx
import { useInkClient, useInkCall } from "@ink-sdk/react";

const ink = useInkClient(options);
const { call, receipt, isExecuting, error } = useInkCall(ink);
```

The hooks wrap the core `@ink-sdk/sdk` client and expose call state for application UIs.
