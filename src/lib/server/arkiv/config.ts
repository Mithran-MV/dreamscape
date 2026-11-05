// Which Arkiv node the server talks to: Rabdi by default, or a local dev node with ARKIV_NETWORK=local.
import { env } from "../env";

export type ArkivNetwork = "rabdi" | "local";

export const RABDI_RPC = "https://rpc.rabdi.db-chain.testnet.arkiv.network";
export const LOCAL_RPC = "http://127.0.0.1:8545";
export const RABDI_EXPLORER = "https://rabdi.explorer.arkiv.network";

export type ArkivConfig = {
  network: ArkivNetwork;
  rpcUrl: string;
  // Only sent to Rabdi. Empty means the public, heavily rate-limited endpoint.
  accessKey: string;
  timeoutMs: number;
};

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function envNetwork(): ArkivNetwork {
  const network = read("ARKIV_NETWORK") ?? "rabdi";
  if (network !== "rabdi" && network !== "local") throw new Error(`ARKIV_NETWORK must be "rabdi" or "local", got "${network}".`);
  return network;
}

// ARKIV_RPC_URL applies to the network ARKIV_NETWORK names; asking for the other network gets its default URL.
export function arkivConfig(network: ArkivNetwork = envNetwork()): ArkivConfig {
  const rpcUrl = network === envNetwork() ? read("ARKIV_RPC_URL") : undefined;
  return {
    network,
    rpcUrl: rpcUrl ?? (network === "local" ? LOCAL_RPC : RABDI_RPC),
    accessKey: network === "rabdi" ? env.arkivAccessKey() : "",
    timeoutMs: 15_000,
  };
}
