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

// A comma-separated list, such as ZG_PAINT_MODELS="minimax-image-01,z-image-turbo".
function list(name: string): string[] | undefined {
  const items = read(name)?.split(",").map((s) => s.trim()).filter(Boolean);
  return items?.length ? items : undefined;
}

export const env = {
  zgApiKey: () => required("ZG_API_KEY"),
  // Each job's default 0G model, and the backups that stand in for it, in order, when 0G can't serve it.
  // Reading is always sealed: whichever model reads, it only runs on private trust.
  zgRead: () => ({ main: read("ZG_READ_MODEL") ?? "0gm-1.0-35b-a3b", backups: list("ZG_READ_BACKUPS") ?? ["glm-5.3"] }),
  zgPaint: () => ({
    main: read("ZG_PAINT_MODEL") ?? "z-image-turbo",
    backups: list("ZG_PAINT_BACKUPS") ?? ["tencent/hy-image-3.5-preview", "bytedance/seedream-5.0-flash", "minimax-image-01"],
  }),
  zgPanel: () => ({ main: read("ZG_PANEL_MODEL") ?? "tencent/hy-image-3.5-preview", backups: list("ZG_PANEL_BACKUPS") ?? ["bytedance/seedream-5.0-flash", "minimax-image-01"] }),
  zgRouter: () => read("ZG_ROUTER_URL") ?? "https://router-api.0g.ai/v1",
  zgPrivyAppId: () => required("NEXT_PUBLIC_ZG_PRIVY_APP_ID"), // 0G's own Privy app, behind "Sign in with 0G"
  // The most a dreamer's own key may spend a day, in their account's currency (USD for iAI): ten dreams and the night's art.
  zgKeyDailyLimit: () => read("ZG_KEY_DAILY_LIMIT") ?? "3",
  walletPrivyAppId: () => read("NEXT_PUBLIC_PRIVY_APP_ID"), // Dreamscape's own Privy app, wallet login only, for the live site
  serverKey: () => required("SERVER_PRIVATE_KEY") as `0x${string}`,
  scribeKey: () => required("SCRIBE_PRIVATE_KEY") as `0x${string}`,
  masterKey: () => required("MASTER_KEY"),
  galileoRpc: () => read("GALILEO_RPC_URL") ?? "https://evmrpc-testnet.0g.ai",
  storageIndexer: () => read("ZG_STORAGE_INDEXER") ?? "https://indexer-storage-testnet-turbo.0g.ai",
  sepoliaRpc: () => read("SEPOLIA_RPC_URL") ?? "https://ethereum-sepolia-rpc.publicnode.com",
  ensName: () => read("ENS_NAME") ?? "dream-scape.eth",
  nightMarket: () => read("NIGHT_MARKET_ADDRESS") as `0x${string}` | undefined,
  // Circle's own USDC on Ethereum Sepolia (faucet.circle.com).
  usdc: () => (read("USDC_ADDRESS") ?? "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238") as `0x${string}`,
  ensForkRpc: () => read("ENS_FORK_RPC_URL"),
  arkivAccessKey: () => read("ARKIV_ACCESS_KEY") ?? "",
  dreamRegistry: () => read("DREAM_REGISTRY_ADDRESS") as `0x${string}` | undefined,
  vapidPublic: () => required("VAPID_PUBLIC_KEY"),
  vapidPrivate: () => required("VAPID_PRIVATE_KEY"),
  vapidSubject: () => required("VAPID_SUBJECT"),
  dataDir: () => read("DATA_DIR") ?? `${process.cwd()}/data`,
};
