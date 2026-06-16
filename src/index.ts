export type InkChain = "solana" | "evm" | "sui";

export type InkActionRequest = {
  chain: InkChain;
  walletId: string;
  action: string;
  params?: Record<string, unknown>;
};

export type InkActionResponse = {
  id: string;
  status: "pending" | "signed" | "broadcast" | "failed";
  transactionHash?: string;
};

export type InkClientOptions = {
  apiKey: string;
  baseUrl: string;
};

export class InkClient {
  readonly actions: {
    create: (request: InkActionRequest) => Promise<InkActionResponse>;
  };

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: InkClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");

    this.actions = {
      create: (request) => this.request<InkActionResponse>("/actions", request),
    };
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Ink request failed with ${response.status}`);
    }

    return response.json() as Promise<T>;
  }
}

