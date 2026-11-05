// Server-side configuration, read once. Missing values fail loudly where they're used, not at import time.

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export function required(name: string): string {
  const value = read(name);
  if (!value) throw new Error(`${name} is not set. Add it to .env.local.`);
  return value;
}

export const env = {
  zgApiKey: () => required("ZG_API_KEY"),
  zgRouter: () => read("ZG_ROUTER_URL") ?? "https://router-api.0g.ai/v1",
  serverKey: () => required("SERVER_PRIVATE_KEY") as `0x${string}`,
  scribeKey: () => required("SCRIBE_PRIVATE_KEY") as `0x${string}`,
  masterKey: () => required("MASTER_KEY"),
  galileoRpc: () => read("GALILEO_RPC_URL") ?? "https://evmrpc-testnet.0g.ai",
  storageIndexer: () => read("ZG_STORAGE_INDEXER") ?? "https://indexer-storage-testnet-turbo.0g.ai",
  sepoliaRpc: () => read("SEPOLIA_RPC_URL") ?? "https://ethereum-sepolia-rpc.publicnode.com",
  arkivAccessKey: () => read("ARKIV_ACCESS_KEY") ?? "",
  dreamRegistry: () => read("DREAM_REGISTRY_ADDRESS") as `0x${string}` | undefined,
  vapidPublic: () => required("VAPID_PUBLIC_KEY"),
  vapidPrivate: () => required("VAPID_PRIVATE_KEY"),
  vapidSubject: () => required("VAPID_SUBJECT"),
  dataDir: () => read("DATA_DIR") ?? `${process.cwd()}/data`,
};
