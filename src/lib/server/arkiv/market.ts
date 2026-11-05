// The Night Market on Arkiv: listings owned by dreamers that leave search at their deadline, and stalls that close at dawn.
// Money and edition ownership stay in NightMarket; a listing only describes what is for sale.
import { ExpirationTime, MAX_LIFETIME, NoEntityFoundError, type FullRow, type SchemaRef } from "@arkiv-network/sdk";
import { and, asc, desc, eq, gte, lte, or, type Expression } from "@arkiv-network/sdk/query";
import { i32, key, u64 } from "@arkiv-network/sdk/schema";
import { isAddressEqual, type Address, type Hex } from "viem";
import { arkiv, createAsServer, createFor, nowSeconds, type Arkiv, type ArkivWallet, type Written } from "./client";
import { clampStr, Listing, Stall, THEMES, themeColumn, type Category, type Theme } from "./schemas";

const DAY = 24 * 3600;
const MAX_SALE_SECONDS = Number(MAX_LIFETIME) * 2 - 3600;

export type NewListing = {
  pieceId: Hex;
  dreamer: Address; // becomes $owner
  sellerEns: string;
  title: string;
  category: Category;
  style: string;
  priceUsdc: bigint; // 6 decimals
  editionsTotal: number;
  themes: Theme[];
  sealed: boolean;
  model: string;
  sagaLength?: number;
  previewRef?: string;
  saleEndsAt?: Date; // 30 days from now by default
};

export type ListingRow = {
  key: Hex;
  owner: Address;
  creator: Address;
  expiresAt: bigint; // block
  pieceId: Hex;
  category: string;
  priceUsdc: bigint;
  editionsTotal: number;
  editionsSold: number;
  soldOut: boolean;
  sellerEns: string;
  style: string;
  sagaLength?: number;
  sealed: boolean;
  listedAt: number;
  saleEndsAt: number;
  title: string;
  model: string;
  previewRef?: string;
  themes: Theme[];
};

function toListing(row: FullRow<typeof Listing>): ListingRow {
  return {
    key: row.$key,
    owner: row.$owner,
    creator: row.$creator,
    expiresAt: row.$expiresAt,
    pieceId: row.pieceId.value,
    category: row.category.value,
    priceUsdc: row.priceUsdc.value,
    editionsTotal: row.editionsTotal.value,
    editionsSold: row.editionsSold.value,
    soldOut: row.soldOut.value,
    sellerEns: row.sellerEns.value,
    style: row.style.value,
    sagaLength: row.sagaLength?.value,
    sealed: row.sealed.value,
    listedAt: Number(row.listedAt.value),
    saleEndsAt: Number(row.saleEndsAt.value),
    title: row.title.value,
    model: row.model.value,
    previewRef: row.previewRef?.value,
    themes: THEMES.filter((t) => row[themeColumn(t)]?.value === true),
  };
}

// Lists a piece the NightMarket contract already knows about. The server creates it and the dreamer owns it.
export function listPiece(input: NewListing, ctx: Arkiv = arkiv()): Promise<Written> {
  const saleEndsAt = input.saleEndsAt ?? new Date(Date.now() + 30 * DAY * 1000);
  const secondsLeft = (saleEndsAt.getTime() - Date.now()) / 1000;
  if (secondsLeft <= 0 || secondsLeft > MAX_SALE_SECONDS) throw new Error("saleEndsAt must be in the future and within about 182 days.");
  if (input.priceUsdc <= BigInt(0)) throw new Error("priceUsdc must be above zero.");
  if (!Number.isInteger(input.editionsTotal) || input.editionsTotal < 1) throw new Error("editionsTotal must be a whole number of at least 1.");
  const themes = Object.fromEntries([...new Set(input.themes)].map((t) => [themeColumn(t), true]));
  return createFor(
    ctx,
    Listing,
    {
      pieceId: key(input.pieceId),
      category: input.category,
      priceUsdc: u64(input.priceUsdc),
      editionsTotal: input.editionsTotal,
      editionsSold: 0,
      soldOut: false,
      sellerEns: clampStr(input.sellerEns),
      style: clampStr(input.style),
      sagaLength: input.sagaLength,
      sealed: input.sealed,
      listedAt: u64(nowSeconds()),
      saleEndsAt: u64(Math.ceil(saleEndsAt.getTime() / 1000)),
      title: clampStr(input.title),
      model: clampStr(input.model),
      previewRef: input.previewRef === undefined ? undefined : clampStr(input.previewRef),
      ...themes,
    },
    input.dreamer,
    { expiration: ExpirationTime.atDate(saleEndsAt) },
  );
}

// The rest are the dreamer's own edits, signed by the dreamer's wallet: after the hand-over the server can't change a listing.

// Mirrors NightMarket's sold count after a sale. Pass the contract's number, so a repeat is harmless.
export async function recordSale(owner: ArkivWallet, listingKey: Hex, editionsSold: number, ctx: Arkiv = arkiv()) {
  const listing = await ctx.reader.getEntity(listingKey, Listing);
  const total = listing.editionsTotal.value;
  if (editionsSold > total) throw new Error(`editionsSold ${editionsSold} is more than the ${total} editions listed.`);
  return owner.patchEntity(Listing, listingKey, { set: { editionsSold: i32(editionsSold), soldOut: editionsSold >= total } });
}

// Call after NightMarket's setPrice confirms, so the two agree.
export function setPrice(owner: ArkivWallet, listingKey: Hex, priceUsdc: bigint) {
  return owner.patchEntity(Listing, listingKey, { set: { priceUsdc: u64(priceUsdc) } });
}

export function extendSale(owner: ArkivWallet, listingKey: Hex, until: Date) {
  return owner.executeBatch({
    patches: [{ schema: Listing, entityKey: listingKey, set: { saleEndsAt: u64(Math.ceil(until.getTime() / 1000)) } }],
    extensions: [{ entityKey: listingKey, expiration: ExpirationTime.atDate(until) }],
  });
}

export function delist(owner: ArkivWallet, listingKey: Hex) {
  return owner.deleteEntity({ entityKey: listingKey });
}

export type MarketSort = "price-asc" | "price-desc" | "newest";

export type MarketSearch = {
  themes?: Theme[]; // any of them
  category?: Category;
  sellerEns?: string;
  minPriceUsdc?: bigint;
  maxPriceUsdc?: bigint;
  sealedOnly?: boolean;
  availableOnly?: boolean;
  sort?: MarketSort;
  limit?: number;
  offset?: number;
};

// Search the market. Only listings the server created count, since anyone can write an entity with our schema's tag.
export async function searchMarket(search: MarketSearch = {}, ctx: Arkiv = arkiv()) {
  const filters: Expression<SchemaRef<typeof Listing>>[] = [];
  const themes = [...new Set(search.themes ?? [])];
  if (themes.length) filters.push(or(themes.map((t) => eq(themeColumn(t), true))));
  if (search.category) filters.push(eq("category", search.category));
  if (search.sellerEns) filters.push(eq("sellerEns", search.sellerEns));
  if (search.minPriceUsdc !== undefined) filters.push(gte("priceUsdc", u64(search.minPriceUsdc)));
  if (search.maxPriceUsdc !== undefined) filters.push(lte("priceUsdc", u64(search.maxPriceUsdc)));
  if (search.sealedOnly) filters.push(eq("sealed", true));
  if (search.availableOnly) filters.push(eq("soldOut", false));
  const sort = search.sort ?? "newest";
  const query = ctx.reader.select("*").from(Listing).createdBy(ctx.serverAddress);
  if (filters.length) query.where(and(filters));
  query.orderBy(sort === "newest" ? desc("listedAt") : sort === "price-asc" ? asc("priceUsdc") : desc("priceUsdc"));
  const page = await query
    .limit(search.limit ?? 24)
    .offset(search.offset ?? 0)
    .withCount()
    .fetch();
  return { listings: page.entities.map(toListing), total: page.count, block: page.blockNumber };
}

// One listing, or null if it is gone, expired or wasn't created by the server.
export async function getListing(listingKey: Hex, ctx: Arkiv = arkiv()): Promise<ListingRow | null> {
  try {
    const row = await ctx.reader.getEntity(listingKey, Listing);
    return isAddressEqual(row.$creator, ctx.serverAddress) ? toListing(row) : null;
  } catch (error) {
    if (error instanceof NoEntityFoundError) return null;
    throw error;
  }
}

// The live listing for a NightMarket piece, to patch after a sale.
export async function listingForPiece(pieceId: Hex, ctx: Arkiv = arkiv()): Promise<ListingRow | null> {
  const page = await ctx.reader.select("*").from(Listing).where(eq("pieceId", key(pieceId))).createdBy(ctx.serverAddress).limit(1).fetch();
  return page.entities[0] ? toListing(page.entities[0]) : null;
}

// The evening's date and the next dawn (06:00 UTC) after `at`.
export function nightOf(at = new Date()) {
  const dawn = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), 6));
  if (dawn <= at) dawn.setUTCDate(dawn.getUTCDate() + 1);
  const evening = new Date(dawn.getTime() - DAY * 1000);
  return { night: evening.toISOString().slice(0, 10), dawn };
}

// Opens tonight's stalls in one transaction. They are readonly and close at dawn.
export function openStalls(listingKeys: Hex[], ctx: Arkiv = arkiv()) {
  const { night, dawn } = nightOf();
  const rows = listingKeys.map((listing, slot) => ({ listing: key(listing), night, slot }));
  return createAsServer(ctx, Stall, rows, { expiration: ExpirationTime.atDate(dawn), flags: { readonly: true } });
}

// Tonight's picks, in slot order, as live listings.
export async function tonightsStalls(ctx: Arkiv = arkiv()): Promise<ListingRow[]> {
  const { night } = nightOf();
  const stalls = await ctx.reader.select("*").from(Stall).where(eq("night", night)).createdBy(ctx.serverAddress).orderBy(asc("slot")).limit(100).fetch();
  const keys = stalls.entities.map((s) => s.listing.value);
  if (!keys.length) return [];
  const page = await ctx.reader
    .select("*")
    .from(Listing)
    .where(or(keys.map((k) => eq("$key", key(k)))))
    .createdBy(ctx.serverAddress)
    .limit(100)
    .fetch();
  const byKey = new Map(page.entities.map((row) => [row.$key.toLowerCase(), toListing(row)]));
  return keys.map((k) => byKey.get(k.toLowerCase())).filter((row): row is ListingRow => Boolean(row));
}
