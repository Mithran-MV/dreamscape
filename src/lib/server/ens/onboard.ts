// Onboarding: the server pays for everything and the dreamer signs nothing. Each dreamer gets
// a Permissioned Resolver they own, an emancipated editions registry, a passes registry, and <handle>.dream-scape.eth.
import { encodeFunctionData, keccak256, maxUint64, stringToHex, zeroAddress, type Address, type Hex } from "viem";
import { env } from "../env";
import { ALL_ROLES, PERMISSIONED_RESOLVER_IMPL, REG, RES, USER_REGISTRY_IMPL, admin, registryAbi, resolverAbi, withAdmin } from "./contracts";
import {
  DAY_KEYS,
  checkHandle,
  deployProxy,
  dns,
  findParent,
  galleryName,
  mined,
  registrySalt,
  resolverSalt,
  same,
  type Ens,
  type Reader,
  type Step,
} from "./client";

type Grant = { account: Address; roleBitmap: bigint };

// What the dreamer holds on their gallery name, and on the passes node inside their editions registry.
const GALLERY_ROLES = withAdmin(REG.SET_SUBREGISTRY, REG.SET_RESOLVER) | REG.CAN_TRANSFER_ADMIN;
const PASSES_NODE_ROLES = withAdmin(REG.SET_SUBREGISTRY, REG.SET_RESOLVER);

// Every role on the resolver goes to the dreamer. The server gets only the text admin role, and drops it after granting the scribe.
function resolverInit(dreamer: Address, server: Address, name: string, url?: string) {
  const calls = [encodeFunctionData({ abi: resolverAbi, functionName: "setAddress", args: [dns(name), BigInt(60), dreamer] })];
  if (url) calls.push(encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [dns(name), "url", url] }));
  const grants = [
    { account: dreamer, roleBitmap: ALL_ROLES },
    { account: server, roleBitmap: admin(RES.SET_TEXT) },
  ];
  return encodeFunctionData({ abi: resolverAbi, functionName: "initialize", args: [grants, calls] });
}

const registryInit = (grants: Grant[]) => encodeFunctionData({ abi: registryAbi, functionName: "initialize", args: [grants] });

// Emancipated at birth, so editions are forever. NightMarket may mint; the server's roles here are temporary.
function editionsGrants(dreamer: Address, server: Address, nightMarket?: Address): Grant[] {
  return [
    { account: dreamer, roleBitmap: withAdmin(REG.REGISTRAR, REG.RENEW, REG.SET_URI, REG.SET_PARENT) },
    { account: server, roleBitmap: withAdmin(REG.REGISTRAR, REG.SET_PARENT) },
    ...(nightMarket ? [{ account: nightMarket, roleBitmap: REG.REGISTRAR }] : []),
  ];
}

// Managed on purpose: the dreamer can revoke a pass. The server may register passes, so granting one costs the dreamer nothing.
function passesGrants(dreamer: Address, server: Address): Grant[] {
  return [
    { account: dreamer, roleBitmap: withAdmin(REG.REGISTRAR, REG.UNREGISTER, REG.RENEW, REG.SET_URI, REG.SET_PARENT) },
    { account: server, roleBitmap: REG.REGISTRAR | withAdmin(REG.SET_PARENT) },
  ];
}

export type Onboarded = { name: string; dreamer: Address; resolver: Address; editions: Address; passes: Address; steps: Step[] };

// Safe to rerun after a failure: finished steps are skipped. One handle per dreamer, since the resolver is per account.
export async function onboardDreamer(
  ens: Ens,
  { handle, dreamer, nightMarket = env.nightMarket(), url }: { handle: string; dreamer: Address; nightMarket?: Address; url?: string },
): Promise<Onboarded> {
  checkHandle(handle);
  const { client, server: wallet } = ens;
  const server = wallet.account.address;
  const scribe = ens.scribe.account.address;
  const name = galleryName(handle);
  const parent = await findParent(client);
  const dreamscape = parent.subregistry;
  if (dreamscape === zeroAddress) throw new Error(`${env.ensName()} has no registry yet. Run the bootstrap and mount it first.`);
  const holder = await client.readContract({ address: dreamscape, abi: registryAbi, functionName: "findOwner", args: [handle] });
  if (holder !== zeroAddress && !same(holder, dreamer)) throw new Error(`${name} is taken.`);
  const steps: Step[] = [];
  const send = async (step: string, hash: Promise<Hex>) => steps.push(await mined(client, step, await hash));
  const rootRoles = (registry: Address, account: Address) =>
    client.readContract({ address: registry, abi: registryAbi, functionName: "roles", args: [BigInt(0), account] });

  // The dreamer's resolver, then the scribe's four keys and the server's exit, in one multicall.
  const resolver = await deployProxy(ens, "deploy resolver", PERMISSIONED_RESOLVER_IMPL, resolverSalt(dreamer), resolverInit(dreamer, server, name, url));
  if (resolver.step) steps.push(resolver.step);
  const serverText = await client.readContract({ address: resolver.address, abi: resolverAbi, functionName: "roles", args: [BigInt(0), server] });
  if (serverText & admin(RES.SET_TEXT)) {
    const calls = Object.values(DAY_KEYS).map((key) =>
      encodeFunctionData({
        abi: resolverAbi,
        functionName: "grantSetterRoles",
        args: [encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: ["0x", key, ""] }), scribe],
      }),
    );
    calls.push(encodeFunctionData({ abi: resolverAbi, functionName: "revokeRootRoles", args: [admin(RES.SET_TEXT), server] }));
    await send("grant the scribe 4 day keys, drop the server's admin", wallet.writeContract({ address: resolver.address, abi: resolverAbi, functionName: "multicall", args: [calls] }));
  }

  const passes = await deployProxy(ens, "deploy passes registry", USER_REGISTRY_IMPL, registrySalt(`passes.${name}`), registryInit(passesGrants(dreamer, server)));
  if (passes.step) steps.push(passes.step);
  const editions = await deployProxy(ens, "deploy editions registry", USER_REGISTRY_IMPL, registrySalt(name), registryInit(editionsGrants(dreamer, server, nightMarket)));
  if (editions.step) steps.push(editions.step);
  // Salts are per name, so an existing registry must already belong to this dreamer.
  for (const registry of [passes.address, editions.address]) {
    if (!((await rootRoles(registry, dreamer)) & REG.REGISTRAR)) throw new Error(`${registry} was set up for another dreamer.`);
  }

  // Point each registry at its parent, register the passes node, then drop the server's temporary roles.
  const setParent = async (registry: Address, parentRegistry: Address, label: string) => {
    const [current, currentLabel] = await client.readContract({ address: registry, abi: registryAbi, functionName: "getParent" });
    if (same(current, parentRegistry) && currentLabel === label) return;
    await send(`setParent ${label}`, wallet.writeContract({ address: registry, abi: registryAbi, functionName: "setParent", args: [parentRegistry, label] }));
  };
  const drop = async (registry: Address, roles: bigint, step: string) => {
    if ((await rootRoles(registry, server)) & roles) {
      await send(step, wallet.writeContract({ address: registry, abi: registryAbi, functionName: "revokeRootRoles", args: [roles, server] }));
    }
  };
  await setParent(passes.address, editions.address, "passes");
  await drop(passes.address, withAdmin(REG.SET_PARENT), "drop the server's set-parent roles on passes");
  await setParent(editions.address, dreamscape, handle);
  const passesOwner = await client.readContract({ address: editions.address, abi: registryAbi, functionName: "findOwner", args: ["passes"] });
  if (passesOwner === zeroAddress) {
    await send(
      "register passes node",
      wallet.writeContract({
        address: editions.address,
        abi: registryAbi,
        functionName: "register",
        args: ["passes", dreamer, passes.address, zeroAddress, PASSES_NODE_ROLES, maxUint64],
      }),
    );
  }
  await drop(editions.address, withAdmin(REG.REGISTRAR, REG.SET_PARENT), "drop the server's roles on editions");

  // The gallery name lives as long as dream-scape.eth. Nobody can take it back: DreamscapeRegistry is emancipated.
  if (holder === zeroAddress) {
    await send(
      `register ${name}`,
      wallet.writeContract({
        address: dreamscape,
        abi: registryAbi,
        functionName: "register",
        args: [handle, dreamer, editions.address, resolver.address, GALLERY_ROLES, parent.expiry],
      }),
    );
  }
  return { name, dreamer, resolver: resolver.address, editions: editions.address, passes: passes.address, steps };
}

// PermissionedResolverLib.resource(string): the resource a key-scoped grant lives on.
export const keyResource = (key: string) => BigInt(keccak256(stringToHex(key)));

// An account's roles on a resolver, at the root and on each day key. For the "who controls what" table.
export async function resolverRoles(client: Reader, resolver: Address, account: Address) {
  const read = (resource: bigint) => client.readContract({ address: resolver, abi: resolverAbi, functionName: "roles", args: [resource, account] });
  const keys = await Promise.all(Object.values(DAY_KEYS).map(async (key) => ({ key, roles: await read(keyResource(key)) })));
  return { root: await read(BigInt(0)), keys };
}
