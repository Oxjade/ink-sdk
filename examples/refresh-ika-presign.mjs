import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve("..", ".env");
const env = loadEnvFile(envPath);

const required = [
  "IKA_NETWORK",
  "IKA_SUI_RPC",
  "IKA_SUI_PRIVATE_KEY",
  "IKA_DWALLET_ID",
  "IKA_DWALLET_CAP_ID",
  "IKA_COIN_ID",
  "IKA_SUI_COIN_ID",
  "IKA_GAS_COIN_ID",
  "IKA_USER_SHARE_ENCRYPTION_KEYS_B64",
];
const missing = required.filter((key) => !env[key]);
if (missing.length) {
  throw new Error(`Missing required env vars in ../.env: ${missing.join(", ")}`);
}

const [ikaSdk, suiJsonRpcModule, suiTxModule, ed25519Module, cryptographyModule] =
  await Promise.all([
    import("@ika.xyz/sdk"),
    import("@mysten/sui/jsonRpc"),
    import("@mysten/sui/transactions"),
    import("@mysten/sui/keypairs/ed25519"),
    import("@mysten/sui/cryptography"),
  ]);

const network = env.IKA_NETWORK;
const suiClient = new suiJsonRpcModule.SuiJsonRpcClient({
  url: env.IKA_SUI_RPC,
  network,
});
const config = ikaSdk.getNetworkConfig(network);
const ikaClient = new ikaSdk.IkaClient({
  suiClient,
  config,
  encryptionKeyOptions: env.IKA_NETWORK_ENCRYPTION_KEY_ID
    ? { encryptionKeyID: env.IKA_NETWORK_ENCRYPTION_KEY_ID }
    : undefined,
});

const decoded = cryptographyModule.decodeSuiPrivateKey(env.IKA_SUI_PRIVATE_KEY);
const suiSigner = ed25519Module.Ed25519Keypair.fromSecretKey(decoded.secretKey);
const suiAddress = suiSigner.getPublicKey().toSuiAddress();
const userShareEncryptionKeys = ikaSdk.UserShareEncryptionKeys.fromShareEncryptionKeysBytes(
  Uint8Array.from(Buffer.from(env.IKA_USER_SHARE_ENCRYPTION_KEYS_B64, "base64"))
);

const activeNetworkEncryptionKey =
  await ikaClient.getLatestNetworkEncryptionKey(ikaSdk.Curve.SECP256K1);

const tx = new suiTxModule.Transaction();
const ikaTx = new ikaSdk.IkaTransaction({
  ikaClient,
  transaction: tx,
  userShareEncryptionKeys,
});

const unverifiedPresignCap = ikaTx.requestGlobalPresign({
  dwalletNetworkEncryptionKeyId: objectId(activeNetworkEncryptionKey),
  curve: ikaSdk.Curve.SECP256K1,
  signatureAlgorithm: ikaSdk.SignatureAlgorithm.ECDSASecp256k1,
  ikaCoin: tx.object(env.IKA_COIN_ID),
  suiCoin: tx.object(env.IKA_SUI_COIN_ID),
});
tx.transferObjects([unverifiedPresignCap], suiAddress);

const gasObject = await suiClient.getObject({
  id: env.IKA_GAS_COIN_ID,
  options: {},
});
tx.setSender(suiAddress);
tx.setGasBudget(Number(env.IKA_REFRESH_PRESIGN_GAS_BUDGET ?? 50000000));
tx.setGasPayment([
  {
    objectId: gasObject.data.objectId,
    version: gasObject.data.version,
    digest: gasObject.data.digest,
  },
]);

const result = await suiClient.signAndExecuteTransaction({
  signer: suiSigner,
  transaction: tx,
  options: {
    showEffects: true,
    showEvents: true,
    showObjectChanges: true,
  },
});

const status = result.effects?.status?.status;
if (status !== "success") {
  throw new Error(`requestPresign failed: ${JSON.stringify(result.effects?.status)}`);
}

const unverifiedPresignCapId =
  findCreatedId(result, /UnverifiedPresignCap/) ||
  objectId(unverifiedPresignCap);
const presignId =
  findCreatedId(result, /PresignSession/) ||
  findCreatedId(result, /Presign/);

if (!presignId || !unverifiedPresignCapId) {
  throw new Error(`Unable to find presign IDs in object changes: ${JSON.stringify(result.objectChanges)}`);
}

await ikaClient.getPresignInParticularState(presignId, "Completed", {
  timeout: Number(env.IKA_SIGN_TIMEOUT_MS ?? 180000),
  interval: Number(env.IKA_SIGN_POLL_INTERVAL_MS ?? 3000),
});

upsertEnv(envPath, {
  IKA_PRESIGN_ID: presignId,
  IKA_UNVERIFIED_PRESIGN_CAP_ID: unverifiedPresignCapId,
});

console.log(JSON.stringify({
  kind: "ink_ika_presign_refresh",
  digest: result.digest,
  presignId,
  unverifiedPresignCapId,
  gasBudget: Number(env.IKA_REFRESH_PRESIGN_GAS_BUDGET ?? 50000000),
}, null, 2));

function objectId(value) {
  return value?.id?.id || value?.id || value?.objectId || value;
}

function findCreatedId(result, pattern) {
  const change = result.objectChanges?.find(
    (item) =>
      item.type === "created" &&
      typeof item.objectType === "string" &&
      pattern.test(item.objectType)
  );
  return change?.objectId;
}

function loadEnvFile(filePath) {
  const nextEnv = {};
  if (!fs.existsSync(filePath)) return { ...process.env };
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    nextEnv[match[1]] = cleanEnvValue(match[2]);
  }
  return { ...nextEnv, ...process.env };
}

function upsertEnv(filePath, updates) {
  const existing = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8").split(/\r?\n/)
    : [];
  const seen = new Set();
  const lines = existing.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match) return line;
    const key = match[1];
    seen.add(key);
    return Object.prototype.hasOwnProperty.call(updates, key)
      ? `${key}=${updates[key]}`
      : line;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) lines.push(`${key}=${value}`);
  }
  fs.writeFileSync(filePath, `${lines.filter(Boolean).join("\n")}\n`);
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
