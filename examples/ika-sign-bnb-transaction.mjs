import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { createEthersEvmAdapter } from "@ink-sdk/evm";
import { IkaEvmSigningConnector } from "@ink-sdk/ika-connector";
import { InkClient } from "@ink-sdk/sdk";

const envPath = path.resolve("..", ".env");
if (process.env.INK_AUTO_REFRESH_IKA_PRESIGN === "true") {
  await import("./refresh-ika-presign.mjs");
}
const env = loadEnvFile(envPath);
const required = [
  "IKA_NETWORK",
  "IKA_SUI_RPC",
  "IKA_SUI_PRIVATE_KEY",
  "IKA_ETH_ADDRESS",
  "IKA_DWALLET_ID",
  "IKA_DWALLET_CAP_ID",
  "IKA_PRESIGN_ID",
  "IKA_UNVERIFIED_PRESIGN_CAP_ID",
  "IKA_COIN_ID",
  "IKA_SUI_COIN_ID",
];
const missing = required.filter((key) => !env[key]);
if (missing.length) {
  throw new Error(`Missing required Ika signing env vars in ../.env: ${missing.join(", ")}`);
}

const chain = {
  type: "evm",
  chainId: 97,
  rpcUrl: env.BNB_TESTNET_RPC ?? "https://bsc-testnet-rpc.publicnode.com",
  explorerUrl: "https://testnet.bscscan.com",
};
const wbnb = "0xae13d989dac2f0debff460ac112a837c89baa7cd";
const provider = new ethers.JsonRpcProvider(chain.rpcUrl, chain.chainId, {
  staticNetwork: true,
});
const signerAddress = ethers.getAddress(env.IKA_ETH_ADDRESS);

const adapter = createEthersEvmAdapter({
  chain,
  provider,
  signerAddress,
  broadcast: env.INK_BROADCAST_IKA_SIGNED_TX === "true",
});

const ink = new InkClient({
  projectId: "ika_bnb_signing_proof",
  ika: {
    network: env.IKA_NETWORK,
    connector: new IkaEvmSigningConnector({ env }),
  },
  chains: [chain],
  adapters: [adapter],
});

await ink.dwallet.importExisting({
  dWalletId: env.IKA_DWALLET_ID,
  chains: [chain],
  metadata: {
    source: "parent-env",
    signerAddress,
  },
});

const balance = await provider.getBalance(signerAddress);
const target = {
  contract: wbnb,
  abi: [
    {
      type: "function",
      name: "symbol",
      inputs: [],
      outputs: [{ name: "", type: "string" }],
      stateMutability: "view",
    },
  ],
  functionName: "symbol",
  args: [],
  value: "0",
};

const receipt = await ink.call({
  targetChain: chain,
  target,
  signing: {
    provider: "ika",
    dWalletId: env.IKA_DWALLET_ID,
  },
  execution: {
    waitForReceipt: true,
    returnExplorerUrl: true,
  },
});

const storedReceipt = await ink.getReceipt(receipt.actionId);
const parsedTx = receipt.transaction?.hash
  ? null
  : undefined;

const evidence = {
  kind: "ink_real_ika_bnb_signing_flow",
  generatedAt: new Date().toISOString(),
  network: {
    name: "BNB Smart Chain Testnet",
    chainId: chain.chainId,
    rpcUrl: chain.rpcUrl,
  },
  signer: {
    address: signerAddress,
    balanceWei: balance.toString(),
  },
  target: {
    contract: wbnb,
    functionName: "symbol",
    note: "This is a real transaction signing payload targeting WBNB symbol(). Broadcast is opt-in.",
  },
  receipt,
  storedReceiptMatches: JSON.stringify(storedReceipt) === JSON.stringify(receipt),
  parsedTx,
};

console.log(JSON.stringify(evidence, null, 2));

function loadEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return { ...process.env };
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    env[match[1]] = cleanEnvValue(match[2]);
  }
  return { ...env, ...process.env };
}

function cleanEnvValue(value) {
  const trimmed = String(value).trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}
