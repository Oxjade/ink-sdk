import { InkClient } from "@ink/sdk";

const config = {
  evm: {
    rpcUrl: process.env.EVM_TESTNET_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com",
    chainId: 11155111,
    explorerUrl: "https://sepolia.etherscan.io",
  },
  solana: {
    rpcUrl: process.env.SOLANA_DEVNET_RPC ?? "https://api.devnet.solana.com",
    cluster: "devnet",
    explorerUrl: "https://explorer.solana.com",
  },
  sui: {
    rpcUrl: process.env.SUI_TESTNET_RPC ?? "https://sui-testnet-rpc.publicnode.com",
    network: "testnet",
    explorerUrl: "https://suiexplorer.com",
  },
};

const chains = [
  {
    type: "evm",
    chainId: config.evm.chainId,
    rpcUrl: config.evm.rpcUrl,
    explorerUrl: config.evm.explorerUrl,
  },
  {
    type: "solana",
    cluster: config.solana.cluster,
    rpcUrl: config.solana.rpcUrl,
    explorerUrl: config.solana.explorerUrl,
  },
  {
    type: "sui",
    network: config.sui.network,
    rpcUrl: config.sui.rpcUrl,
    explorerUrl: config.sui.explorerUrl,
  },
];

const ink = new InkClient({
  projectId: "live_testnet_evidence",
  ika: {
    network: "testnet",
  },
  chains,
});

const dwallet = await ink.dwallet.create({
  name: "live-testnet-executor",
  chains,
  config: {
    purpose: "cross_chain_execution",
    appId: "live_testnet_evidence",
  },
});

const [evm, solana, sui] = await Promise.all([
  readEvmData(config.evm.rpcUrl, dwallet.addresses.evm),
  readSolanaData(config.solana.rpcUrl),
  readSuiData(config.sui.rpcUrl),
]);

const evidence = {
  kind: "ink_live_testnet_data",
  generatedAt: new Date().toISOString(),
  dWallet: dwallet,
  networks: {
    evm: {
      network: "sepolia",
      rpcUrl: config.evm.rpcUrl,
      expectedChainId: config.evm.chainId,
      ...evm,
    },
    solana: {
      network: config.solana.cluster,
      rpcUrl: config.solana.rpcUrl,
      ...solana,
    },
    sui: {
      network: config.sui.network,
      rpcUrl: config.sui.rpcUrl,
      ...sui,
    },
  },
  broadcast: {
    attempted: false,
    reason: "No real Ika testnet signer/funded dWallet was provided. This script refuses to fake executed receipts.",
    requiredEnv: [
      "IKA_NETWORK",
      "IKA_DWALLET_ID",
      "IKA_SIGN_ENDPOINT",
      "IKA_API_KEY",
    ],
  },
};

assertLiveData(evidence);
console.log(JSON.stringify(evidence, null, 2));

async function readEvmData(rpcUrl, address) {
  const [chainIdHex, blockNumberHex, gasPriceHex, nonceHex] = await Promise.all([
    jsonRpc(rpcUrl, "eth_chainId", []),
    jsonRpc(rpcUrl, "eth_blockNumber", []),
    jsonRpc(rpcUrl, "eth_gasPrice", []),
    jsonRpc(rpcUrl, "eth_getTransactionCount", [address, "pending"]),
  ]);

  return {
    chainId: hexToNumber(chainIdHex),
    latestBlock: hexToNumber(blockNumberHex),
    gasPriceWei: hexToBigIntString(gasPriceHex),
    dWalletAddress: address,
    dWalletNonce: hexToNumber(nonceHex),
  };
}

async function readSolanaData(rpcUrl) {
  const [slot, latestBlockhash] = await Promise.all([
    jsonRpc(rpcUrl, "getSlot", []),
    jsonRpc(rpcUrl, "getLatestBlockhash", [{ commitment: "confirmed" }]),
  ]);

  return {
    slot,
    latestBlockhash: latestBlockhash.value.blockhash,
    lastValidBlockHeight: latestBlockhash.value.lastValidBlockHeight,
  };
}

async function readSuiData(rpcUrl) {
  const [checkpoint, chainIdentifier] = await Promise.all([
    jsonRpc(rpcUrl, "sui_getLatestCheckpointSequenceNumber", []),
    jsonRpc(rpcUrl, "sui_getChainIdentifier", []),
  ]);

  return {
    latestCheckpoint: Number(checkpoint),
    chainIdentifier,
  };
}

async function jsonRpc(url, method, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${method}_${Date.now()}`,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`${method} failed with HTTP ${response.status}`);
  }

  const json = await response.json();
  if (json.error) {
    throw new Error(`${method} failed: ${JSON.stringify(json.error)}`);
  }
  return json.result;
}

function hexToNumber(value) {
  return Number.parseInt(String(value), 16);
}

function hexToBigIntString(value) {
  return BigInt(String(value)).toString();
}

function assertLiveData(evidence) {
  if (evidence.networks.evm.chainId !== evidence.networks.evm.expectedChainId) {
    throw new Error(`Unexpected EVM chainId: ${evidence.networks.evm.chainId}`);
  }
  if (!Number.isFinite(evidence.networks.evm.latestBlock) || evidence.networks.evm.latestBlock <= 0) {
    throw new Error("EVM latest block was not live data");
  }
  if (!Number.isFinite(evidence.networks.solana.slot) || evidence.networks.solana.slot <= 0) {
    throw new Error("Solana slot was not live data");
  }
  if (!evidence.networks.solana.latestBlockhash) {
    throw new Error("Solana latest blockhash missing");
  }
  if (!Number.isFinite(evidence.networks.sui.latestCheckpoint) || evidence.networks.sui.latestCheckpoint <= 0) {
    throw new Error("Sui checkpoint was not live data");
  }
  if (!evidence.networks.sui.chainIdentifier) {
    throw new Error("Sui chain identifier missing");
  }
}

