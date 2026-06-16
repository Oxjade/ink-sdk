const BNB_TESTNET = {
  name: "BNB Smart Chain Testnet",
  chainId: 97,
  rpcUrl: process.env.BNB_TESTNET_RPC ?? "https://bsc-testnet-rpc.publicnode.com",
  explorerUrl: "https://testnet.bscscan.com",
  wbnb: "0xae13d989dac2f0debff460ac112a837c89baa7cd",
};

const calls = {
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  totalSupply: "0x18160ddd",
};

const [chainIdHex, latestBlockHex, code, nameRaw, symbolRaw, decimalsRaw, totalSupplyRaw] =
  await Promise.all([
    rpc("eth_chainId", []),
    rpc("eth_blockNumber", []),
    rpc("eth_getCode", [BNB_TESTNET.wbnb, "latest"]),
    rpc("eth_call", [{ to: BNB_TESTNET.wbnb, data: calls.name }, "latest"]),
    rpc("eth_call", [{ to: BNB_TESTNET.wbnb, data: calls.symbol }, "latest"]),
    rpc("eth_call", [{ to: BNB_TESTNET.wbnb, data: calls.decimals }, "latest"]),
    rpc("eth_call", [{ to: BNB_TESTNET.wbnb, data: calls.totalSupply }, "latest"]),
  ]);

const chainId = hexToNumber(chainIdHex);
if (chainId !== BNB_TESTNET.chainId) {
  throw new Error(`Expected BNB testnet chainId ${BNB_TESTNET.chainId}, received ${chainId}`);
}
if (!code || code === "0x") {
  throw new Error(`No contract code found at ${BNB_TESTNET.wbnb}`);
}

const evidence = {
  kind: "ink_bnb_public_function_call",
  generatedAt: new Date().toISOString(),
  network: {
    name: BNB_TESTNET.name,
    chainId,
    rpcUrl: BNB_TESTNET.rpcUrl,
    latestBlock: hexToNumber(latestBlockHex),
  },
  target: {
    contract: BNB_TESTNET.wbnb,
    explorerUrl: `${BNB_TESTNET.explorerUrl}/address/${BNB_TESTNET.wbnb}`,
    publicFunctions: {
      name: {
        selector: calls.name,
        raw: nameRaw,
        decoded: decodeAbiString(nameRaw),
      },
      symbol: {
        selector: calls.symbol,
        raw: symbolRaw,
        decoded: decodeAbiString(symbolRaw),
      },
      decimals: {
        selector: calls.decimals,
        raw: decimalsRaw,
        decoded: hexToNumber(decimalsRaw),
      },
      totalSupply: {
        selector: calls.totalSupply,
        raw: totalSupplyRaw,
        decoded: BigInt(totalSupplyRaw).toString(),
      },
    },
  },
};

console.log(JSON.stringify(evidence, null, 2));

async function rpc(method, params) {
  const response = await fetch(BNB_TESTNET.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
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

function decodeAbiString(value) {
  const hex = strip0x(value);
  if (!hex || hex.length < 128) return "";
  const length = Number.parseInt(hex.slice(64, 128), 16);
  const data = hex.slice(128, 128 + length * 2);
  return new TextDecoder().decode(hexToBytes(data)).replace(/\0+$/, "");
}

function hexToBytes(hex) {
  const bytes = [];
  for (let index = 0; index < hex.length; index += 2) {
    bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
  }
  return Uint8Array.from(bytes);
}

function hexToNumber(value) {
  return Number.parseInt(strip0x(value), 16);
}

function strip0x(value) {
  return String(value).replace(/^0x/i, "");
}

