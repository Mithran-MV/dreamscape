// The portraits vendor agent. Setup gives it an ENS namespace, binds it on NightMarket, funds its gas and
// opens its stall on Arkiv. Its jobs run in the worker: claim on Arkiv, paint on 0G, store the piece
// encrypted on 0G Storage, then deliver on NightMarket from the agent's own key.
import { NoEntityFoundError } from "@arkiv-network/sdk";
import { createWalletClient, formatEther, http, parseEther, parseEventLogs, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { getDb, now } from "./db";
import { env, required } from "./env";
import { addTrace, getBlob, putBlob } from "./dreams";
import { enqueue, hasOpenJob } from "./jobs";
import { marketAddress } from "./market";
import { notify } from "./push";
import { paint, ZeroGError } from "./zerog/router";
import { putEncrypted } from "./zerog/storage";
import { ensClients, mined, same, type Ens, type Step } from "./ens/client";
import { REG, registryAbi } from "./ens/contracts";
import { AGENT_KEYS, agentAttempt, agentHolder, agentName, marketName, planAgentNamespace, readAgent, setupAgentNamespace, type Prices } from "./ens/agents";
import { arkiv, waitVisible, type Arkiv } from "./arkiv/client";
import { RABDI_EXPLORER } from "./arkiv/config";
import { activeClaim, claimCommission, getCommission as getRequest, heartbeat, liveVendors, publishVendor, renewClaim } from "./arkiv/agents";
import { Vendor } from "./arkiv/schemas";
import {
  ON_CHAIN,
  SERVICE,
  STYLES,
  commissionAbi,
  getCommission,
  getVendor,
  listVendors,
  parseBrief,
  pieceKey,
  pieceOwner,
  pieceSecret,
  readOnChain,
  reader,
  saveVendor,
  stallOpen,
  styleList,
  updateCommission,
  updateVendor,
  type Commission,
  type VendorAgent,
} from "./commissions";

export const AGENT_LABEL = "portraits";
export const START_PRICES: Prices = { [SERVICE]: 4 };
export const AGENT_CONTEXT =
  "Paints a one-of-one portrait in the style you pick, from a short private note. You pay USDC into NightMarket's escrow; the portrait arrives as an ENS name you own, or you take your money back after 48 hours.";

// Gas for the agent: deliveries on Sepolia, claims and heartbeats on Arkiv. Topped up when below the floor.
const ETH_TARGET = parseEther("0.01");
const ETH_FLOOR = parseEther("0.004");
const GLM_TARGET = parseEther("0.05");
const GLM_FLOOR = parseEther("0.02");
// A claim lasts 2 hours; renew it once less than an hour is left, at 2-second blocks.
const CLAIM_RENEW_BLOCKS = BigInt(1800);

export const appUrl = () => (process.env.APP_URL?.trim() || "https://dreamscape.hacklabs.in").replace(/\/+$/, "");
export const agentEndpoint = (label: string) => `${appUrl()}/market/agents/${label}`;

export const agentAccount = () => privateKeyToAccount(required("AGENT_PRIVATE_KEY") as Hex);

// The agent's key must be the one NightMarket lets deliver for this stall.
function agentFor(vendor: VendorAgent) {
  const account = agentAccount();
  if (!same(account.address, vendor.agent)) throw new Error(`AGENT_PRIVATE_KEY is not the key bound for ${agentName(vendor.label)}.`);
  return account;
}

type Owner = { id: string; handle: string; wallet: Address; editions: Address; gallery: string };

// The vendor's human: a dreamer with a gallery name, chosen by handle.
export function vendorOwner(handle = required("VENDOR_OWNER_HANDLE")): Owner {
  const row = getDb().prepare("SELECT id, handle, wallet, ens_json FROM users WHERE handle = ?").get(handle) as
    | { id: string; handle: string; wallet: string | null; ens_json: string | null }
    | undefined;
  if (!row?.wallet || !row.ens_json) throw new Error(`VENDOR_OWNER_HANDLE "${handle}" must be a dreamer with a wallet and a gallery name.`);
  const ens = JSON.parse(row.ens_json) as { name: string; editions: Address };
  return { id: row.id, handle: row.handle, wallet: row.wallet as Address, editions: ens.editions, gallery: ens.name };
}

// What goes on the agent's stall: its ENS name, styles and prices, all public.
async function stallFor(vendor: VendorAgent) {
  const prices = (await readAgent(reader(), vendor.label))?.prices ?? START_PRICES;
  const from = Math.min(...Object.values(prices));
  return {
    agent: vendor.agent,
    ens: agentName(vendor.label),
    style: Object.keys(STYLES).join(", "),
    fromPriceUsdc: BigInt(Math.round(from * 1e6)),
    services: [SERVICE],
    menu: { prices, styles: styleList(), endpoint: agentEndpoint(vendor.label) },
  };
}

async function stallLive(key: Hex, ctx: Arkiv) {
  try {
    await ctx.reader.getEntity(key, Vendor);
    return true;
  } catch (error) {
    if (error instanceof NoEntityFoundError) return false;
    throw error;
  }
}

// The server vouches for the agent by creating its stall and handing it over; the agent keeps it alive.
async function openStall(vendor: VendorAgent, ctx: Arkiv) {
  const wallet = ctx.wallet(agentFor(vendor));
  if (vendor.vendor_key && (await stallLive(vendor.vendor_key, ctx))) {
    const { txHash } = await heartbeat(wallet, vendor.vendor_key, true);
    updateVendor(vendor.label, { last_beat: now() });
    return { key: vendor.vendor_key, txHash, fresh: false };
  }
  const stall = await stallFor(vendor);
  const { key, txHash } = await publishVendor(stall, ctx);
  updateVendor(vendor.label, { vendor_key: key, last_beat: now() });
  return { key, txHash, fresh: true };
}

// Reads only: what exists, what is missing, and what each account holds.
export async function planVendor(ens: Ens = ensClients(), ctx: Arkiv = arkiv()) {
  const missing: string[] = [];
  const label = AGENT_LABEL;
  const server = ens.server.account.address;
  let agent: Address | null = null;
  let owner: Owner | null = null;
  try {
    agent = agentAccount().address;
  } catch (error) {
    missing.push((error as Error).message);
  }
  try {
    owner = vendorOwner();
  } catch (error) {
    missing.push((error as Error).message);
  }
  const market = marketAddress();
  const read = <T>(functionName: "operators" | "agentOwner" | "registryOwner", arg: Address) =>
    ens.client.readContract({ address: market, abi: commissionAbi, functionName, args: [arg] }) as Promise<T>;
  const namespace = await planAgentNamespace(ens.client, server, { label, owner: owner?.wallet ?? server });
  const [operator, serverEth] = await Promise.all([read<boolean>("operators", server), ens.client.getBalance({ address: server })]);
  const chain = {
    serverIsOperator: operator,
    agentBound: agent && owner ? same(await read<Address>("agentOwner", agent), owner.wallet) : false,
    registryBound: owner ? same(await read<Address>("registryOwner", owner.editions), owner.wallet) : false,
    marketMintsForOwner: owner
      ? Boolean((await ens.client.readContract({ address: owner.editions, abi: registryAbi, functionName: "roles", args: [BigInt(0), market] })) & REG.REGISTRAR)
      : false,
  };
  const balances = {
    serverEth,
    agentEth: agent ? await ens.client.getBalance({ address: agent }) : null,
    serverGlm: await ctx.reader.getBalance({ address: ctx.serverAddress }).catch(() => null),
    agentGlm: agent ? await ctx.reader.getBalance({ address: agent }).catch(() => null) : null,
  };
  const stored = getVendor(label);
  const stall = stored?.vendor_key ? await stallLive(stored.vendor_key, ctx).catch(() => null) : false;
  return { label, name: agentName(label), server, agent, owner, missing, namespace, chain, balances, stall, targets: { ETH_TARGET, ETH_FLOOR, GLM_TARGET, GLM_FLOOR } };
}

export type VendorSetup = { name: string; agent: Address; owner: Owner; resolver: Address; marketRegistry: Address; sepolia: Step[]; arkiv: { step: string; hash: Hex }[]; stall: Hex };

// Safe to rerun: each step is skipped once done. The server pays for everything; the owner signs nothing.
export async function setupVendor(ens: Ens = ensClients(), ctx: Arkiv = arkiv(), prices: Prices = START_PRICES): Promise<VendorSetup> {
  const label = AGENT_LABEL;
  const owner = vendorOwner();
  const agent = agentAccount().address;
  const market = marketAddress();
  const server = ens.server;
  const steps: Step[] = [];
  const send = async (step: string, hash: Promise<Hex>) => steps.push(await mined(ens.client, step, await hash));

  // NightMarket mints the one-of-one name in the owner's editions registry, so it must be its registrar there.
  const mints = await ens.client.readContract({ address: owner.editions, abi: registryAbi, functionName: "roles", args: [BigInt(0), market] });
  if (!(mints & REG.REGISTRAR)) throw new Error(`NightMarket can't mint in ${owner.gallery}'s editions registry. Onboard that dreamer with NIGHT_MARKET_ADDRESS set.`);
  if (!(await ens.client.readContract({ address: market, abi: commissionAbi, functionName: "operators", args: [server.account.address] }))) {
    throw new Error("The server isn't a NightMarket operator.");
  }

  const namespace = await setupAgentNamespace(ens, { label, owner: owner.wallet, agent, records: { context: AGENT_CONTEXT, web: agentEndpoint(label), prices } });
  steps.push(...namespace.steps);

  const bound = await ens.client.readContract({ address: market, abi: commissionAbi, functionName: "agentOwner", args: [agent] });
  if (!same(bound, owner.wallet)) await send(`bindAgent ${agentName(label)}`, server.writeContract({ address: market, abi: commissionAbi, functionName: "bindAgent", args: [agent, owner.wallet] }));
  const registry = await ens.client.readContract({ address: market, abi: commissionAbi, functionName: "registryOwner", args: [owner.editions] });
  if (!same(registry, owner.wallet)) {
    await send(`bindRegistry ${owner.gallery}`, server.writeContract({ address: market, abi: commissionAbi, functionName: "bindRegistry", args: [owner.editions, owner.wallet] }));
  }
  const eth = await ens.client.getBalance({ address: agent });
  if (eth < ETH_FLOOR) await send(`send ${formatEther(ETH_TARGET - eth)} ETH to the agent`, server.sendTransaction({ to: agent, value: ETH_TARGET - eth }));

  saveVendor({ label, agent, owner_id: owner.id, owner: owner.wallet, editions: owner.editions, resolver: namespace.resolver, market_registry: namespace.marketRegistry });

  const arkivSteps: { step: string; hash: Hex }[] = [];
  const glm = await ctx.reader.getBalance({ address: agent });
  if (glm < GLM_FLOOR) {
    const hash = await ctx.server.sendTransaction({ to: agent, value: GLM_TARGET - glm });
    await ctx.reader.waitForTransactionReceipt({ hash });
    arkivSteps.push({ step: `send ${formatEther(GLM_TARGET - glm)} GLM to the agent`, hash });
  }
  const stall = await openStall(getVendor(label)!, ctx);
  arkivSteps.push({ step: stall.fresh ? "open the stall, handed to the agent" : "heartbeat", hash: stall.txHash });
  return { name: namespace.name, agent, owner, resolver: namespace.resolver, marketRegistry: namespace.marketRegistry, sepolia: steps, arkiv: arkivSteps, stall: stall.key };
}

// Live stalls, straight from Arkiv: only those the server opened, and only while their agents keep beating.
export async function liveStalls(ctx: Arkiv = arkiv()) {
  const suffix = `.${marketName()}`;
  return (await liveVendors({ openOnly: true }, ctx)).map((v) => {
    const menu = (v.menu ?? {}) as { prices?: unknown };
    return {
      label: v.ens.endsWith(suffix) ? v.ens.slice(0, -suffix.length) : null,
      ens: v.ens,
      style: v.style,
      services: v.services,
      fromPriceUsdc: Number(v.fromPriceUsdc) / 1e6,
      prices: menu.prices && typeof menu.prices === "object" ? (menu.prices as Record<string, unknown>) : null,
      lastBeat: v.lastBeat,
      stall: `${RABDI_EXPLORER}/entity/${v.key}`,
    };
  });
}

// One agent, read from ENS as any client would, with the proof that its own key can't change who gets paid.
export async function agentDetails(label: string) {
  const vendor = getVendor(label);
  if (!vendor) return null;
  const client = reader();
  const found = await readAgent(client, label);
  if (!found) return null;
  const market = marketAddress();
  const [holder, bound, addrAttempt, webAttempt] = await Promise.all([
    agentHolder(client, vendor.market_registry, label),
    client.readContract({ address: market, abi: commissionAbi, functionName: "agentOwner", args: [vendor.agent] }),
    agentAttempt(client, vendor.agent, label, { kind: "addr" }),
    agentAttempt(client, vendor.agent, label, { kind: "text", key: AGENT_KEYS.web }),
  ]);
  const owner = getDb().prepare("SELECT handle, ens_json FROM users WHERE id = ?").get(vendor.owner_id) as { handle: string; ens_json: string | null } | undefined;
  const price = found.prices?.[SERVICE] ?? null;
  return {
    label,
    name: found.name,
    owner: { address: found.address, holder, gallery: owner?.ens_json ? (JSON.parse(owner.ens_json) as { name: string }).name : null },
    agent: vendor.agent,
    records: { context: found.context, web: found.web, prices: found.rawPrices },
    priceUsdc: price,
    styles: styleList(),
    open: Boolean(price) && stallOpen(vendor) && same(bound, vendor.owner) && Boolean(found.address && same(found.address, vendor.owner)),
    proof: {
      ens: `https://sepolia.app.ens.domains/${found.name}`,
      resolver: `https://sepolia.etherscan.io/address/${found.resolver}`,
      market: `https://sepolia.etherscan.io/address/${market}`,
      stall: vendor.vendor_key ? `${RABDI_EXPLORER}/entity/${vendor.vendor_key}` : null,
      addrAttempt: addrAttempt ?? null,
      webAttempt: webAttempt ?? null,
    },
  };
}

export type AgentDetails = NonNullable<Awaited<ReturnType<typeof agentDetails>>>;

// Job 'agent.heartbeat', ref = label: six more hours on the stall, or a fresh stall if it lapsed.
export async function heartbeatJob(label: string) {
  const vendor = getVendor(label);
  if (vendor) await openStall(vendor, arkiv());
}

// Called by the worker every minute: each stall beats about once an hour.
export function scheduleHeartbeats(at = Date.now()) {
  for (const v of listVendors()) {
    if ((v.last_beat ?? 0) < at - 50 * 60_000 && !hasOpenJob(v.label, ["agent.heartbeat"])) enqueue("agent.heartbeat", v.label);
  }
}

// Job 'commission.claim': the agent checks the work itself, the request on Arkiv and the escrow on NightMarket, then claims it.
export async function claimJob(id: string) {
  const c = getCommission(id);
  if (!c?.arkiv_key) return;
  if (c.claim_key) {
    if (c.status === "claimed" && !hasOpenJob(id, ["commission.make"])) enqueue("commission.make", id);
    return;
  }
  if (c.status !== "paid") return;
  const vendor = getVendor(c.agent)!;
  const me = agentFor(vendor);
  const ctx = arkiv();
  const request = await getRequest(c.arkiv_key, ctx);
  const brief = request ? parseBrief(request.brief) : {};
  if (!request || brief.commission !== c.id || brief.vendor !== agentName(c.agent)) throw new Error("The request on Arkiv doesn't name this commission and agent.");
  const onChain = await readOnChain(c.id);
  if (onChain.status === ON_CHAIN.refunded) return updateCommission(id, { status: "refunded" });
  if (onChain.status !== ON_CHAIN.open || !same(onChain.vendorAgent, me.address)) throw new Error("NightMarket holds no open escrow for this agent.");
  const key = (await activeClaim(c.arkiv_key, me.address, ctx))?.key ?? (await claim(c, me, ctx));
  updateCommission(id, { claim_key: key, status: "claimed", error: null });
  enqueue("commission.make", id);
}

// A new claim, visible before anyone is told about it.
async function claim(c: Commission, me: ReturnType<typeof agentAccount>, ctx: Arkiv) {
  const { entityKey } = await claimCommission(ctx.wallet(me), { commission: c.arkiv_key!, vendorEns: agentName(c.agent) });
  await waitVisible(entityKey, ctx);
  return entityKey;
}

// The claim lasts two hours, and 0G may keep the agent waiting longer, so each attempt renews it or claims again.
async function keepClaim(c: Commission, me: ReturnType<typeof agentAccount>, ctx: Arkiv) {
  let expiresAt: bigint | null = null;
  try {
    expiresAt = (await ctx.reader.getEntity(c.claim_key!)).$expiresAt;
  } catch (error) {
    if (!(error instanceof NoEntityFoundError)) throw error;
  }
  const head = await ctx.reader.getBlockNumber();
  if (expiresAt === null || expiresAt <= head) updateCommission(c.id, { claim_key: await claim(c, me, ctx) });
  else if (expiresAt - head < CLAIM_RENEW_BLOCKS) await renewClaim(ctx.wallet(me), c.claim_key!);
}

export function commissionPrompt(c: Pick<Commission, "style" | "note">) {
  return `A one-of-one commissioned portrait in ${STYLES[c.style].prompt}, warm and dreamlike, made for one person. ${c.note} No text, no letters, no signature, no watermark, no border.`;
}

// 0G Storage being down is worth waiting out like a busy enclave, so its errors retry as long as the router's do.
async function store(bytes: Buffer, id: string): Promise<Hex> {
  let root: string;
  try {
    root = (await putEncrypted(bytes, pieceSecret(id))).root;
  } catch (error) {
    throw new ZeroGError(503, `0G Storage: ${(error as Error).message}`);
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(root) || /^0x0+$/.test(root)) throw new Error(`0G Storage gave no usable root (${root}).`);
  return root as Hex;
}

// Job 'commission.make': paint, store, deliver. Each step is skipped if an earlier attempt finished it,
// and a failure is thrown so the worker waits and tries again, as it does for dreams.
export async function makeJob(id: string) {
  const c = getCommission(id);
  if (!c?.claim_key || !["claimed", "making"].includes(c.status)) return;
  try {
    await make(c);
  } catch (error) {
    updateCommission(id, { error: (error as Error).message.slice(0, 300) });
    throw error;
  }
}

async function make(c: Commission) {
  const vendor = getVendor(c.agent)!;
  const me = agentFor(vendor);
  const ctx = arkiv();
  if ((await reader().getBlock()).timestamp > BigInt(c.deadline)) return updateCommission(c.id, { status: "late" });
  // A lapsed claim only matters to other agents; only this one can deliver, so Arkiv being slow doesn't stop the work.
  await keepClaim(c, me, ctx).catch((error) => console.warn(`[vendor] claim on ${c.id}: ${(error as Error).message.split("\n")[0]}`));
  updateCommission(c.id, { status: "making" });

  let piece = getBlob(pieceOwner(c.id), pieceKey(c.id));
  if (!piece) {
    const { png, trace } = await paint(commissionPrompt(c));
    addTrace(c.id, "commission", trace);
    putBlob(pieceOwner(c.id), pieceKey(c.id), "image/png", png);
    piece = { mime: "image/png", bytes: png };
  }
  let root = c.storage_root;
  if (!root) {
    root = await store(piece.bytes, c.id);
    updateCommission(c.id, { storage_root: root });
  }
  await deliver(c, me, root);
}

// From the agent's own key: NightMarket pays the owner, keeps 5% for the commons and mints the name to the buyer.
async function deliver(c: Commission, me: ReturnType<typeof agentAccount>, root: Hex) {
  const client = reader();
  const market = marketAddress();
  const onChain = await readOnChain(c.id);
  if (onChain.status === ON_CHAIN.refunded) return updateCommission(c.id, { status: "refunded" });
  let hash: Hex | null = null;
  let tokenId: bigint | undefined;
  if (onChain.status === ON_CHAIN.open) {
    const wallet = createWalletClient({ account: me, chain: sepolia, transport: http(env.sepoliaRpc()) });
    hash = await wallet.writeContract({ address: market, abi: commissionAbi, functionName: "deliver", args: [c.id, root] });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`deliver reverted in ${hash}`);
    tokenId = parseEventLogs({ abi: commissionAbi, logs: receipt.logs, eventName: "CommissionDelivered" }).find((l) => l.args.commissionId === c.id)?.args.tokenId;
  } else if (onChain.status === ON_CHAIN.delivered) {
    // A rerun after the delivery landed: find it rather than send another.
    const fromBlock = c.pay_block ? BigInt(c.pay_block) : (await client.getBlockNumber()) - BigInt(50_000);
    const [log] = await client.getContractEvents({ address: market, abi: commissionAbi, eventName: "CommissionDelivered", args: { commissionId: c.id }, fromBlock });
    hash = log?.transactionHash ?? null;
    tokenId = log?.args.tokenId;
  } else {
    throw new Error("NightMarket has no escrow for this commission.");
  }
  updateCommission(c.id, { status: "delivered", deliver_tx: hash, token_id: tokenId?.toString() ?? null, error: null });
  enqueue("commission.notify", c.id);
}

// Job 'commission.notify': tell the buyer's phone. The notice says nothing about the piece itself.
export async function notifyJob(id: string) {
  const c = getCommission(id);
  if (c?.status !== "delivered") return;
  await notify(c.buyer_id, { title: "Your commission is ready", body: "The agent delivered it. Open it with your new name.", url: `/market/agents/${c.agent}?c=${c.id}`, tag: c.id });
}
