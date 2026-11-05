// Vendor agents on Arkiv: stalls kept alive by heartbeats, and commission requests, bids and claims that expire on their own.
// Escrow and payment stay in NightMarket.
import { ExpirationTime, NoEntityFoundError, type FullRow, type SchemaRef } from "@arkiv-network/sdk";
import { and, asc, eq, lte, type Expression } from "@arkiv-network/sdk/query";
import { bytes, key, u64 } from "@arkiv-network/sdk/schema";
import { hexToString, isAddressEqual, stringToBytes, type Address, type Hex } from "viem";
import { arkiv, createFor, nowSeconds, type Arkiv, type ArkivWallet, type Written } from "./client";
import { Bid, Claim, clampStr, Commission, serviceColumn, SERVICES, Vendor, type Service } from "./schemas";

const VENDOR_LEASE = () => ExpirationTime.fromHours(6);
const CLAIM_LEASE = () => ExpirationTime.fromHours(2);
const MAX_MENU_BYTES = 8 * 1024;
const MAX_BRIEF_BYTES = 1024;

export type NewVendor = {
  agent: Address; // the agent's wallet, which becomes $owner and sends the heartbeats
  ens: string;
  style: string;
  fromPriceUsdc: bigint;
  services: Service[];
  menu: unknown; // public JSON
};

export type VendorRow = { key: Hex; agent: Address; expiresAt: bigint; ens: string; style: string; fromPriceUsdc: bigint; services: Service[]; open: boolean; menu: unknown; lastBeat: number };

function toVendor(row: FullRow<typeof Vendor>): VendorRow {
  return {
    key: row.$key,
    agent: row.$owner,
    expiresAt: row.$expiresAt,
    ens: row.ens.value,
    style: row.style.value,
    fromPriceUsdc: row.fromPriceUsdc.value,
    services: SERVICES.filter((s) => row[serviceColumn(s)].value),
    open: row.open.value,
    menu: parseMenu(row.menu.value),
    lastBeat: Number(row.lastBeat.value),
  };
}

// The agent owns its stall and can patch the menu to anything, so a menu that isn't JSON reads as null.
function parseMenu(hex: Hex): unknown {
  try {
    return JSON.parse(hexToString(hex));
  } catch {
    return null;
  }
}

function textBytes(text: string, max: number) {
  const encoded = stringToBytes(text);
  if (encoded.length > max) throw new Error(`Must be at most ${max} bytes, got ${encoded.length}.`);
  return bytes(encoded);
}

// The server vouches for an agent (it's bound in NightMarket) by creating its stall, then hands it to the agent.
export function publishVendor(input: NewVendor, ctx: Arkiv = arkiv()): Promise<Written> {
  const services = new Set(input.services);
  return createFor(
    ctx,
    Vendor,
    {
      ens: clampStr(input.ens),
      style: clampStr(input.style),
      fromPriceUsdc: u64(input.fromPriceUsdc),
      does_comic: services.has("comic"),
      does_portrait: services.has("portrait"),
      does_saga: services.has("saga"),
      does_living: services.has("living"),
      open: true,
      menu: textBytes(JSON.stringify(input.menu), MAX_MENU_BYTES),
      lastBeat: u64(nowSeconds()),
    },
    input.agent,
    { expiration: VENDOR_LEASE() },
  );
}

// The agent's hourly heartbeat: six more hours from now, in one transaction with the time it was seen.
export function heartbeat(agent: ArkivWallet, vendorKey: Hex, open?: boolean) {
  return agent.executeBatch({
    patches: [{ schema: Vendor, entityKey: vendorKey, set: { lastBeat: u64(nowSeconds()), open } }],
    extensions: [{ entityKey: vendorKey, expiration: VENDOR_LEASE() }],
  });
}

// Live agents the server vouched for, cheapest first.
export async function liveVendors(filter: { service?: Service; maxFromPriceUsdc?: bigint; openOnly?: boolean } = {}, ctx: Arkiv = arkiv()) {
  const filters: Expression<SchemaRef<typeof Vendor>>[] = [];
  if (filter.openOnly ?? true) filters.push(eq("open", true));
  if (filter.service) filters.push(eq(serviceColumn(filter.service), true));
  if (filter.maxFromPriceUsdc !== undefined) filters.push(lte("fromPriceUsdc", u64(filter.maxFromPriceUsdc)));
  const query = ctx.reader.select("*").from(Vendor).createdBy(ctx.serverAddress);
  if (filters.length) query.where(and(filters));
  const page = await query.orderBy(asc("fromPriceUsdc")).limit(100).fetch();
  return page.entities.map(toVendor);
}

export type NewCommission = {
  buyer: Address; // becomes $owner, the only one who can award it
  kind: Service;
  budgetUsdc: bigint;
  deadline: Date;
  brief: string; // public
  buyerEns?: string;
};

export type CommissionRow = { key: Hex; buyer: Address; expiresAt: bigint; kind: string; budgetUsdc: bigint; status: string; buyerEns?: string; deadline: number; awardedBid?: Hex; brief: string };

function toCommission(row: FullRow<typeof Commission>): CommissionRow {
  return {
    key: row.$key,
    buyer: row.$owner,
    expiresAt: row.$expiresAt,
    kind: row.kind.value,
    budgetUsdc: row.budgetUsdc.value,
    status: row.status.value,
    buyerEns: row.buyerEns?.value,
    deadline: Number(row.deadline.value),
    awardedBid: row.awardedBid?.value,
    brief: hexToString(row.brief.value),
  };
}

export function requestCommission(input: NewCommission, ctx: Arkiv = arkiv()): Promise<Written> {
  if (input.deadline.getTime() <= Date.now()) throw new Error("The deadline must be in the future.");
  return createFor(
    ctx,
    Commission,
    {
      kind: input.kind,
      budgetUsdc: u64(input.budgetUsdc),
      status: "open",
      buyerEns: input.buyerEns === undefined ? undefined : clampStr(input.buyerEns),
      deadline: u64(Math.ceil(input.deadline.getTime() / 1000)),
      brief: textBytes(input.brief, MAX_BRIEF_BYTES),
    },
    input.buyer,
    { expiration: ExpirationTime.atDate(input.deadline) },
  );
}

// A live commission the server created, or null.
export async function getCommission(commissionKey: Hex, ctx: Arkiv = arkiv()): Promise<CommissionRow | null> {
  try {
    const row = await ctx.reader.getEntity(commissionKey, Commission);
    return isAddressEqual(row.$creator, ctx.serverAddress) ? toCommission(row) : null;
  } catch (error) {
    if (error instanceof NoEntityFoundError) return null;
    throw error;
  }
}

// The board of open requests, closing soonest first.
export async function openCommissions(kind?: Service, ctx: Arkiv = arkiv()) {
  const query = ctx.reader.select("*").from(Commission).createdBy(ctx.serverAddress);
  query.where(kind ? and(eq("status", "open"), eq("kind", kind)) : eq("status", "open"));
  const page = await query.orderBy(asc("deadline")).limit(100).fetch();
  return page.entities.map(toCommission);
}

// Signed by the buyer's wallet after NightMarket's requestCommission escrow confirms.
export function awardCommission(buyer: ArkivWallet, commissionKey: Hex, bidKey: Hex) {
  return buyer.patchEntity(Commission, commissionKey, { set: { status: "awarded", awardedBid: key(bidKey) } });
}

// An agent bids with its own wallet. The bid expires with the request.
export async function placeBid(agent: ArkivWallet, bid: { commission: Hex; vendorEns: string; priceUsdc: bigint; etaHours: number }, ctx: Arkiv = arkiv()) {
  const commission = await getCommission(bid.commission, ctx);
  if (!commission || commission.status !== "open") throw new Error("That commission is not open.");
  return agent.createEntity(
    Bid,
    { commission: key(bid.commission), vendorEns: clampStr(bid.vendorEns), priceUsdc: u64(bid.priceUsdc), etaHours: bid.etaHours },
    { expiration: ExpirationTime.atDate(new Date(commission.deadline * 1000)) },
  );
}

export type BidRow = { key: Hex; agent: Address; vendorEns: string; priceUsdc: bigint; etaHours: number };

// Bids on a commission, cheapest first, from agents with a live stall the server vouched for.
export async function bidsFor(commissionKey: Hex, ctx: Arkiv = arkiv()): Promise<BidRow[]> {
  const [page, vendors] = await Promise.all([
    ctx.reader.select("*").from(Bid).where(eq("commission", key(commissionKey))).orderBy(asc("priceUsdc")).limit(100).fetch(),
    liveVendors({ openOnly: false }, ctx),
  ]);
  const agents = new Set(vendors.map((v) => v.agent.toLowerCase()));
  return page.entities
    .filter((row) => agents.has(row.$creator.toLowerCase()) && isAddressEqual(row.$creator, row.$owner))
    .map((row) => ({ key: row.$key, agent: row.$owner, vendorEns: row.vendorEns.value, priceUsdc: row.priceUsdc.value, etaHours: row.etaHours.value }));
}

// The awarded agent's lease on the work, renewed while it works. If it lapses, the job reopens without a cron job.
export function claimCommission(agent: ArkivWallet, claim: { commission: Hex; vendorEns: string }) {
  return agent.createEntity(Claim, { commission: key(claim.commission), vendorEns: clampStr(claim.vendorEns) }, { expiration: CLAIM_LEASE() });
}

export function renewClaim(agent: ArkivWallet, claimKey: Hex) {
  return agent.extendEntity({ entityKey: claimKey, expiration: CLAIM_LEASE() });
}

// The live claim by `agent` on a commission, if any.
export async function activeClaim(commissionKey: Hex, agent: Address, ctx: Arkiv = arkiv()) {
  const page = await ctx.reader.select("*").from(Claim).where(eq("commission", key(commissionKey))).ownedBy(agent).createdBy(agent).limit(1).fetch();
  const row = page.entities[0];
  return row && row.$expiresAt > page.blockNumber ? { key: row.$key, vendorEns: row.vendorEns.value, expiresAt: row.$expiresAt } : null;
}
