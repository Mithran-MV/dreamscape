// Vendor agents as ENS namespaces. market.dream-scape.eth is a registry the server controls; each agent in it,
// such as portraits.market.dream-scape.eth, is owned by its human and has its own Permissioned Resolver,
// because grantSetterRoles covers every name on a resolver. The agent's key may write only two text keys there.
import { encodeAbiParameters, encodeFunctionData, keccak256, namehash, stringToHex, zeroAddress, type Address, type Hex } from "viem";
import { env } from "../env";
import { ALL_ROLES, PERMISSIONED_RESOLVER_IMPL, REG, RES, UNIVERSAL_RESOLVER, USER_REGISTRY_IMPL, admin, registryAbi, resolverAbi, universalResolverAbi, withAdmin } from "./contracts";
import { deployProxy, dns, findParent, mined, predictProxy, registrySalt, revertName, same, type Ens, type Reader, type Step, type Wallet } from "./client";
import { keyResource } from "./onboard";

export const MARKET_LABEL = "market";
export const marketName = () => `${MARKET_LABEL}.${env.ensName()}`;
export const agentName = (label: string) => `${label}.${marketName()}`;

// ENSIP-26's context and web endpoint, plus the agent's price list in USDC.
export const AGENT_KEYS = { context: "agent-context", web: "agent-endpoint[web]", prices: "prices" } as const;
export const AGENT_WRITABLE = [AGENT_KEYS.context, AGENT_KEYS.prices] as const;

export type Prices = Record<string, number>;
export type AgentRecords = { context: string; web: string; prices: Prices };

// The market registry is managed on purpose: the server registers agents and can take a name back.
const MARKET_REGISTRY_ROLES = withAdmin(REG.REGISTRAR, REG.UNREGISTER, REG.RENEW, REG.SET_PARENT);
// What the server holds on market.dream-scape.eth itself, and the human on their agent's name.
const MARKET_NAME_ROLES = withAdmin(REG.SET_SUBREGISTRY, REG.SET_RESOLVER);
const AGENT_NAME_ROLES = withAdmin(REG.SET_RESOLVER);

function checkLabel(label: string) {
  if (!/^[a-z0-9-]{3,32}$/.test(label)) throw new Error(`"${label}" can't be an agent label.`);
}

// One resolver per agent name, so the salt follows the name rather than the owner.
export function agentResolverSalt(name: string, version = BigInt(0)) {
  const types = [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }] as const;
  return BigInt(keccak256(encodeAbiParameters(types, [keccak256(stringToHex("AgentResolver")), namehash(name), version])));
}

// The owner gets every role. The server gets only the text admin role, and drops it after granting the agent its keys.
function resolverInit(owner: Address, server: Address, name: string, records: AgentRecords) {
  const text = (key: string, value: string) => encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [dns(name), key, value] });
  const calls = [
    encodeFunctionData({ abi: resolverAbi, functionName: "setAddress", args: [dns(name), BigInt(60), owner] }),
    text(AGENT_KEYS.context, records.context),
    text(AGENT_KEYS.web, records.web),
    text(AGENT_KEYS.prices, JSON.stringify(records.prices)),
  ];
  const grants = [
    { account: owner, roleBitmap: ALL_ROLES },
    { account: server, roleBitmap: admin(RES.SET_TEXT) },
  ];
  return encodeFunctionData({ abi: resolverAbi, functionName: "initialize", args: [grants, calls] });
}

const rootRoles = (client: Reader, contract: Address, account: Address) =>
  client.readContract({ address: contract, abi: registryAbi, functionName: "roles", args: [BigInt(0), account] });

// Reads only: where everything is (or will be), and what is still missing.
export async function planAgentNamespace(client: Reader, server: Address, { label, owner }: { label: string; owner: Address }) {
  checkLabel(label);
  const parent = await findParent(client);
  const dreamscape = parent.subregistry;
  if (dreamscape === zeroAddress) throw new Error(`${env.ensName()} has no registry yet. Run the bootstrap and mount it first.`);
  const name = agentName(label);
  const [marketRegistry, resolver] = await Promise.all([
    predictProxy(client, server, registrySalt(marketName())),
    predictProxy(client, server, agentResolverSalt(name)),
  ]);
  const [registryCode, resolverCode, marketOwner, serverRoles] = await Promise.all([
    client.getCode({ address: marketRegistry }),
    client.getCode({ address: resolver }),
    client.readContract({ address: dreamscape, abi: registryAbi, functionName: "findOwner", args: [MARKET_LABEL] }),
    rootRoles(client, dreamscape, server),
  ]);
  const agentOwner = registryCode ? await client.readContract({ address: marketRegistry, abi: registryAbi, functionName: "findOwner", args: [label] }) : zeroAddress;
  const serverText = resolverCode ? await client.readContract({ address: resolver, abi: resolverAbi, functionName: "roles", args: [BigInt(0), server] }) : BigInt(0);
  return {
    name,
    dreamscape,
    expiry: parent.expiry,
    serverIsRegistrar: Boolean(serverRoles & REG.REGISTRAR),
    marketRegistry: { address: marketRegistry, deployed: Boolean(registryCode) },
    marketName: { name: marketName(), owner: marketOwner, registered: marketOwner !== zeroAddress },
    resolver: { address: resolver, deployed: Boolean(resolverCode), granted: Boolean(resolverCode) && !(serverText & admin(RES.SET_TEXT)) },
    agentName: { owner: agentOwner, registered: agentOwner !== zeroAddress, ownerMatches: same(agentOwner, owner) },
  };
}

export type AgentNamespace = { name: string; owner: Address; agent: Address; marketRegistry: Address; resolver: Address; steps: Step[] };

// Safe to rerun after a failure: finished steps are skipped. The owner signs nothing; the server pays.
export async function setupAgentNamespace(
  ens: Ens,
  { label, owner, agent, records }: { label: string; owner: Address; agent: Address; records: AgentRecords },
): Promise<AgentNamespace> {
  checkLabel(label);
  if (same(owner, agent)) throw new Error("The agent needs its own key, apart from its owner's wallet.");
  const { client, server: wallet } = ens;
  const server = wallet.account.address;
  const parent = await findParent(client);
  const dreamscape = parent.subregistry;
  if (dreamscape === zeroAddress) throw new Error(`${env.ensName()} has no registry yet. Run the bootstrap and mount it first.`);
  const name = agentName(label);
  const steps: Step[] = [];
  const send = async (step: string, hash: Promise<Hex>) => steps.push(await mined(client, step, await hash));

  // The market's own registry, pointed at its parent so it is canonical.
  const registryInit = encodeFunctionData({ abi: registryAbi, functionName: "initialize", args: [[{ account: server, roleBitmap: MARKET_REGISTRY_ROLES }]] });
  const registry = await deployProxy(ens, "deploy the market registry", USER_REGISTRY_IMPL, registrySalt(marketName()), registryInit);
  if (registry.step) steps.push(registry.step);
  if (!((await rootRoles(client, registry.address, server)) & REG.REGISTRAR)) throw new Error(`${registry.address} is not the server's market registry.`);
  const [currentParent, currentLabel] = await client.readContract({ address: registry.address, abi: registryAbi, functionName: "getParent" });
  if (!same(currentParent, dreamscape) || currentLabel !== MARKET_LABEL) {
    await send("setParent market", wallet.writeContract({ address: registry.address, abi: registryAbi, functionName: "setParent", args: [dreamscape, MARKET_LABEL] }));
  }
  const marketHolder = await client.readContract({ address: dreamscape, abi: registryAbi, functionName: "findOwner", args: [MARKET_LABEL] });
  if (marketHolder === zeroAddress) {
    await send(
      `register ${marketName()}`,
      wallet.writeContract({
        address: dreamscape,
        abi: registryAbi,
        functionName: "register",
        args: [MARKET_LABEL, server, registry.address, zeroAddress, MARKET_NAME_ROLES, parent.expiry],
      }),
    );
  } else if (!same(marketHolder, server)) {
    throw new Error(`${marketName()} belongs to ${marketHolder}, not the server.`);
  }

  // The agent's own resolver, then its two keys and the server's exit, in one multicall.
  const resolver = await deployProxy(ens, "deploy the agent's resolver", PERMISSIONED_RESOLVER_IMPL, agentResolverSalt(name), resolverInit(owner, server, name, records));
  if (resolver.step) steps.push(resolver.step);
  const ownerRoles = await client.readContract({ address: resolver.address, abi: resolverAbi, functionName: "roles", args: [BigInt(0), owner] });
  if (ownerRoles !== ALL_ROLES) throw new Error(`${resolver.address} was set up for another owner.`);
  const serverText = await client.readContract({ address: resolver.address, abi: resolverAbi, functionName: "roles", args: [BigInt(0), server] });
  if (serverText & admin(RES.SET_TEXT)) {
    const calls = AGENT_WRITABLE.map((key) =>
      encodeFunctionData({
        abi: resolverAbi,
        functionName: "grantSetterRoles",
        args: [encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: ["0x", key, ""] }), agent],
      }),
    );
    calls.push(encodeFunctionData({ abi: resolverAbi, functionName: "revokeRootRoles", args: [admin(RES.SET_TEXT), server] }));
    await send("grant the agent 2 keys, drop the server's admin", wallet.writeContract({ address: resolver.address, abi: resolverAbi, functionName: "multicall", args: [calls] }));
  }

  // The agent's name, owned by its human, served by its own resolver. It lasts as long as the market's name.
  const holder = await client.readContract({ address: registry.address, abi: registryAbi, functionName: "findOwner", args: [label] });
  if (holder === zeroAddress) {
    const expiry = await client.readContract({ address: dreamscape, abi: registryAbi, functionName: "findExpiry", args: [MARKET_LABEL] });
    await send(
      `register ${name}`,
      wallet.writeContract({ address: registry.address, abi: registryAbi, functionName: "register", args: [label, owner, zeroAddress, resolver.address, AGENT_NAME_ROLES, expiry] }),
    );
  } else if (!same(holder, owner)) {
    throw new Error(`${name} belongs to someone else.`);
  }
  return { name, owner, agent, marketRegistry: registry.address, resolver: resolver.address, steps };
}

// A prices record is the agent's to write, so anything that isn't a small map of sane numbers reads as none.
export function parsePrices(value: string | null): Prices | null {
  try {
    const raw = JSON.parse(value ?? "") as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const out: Prices = {};
    for (const [service, price] of Object.entries(raw).slice(0, 8)) {
      if (typeof price === "number" && Number.isFinite(price) && price >= 0.5 && price <= 1000) out[service] = price;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

// Reads through the Universal Resolver, as any ENS client would. The resolver must be the name's own.
export async function readAgent(client: Reader, label: string) {
  checkLabel(label);
  const name = agentName(label);
  const [resolver, , offset] = await client.readContract({ address: UNIVERSAL_RESOLVER, abi: universalResolverAbi, functionName: "findResolver", args: [dns(name)] });
  if (offset !== BigInt(0) || resolver === zeroAddress) return null;
  const text = (key: string) => client.getEnsText({ name, key, strict: true, universalResolverAddress: UNIVERSAL_RESOLVER });
  const [address, context, web, prices] = await Promise.all([
    client.getEnsAddress({ name, strict: true, universalResolverAddress: UNIVERSAL_RESOLVER }),
    text(AGENT_KEYS.context),
    text(AGENT_KEYS.web),
    text(AGENT_KEYS.prices),
  ]);
  return { name, resolver: resolver as Address, address, context, web, prices: parsePrices(prices), rawPrices: prices };
}

// An account's roles on the agent's resolver: at the root, and on each key that matters.
export async function agentRoles(client: Reader, resolver: Address, account: Address) {
  const read = (resource: bigint) => client.readContract({ address: resolver, abi: resolverAbi, functionName: "roles", args: [resource, account] });
  const keys = await Promise.all(Object.values(AGENT_KEYS).map(async (key) => ({ key, roles: await read(keyResource(key)) })));
  return { root: await read(BigInt(0)), keys };
}

export type Attempt = { kind: "text"; key: string } | { kind: "addr" };

// Simulates a write from `account` to the agent's own name. Returns the revert's error name, or undefined if it would go through.
export async function agentAttempt(client: Reader, account: Address, label: string, attempt: Attempt) {
  const found = await readAgent(client, label);
  if (!found) throw new Error(`${agentName(label)} has no resolver of its own.`);
  const name = dns(found.name);
  try {
    if (attempt.kind === "addr") {
      await client.simulateContract({ account, address: found.resolver, abi: resolverAbi, functionName: "setAddress", args: [name, BigInt(60), account] });
    } else {
      await client.simulateContract({ account, address: found.resolver, abi: resolverAbi, functionName: "setText", args: [name, attempt.key, "agent"] });
    }
    return undefined;
  } catch (error) {
    const reason = revertName(error);
    if (!reason) throw error;
    return reason;
  }
}

// The agent changes its own prices, the one record besides its context that it may write.
export async function setAgentPrices(client: Reader, agent: Wallet, label: string, prices: Prices) {
  const found = await readAgent(client, label);
  if (!found) throw new Error(`${agentName(label)} has no resolver of its own.`);
  const hash = await agent.writeContract({ address: found.resolver, abi: resolverAbi, functionName: "setText", args: [dns(found.name), AGENT_KEYS.prices, JSON.stringify(prices)] });
  return mined(client, `agent sets prices on ${found.name}`, hash);
}

// Who holds the agent's name, read from the market registry by label.
export function agentHolder(client: Reader, marketRegistry: Address, label: string) {
  return client.readContract({ address: marketRegistry, abi: registryAbi, functionName: "findOwner", args: [label] });
}
