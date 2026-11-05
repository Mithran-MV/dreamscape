// viem clients and shared helpers for ENSv2 on Sepolia. Pass an RPC URL to point everything at a local fork.
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  keccak256,
  namehash,
  stringToHex,
  toHex,
  zeroAddress,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type Transport,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { normalize, packetToBytes } from "viem/ens";
import { env } from "../env";
import {
  UNIVERSAL_HELPER,
  UNIVERSAL_RESOLVER,
  VERIFIABLE_FACTORY,
  factoryAbi,
  helperAbi,
  registryAbi,
  universalResolverAbi,
} from "./contracts";

export function ensReader(rpcUrl = env.sepoliaRpc()) {
  return createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
}

export function ensClients(rpcUrl = env.sepoliaRpc()) {
  const wallet = (key: Hex) => createWalletClient({ account: privateKeyToAccount(key), chain: sepolia, transport: http(rpcUrl) });
  return { client: ensReader(rpcUrl), server: wallet(env.serverKey()), scribe: wallet(env.scribeKey()) };
}

export type Reader = ReturnType<typeof ensReader>;
export type Ens = ReturnType<typeof ensClients>;
export type Wallet = WalletClient<Transport, Chain, Account>;
export type Step = { step: string; hash: Hex; gasUsed: bigint };

// The four text keys the scribe may write, on every name served by a dreamer's resolver.
export const DAY_KEYS = {
  root: "dreamscape.root",
  saga: "dreamscape.saga",
  date: "dreamscape.date",
  scope: "dreamscape.scope",
} as const;

// Labels kept for our own namespaces under dream-scape.eth.
const RESERVED = new Set(["market", "world", "mumbai"]);

export const dns = (name: string) => toHex(packetToBytes(name));
export const galleryName = (handle: string) => `${handle}.${env.ensName()}`;
export const dayName = (handle: string, date: string) => `${date}.${galleryName(handle)}`;
export const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function checkHandle(handle: string) {
  let ok = false;
  try {
    ok = handle !== "" && !handle.includes(".") && normalize(handle) === handle && !RESERVED.has(handle);
  } catch {}
  if (!ok) throw new Error(`"${handle}" can't be a handle: use one lowercase label that isn't reserved.`);
}

export function checkDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`"${date}" is not a YYYY-MM-DD date.`);
}

// Walks from the root registry to the registry holding our parent name, so a Sepolia redeploy fails loudly here.
export async function findParent(client: Reader) {
  const [root, helperRoot] = await Promise.all([
    client.readContract({ address: UNIVERSAL_RESOLVER, abi: universalResolverAbi, functionName: "ROOT_REGISTRY" }),
    client.readContract({ address: UNIVERSAL_HELPER, abi: helperAbi, functionName: "ROOT_REGISTRY" }),
  ]);
  if (!same(root, helperRoot)) throw new Error("ENS Sepolia was redeployed: update the addresses in src/lib/server/ens/contracts.ts.");
  const [label, ...rest] = env.ensName().split(".");
  let registry: Address = root;
  for (const part of rest.reverse()) {
    registry = await client.readContract({ address: registry, abi: registryAbi, functionName: "getSubregistry", args: [part] });
    if (registry === zeroAddress) throw new Error(`.${part} has no registry.`);
  }
  const args = [label] as const;
  const [owner, expiry, subregistry] = await Promise.all([
    client.readContract({ address: registry, abi: registryAbi, functionName: "findOwner", args }),
    client.readContract({ address: registry, abi: registryAbi, functionName: "findExpiry", args }),
    client.readContract({ address: registry, abi: registryAbi, functionName: "getSubregistry", args }),
  ]);
  if (owner === zeroAddress) throw new Error(`${env.ensName()} is not registered.`);
  return { root, registry, label, owner, expiry, subregistry };
}

// Salts follow the ENS docs: keccak256(abi.encode(keccak256(kind), key, version)).
export function registrySalt(name: string, version = BigInt(0)) {
  const types = [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }] as const;
  return BigInt(keccak256(encodeAbiParameters(types, [keccak256(stringToHex("UserRegistry")), namehash(name), version])));
}

export function resolverSalt(owner: Address, version = BigInt(0)) {
  const types = [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }] as const;
  return BigInt(keccak256(encodeAbiParameters(types, [keccak256(stringToHex("OwnedResolver")), owner, version])));
}

export function predictProxy(client: Reader, deployer: Address, salt: bigint) {
  return client.readContract({ address: VERIFIABLE_FACTORY, abi: factoryAbi, functionName: "predictProxyAddress", args: [deployer, salt] });
}

// Deploys a proxy through the VerifiableFactory unless the server already did with this salt. The deployer gets no roles.
export async function deployProxy(ens: Ens, step: string, implementation: Address, salt: bigint, data: Hex) {
  const address = await predictProxy(ens.client, ens.server.account.address, salt);
  if (await ens.client.getCode({ address })) return { address, fresh: false, step: undefined };
  const hash = await ens.server.writeContract({ address: VERIFIABLE_FACTORY, abi: factoryAbi, functionName: "deployProxy", args: [implementation, salt, data] });
  return { address, fresh: true, step: await mined(ens.client, step, hash) };
}

export async function mined(client: Reader, step: string, hash: Hex): Promise<Step> {
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${step} reverted in ${hash}`);
  return { step, hash, gasUsed: receipt.gasUsed };
}

// The custom error a contract call reverted with, such as "EACUnauthorizedAccountRoles".
export function revertName(error: unknown) {
  if (!(error instanceof BaseError)) return undefined;
  const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
  return revert instanceof ContractFunctionRevertedError ? (revert.data?.errorName ?? revert.reason ?? "reverted") : undefined;
}
