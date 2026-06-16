import { execFileSync } from "node:child_process";

const IKA_TESTNET = {
  rpcUrl: process.env.SUI_TESTNET_RPC ?? "https://sui-testnet-rpc.publicnode.com",
  ikaPackage: "0x1f26bb2f711ff82dcda4d02c77d5123089cb7f8418751474b9fb744ce031526a",
  ikaDwallet2pcMpcOriginalPackage: "0xf02f5960c94fce1899a3795b5d11fd076bc70a8d0e20a2b19923d990ed490730",
  ikaDwallet2pcMpcPackage: "0x6573a6c13daf26a64eb8a37d3c7a4391b353031e223072ca45b1ff9366f59293",
};

const activeAddress = runSui(["client", "active-address"]);
const activeEnv = runSui(["client", "active-env"]);

const [gasBalance, ikaCoins, dWalletCaps] = await Promise.all([
  jsonRpc(IKA_TESTNET.rpcUrl, "suix_getBalance", [activeAddress, "0x2::sui::SUI"]),
  jsonRpc(IKA_TESTNET.rpcUrl, "suix_getCoins", [
    activeAddress,
    `${IKA_TESTNET.ikaPackage}::ika::IKA`,
    null,
    20,
  ]),
  getOwnedDWalletCaps(activeAddress),
]);

const dWalletObjects = await Promise.all(
  dWalletCaps.map((cap) =>
    jsonRpc(IKA_TESTNET.rpcUrl, "sui_getObject", [
      cap.dWalletId,
      {
        showType: true,
        showContent: true,
        showOwner: true,
      },
    ])
      .then((result) => summarizeDWalletObject(result))
      .catch((error) => ({
        error: error.message,
        objectId: cap.dWalletId,
      }))
  )
);

const evidence = {
  kind: "ink_ika_sui_cli_discovery",
  generatedAt: new Date().toISOString(),
  cli: {
    activeAddress,
    activeEnv,
    note: activeEnv === "testnet"
      ? "Sui CLI is active on testnet."
      : "Sui CLI active env is not testnet, but this script queried testnet RPC directly using the active address.",
  },
  ikaTestnet: IKA_TESTNET,
  walletOnTestnet: {
    suiBalance: gasBalance,
    ikaCoinCount: ikaCoins.data?.length ?? 0,
    ikaCoins: (ikaCoins.data ?? []).map((coin) => ({
      coinObjectId: coin.coinObjectId,
      balance: coin.balance,
      version: coin.version,
    })),
    dWalletCapCount: dWalletCaps.length,
    dWalletCaps,
    dWalletObjects,
  },
};

if (dWalletCaps.length === 0) {
  throw new Error(`No Ika testnet DWalletCap objects found for ${activeAddress}`);
}

console.log(JSON.stringify(evidence, null, 2));

async function getOwnedDWalletCaps(owner) {
  const packages = [
    IKA_TESTNET.ikaDwallet2pcMpcOriginalPackage,
    IKA_TESTNET.ikaDwallet2pcMpcPackage,
  ];
  const allCaps = [];

  for (const packageId of packages) {
    const result = await jsonRpc(IKA_TESTNET.rpcUrl, "suix_getOwnedObjects", [
      owner,
      {
        filter: {
          StructType: `${packageId}::coordinator_inner::DWalletCap`,
        },
        options: {
          showType: true,
          showContent: true,
          showOwner: true,
        },
      },
      null,
      50,
    ]);

    for (const item of result.data ?? []) {
      const data = item.data;
      const fields = data?.content?.fields;
      allCaps.push({
        packageId,
        objectId: data?.objectId,
        version: data?.version,
        digest: data?.digest,
        type: data?.type,
        dWalletId: fields?.dwallet_id,
      });
    }
  }

  return allCaps;
}

function runSui(args) {
  return execFileSync("sui", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function summarizeDWalletObject(result) {
  const data = result.data;
  const fields = data?.content?.fields;
  return {
    objectId: data?.objectId,
    version: data?.version,
    digest: data?.digest,
    type: data?.type,
    owner: data?.owner,
    state: fields?.state?.variant,
    curve: fields?.curve,
    createdAtEpoch: fields?.created_at_epoch,
    dWalletCapId: fields?.dwallet_cap_id,
    encryptedUserSecretKeyShareCount: fields?.encrypted_user_secret_key_shares?.fields?.size,
    signSessionCount: fields?.sign_sessions?.fields?.size,
    isImportedKeyDWallet: fields?.is_imported_key_dwallet,
  };
}

async function jsonRpc(url, method, params) {
  const response = await fetch(url, {
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
