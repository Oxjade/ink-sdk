import { useCallback, useMemo, useState } from "react";
import { InkClient } from "@ink/sdk";
import type { InkCallParams, InkClientOptions, InkReceipt } from "@ink/types";

export function useInkClient(options: InkClientOptions): InkClient {
  return useMemo(() => new InkClient(options), [options]);
}

export function useInkCall(client: InkClient): {
  call: (params: InkCallParams) => Promise<InkReceipt>;
  receipt: InkReceipt | undefined;
  isExecuting: boolean;
  error: Error | undefined;
} {
  const [receipt, setReceipt] = useState<InkReceipt>();
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<Error>();

  const call = useCallback(async (params: InkCallParams) => {
    setIsExecuting(true);
    setError(undefined);
    try {
      const nextReceipt = await client.call(params);
      setReceipt(nextReceipt);
      return nextReceipt;
    } catch (caught) {
      const nextError = caught instanceof Error ? caught : new Error(String(caught));
      setError(nextError);
      throw nextError;
    } finally {
      setIsExecuting(false);
    }
  }, [client]);

  return {
    call,
    receipt,
    isExecuting,
    error,
  };
}

