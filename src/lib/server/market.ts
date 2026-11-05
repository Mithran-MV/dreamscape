// The Night Market's app side: list a hung comic or a painted dream as numbered editions, find it
// on Arkiv, sell it through NightMarket in USDC, and open the full piece to whoever holds an edition.
import sharp from "sharp";
import { createPublicClient, createWalletClient, http, keccak256, parseAbi, parseEventLogs, toHex, zeroAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { getDb, now } from "./db";
import { env } from "./env";
import { getBlob, getDream, putBlob, THEMES, type Dream } from "./dreams";
import { enqueue, hasOpenJob } from "./jobs";
import { getEpisode, panelKey } from "./nightly";
import { registryAbi } from "./ens/contracts";
import { listPiece as listOnArkiv, listingForPiece, nightOf, openStalls, searchMarket, tonightsStalls, type ListingRow, type MarketSearch } from "./arkiv/market";
import type { Theme } from "./arkiv/schemas";

export const marketAbi = parseAbi([
  "function registryOwner(address registry) view returns (address)",
  "function bindRegistry(address registry, address owner)",
  "function listPiece(bytes32 pieceId, address seller, address editionsRegistry, string labelPrefix, uint256 priceUsdc, uint32 maxEditions, address vendorPayout, uint16 vendorBps)",
  "function pieces(bytes32 pieceId) view returns ((address seller, uint32 maxEditions, uint32 sold, uint16 vendorBps, bool active, address editionsRegistry, address vendorPayout, uint256 priceUsdc, string labelPrefix))",
  "function buy(bytes32 pieceId, uint256 maxPrice) returns (uint32 editionNo, uint256 tokenId)",
  "function commonsBps() view returns (uint16)",
  "event EditionSold(bytes32 indexed pieceId, uint32 editionNo, address indexed buyer, string label, uint256 tokenId, uint256 price)",
]);
export const usdcAbi = parseAbi(["function approve(address spender, uint256 amount) returns (bool)", "function balanceOf(address) view returns (uint256)"]);

// Public previews belong to nobody, like the World Dream, so they're sealed under this name.
const MARKET_OWNER = "market";
export const previewKey = (pieceId: string) => `piece/${pieceId}/preview`;

export type PieceKind = "episode" | "dream";
export type Piece = {
  id: Hex;
  user_id: string;
  kind: PieceKind;
  ref: string;
  title: string;
  label_prefix: string;
  price_usdc: number;
  editions: number;
  status: "listing" | "listed";
  error: string | null;
  market_tx: string | null;
  arkiv_key: string | null;
  created_at: number;
};

const transport = () => http(env.sepoliaRpc());
const reader = () => createPublicClient({ chain: sepolia, transport: transport() });
const server = () => createWalletClient({ account: privateKeyToAccount(env.serverKey()), chain: sepolia, transport: transport() });
function market(): Address {
  const address = env.nightMarket();
  if (!address) throw new Error("NIGHT_MARKET_ADDRESS is not set. Add it to .env.local.");
  return address;
}

export const pieceIdFor = (kind: PieceKind, ref: string) => keccak256(toHex(`dreamscape:${kind}:${ref}`));
export const getPiece = (id: string) => getDb().prepare("SELECT * FROM pieces WHERE id = ?").get(id) as Piece | undefined;
export const piecesOf = (userId: string) => getDb().prepare("SELECT * FROM pieces WHERE user_id = ? ORDER BY created_at DESC").all(userId) as Piece[];
export const pieceFor = (kind: PieceKind, ref: string) => getPiece(pieceIdFor(kind, ref));

type Seller = { id: string; handle: string; wallet: Address; ens: { name: string; editions: Address } };

function sellerOf(userId: string): Seller | null {
  const row = getDb().prepare("SELECT id, handle, wallet, ens_json FROM users WHERE id = ?").get(userId) as
    | { id: string; handle: string; wallet: string | null; ens_json: string | null }
    | undefined;
  if (!row?.wallet || !row.ens_json) return null;
  return { id: row.id, handle: row.handle, wallet: row.wallet as Address, ens: JSON.parse(row.ens_json) };
}

// Edition n is "<prefix>-<n>.<handle>.dream-scape.eth", so the prefix must be a plain label, unique per dreamer.
function labelPrefixFor(userId: string, title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  // Cut at a whole word, so a long title never ends an edition name halfway through one.
  const cut = slug.length <= 24 ? slug : slug.slice(0, 25).replace(/-[^-]*$/, "");
  const base = (cut || slug.slice(0, 24)).replace(/-+$/, "") || "piece";
  const taken = new Set((getDb().prepare("SELECT label_prefix FROM pieces WHERE user_id = ?").all(userId) as { label_prefix: string }[]).map((r) => r.label_prefix));
  let prefix = base;
  for (let n = 2; taken.has(prefix); n++) prefix = `${base}-v${n}`;
  return prefix;
}

// A small, soft JPEG that anyone may see. The full piece stays sealed.
async function makePreview(kind: PieceKind, userId: string, ref: string) {
  if (kind === "dream") {
    const portrait = getBlob(userId, `dream/${ref}/portrait`);
    if (!portrait) throw new Error("This dream has no portrait yet.");
    return sharp(portrait.bytes).resize(320, 320, { fit: "cover" }).jpeg({ quality: 55 }).toBuffer();
  }
  const tiles = await Promise.all(
    [0, 1, 2, 3].map(async (n) => {
      const panel = getBlob(userId, panelKey(ref, n));
      if (!panel) throw new Error("This comic is missing a panel.");
      return sharp(panel.bytes).resize(156, 156, { fit: "cover" }).toBuffer();
    }),
  );
  return sharp({ create: { width: 320, height: 320, channels: 3, background: "#fbf9f4" } })
    .composite(tiles.map((input, i) => ({ input, left: 3 + (i % 2) * 161, top: 3 + Math.floor(i / 2) * 161 })))
    .jpeg({ quality: 55 })
    .toBuffer();
}

type ListInput = { kind: PieceKind; ref: string; priceUsdc: number; editions: number };

// Checks everything a buyer would rely on, then queues the on-chain listing.
export async function startListing(userId: string, input: ListInput): Promise<{ id: Hex } | { error: string }> {
  const seller = sellerOf(userId);
  if (!seller) return { error: "Your gallery needs its ENS name first. Sign in with email or Google, then wait a minute." };
  if (!Number.isFinite(input.priceUsdc) || input.priceUsdc < 0.5 || input.priceUsdc > 1000) return { error: "Pick a price between 0.50 and 1,000 USDC." };
  if (!Number.isInteger(input.editions) || input.editions < 1 || input.editions > 100) return { error: "Pick between 1 and 100 editions." };
  let title: string | null = null;
  if (input.kind === "episode") {
    const ep = getEpisode(input.ref);
    if (!ep || ep.user_id !== userId) return { error: "Not found." };
    if (ep.status !== "published") return { error: "Hang the comic in your gallery before selling it." };
    title = ep.title;
  } else {
    const dream = getDream(input.ref);
    if (!dream || dream.user_id !== userId) return { error: "Not found." };
    if (!["painted", "storing", "done"].includes(dream.status)) return { error: "This dream isn't painted yet." };
    title = dream.title;
  }
  const id = pieceIdFor(input.kind, input.ref);
  if (getPiece(id)) return { error: "This piece is already on the market." };
  const preview = await makePreview(input.kind, userId, input.ref);
  putBlob(MARKET_OWNER, previewKey(id), "image/jpeg", preview);
  getDb()
    .prepare("INSERT INTO pieces (id, user_id, kind, ref, title, label_prefix, price_usdc, editions, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'listing', ?)")
    .run(id, userId, input.kind, input.ref, title ?? "Untitled", labelPrefixFor(userId, title ?? "piece"), Math.round(input.priceUsdc * 1e6), input.editions, now());
  enqueue("piece.list", id);
  return { id };
}

// Job 'piece.list': bind the dreamer's editions registry to them, then list on NightMarket. Safe to rerun.
export async function listJob(pieceId: string) {
  const piece = getPiece(pieceId);
  if (!piece || piece.market_tx) return;
  const seller = sellerOf(piece.user_id);
  if (!seller) throw new Error("The seller has no ENS name yet.");
  const client = reader();
  const wallet = server();
  const bound = await client.readContract({ address: market(), abi: marketAbi, functionName: "registryOwner", args: [seller.ens.editions] });
  if (bound.toLowerCase() !== seller.wallet.toLowerCase()) {
    const hash = await wallet.writeContract({ address: market(), abi: marketAbi, functionName: "bindRegistry", args: [seller.ens.editions, seller.wallet] });
    await client.waitForTransactionReceipt({ hash });
  }
  const onChain = await client.readContract({ address: market(), abi: marketAbi, functionName: "pieces", args: [piece.id] });
  let tx: Hex | null = null;
  if (onChain.seller === zeroAddress) {
    tx = await wallet.writeContract({
      address: market(),
      abi: marketAbi,
      functionName: "listPiece",
      args: [piece.id, seller.wallet, seller.ens.editions, piece.label_prefix, BigInt(piece.price_usdc), piece.editions, zeroAddress, 0],
    });
    const receipt = await client.waitForTransactionReceipt({ hash: tx });
    if (receipt.status !== "success") throw new Error("NightMarket refused the listing.");
  }
  getDb().prepare("UPDATE pieces SET status = 'listed', market_tx = ?, error = NULL WHERE id = ?").run(tx ?? "already-listed", pieceId);
  enqueue("piece.arkiv", pieceId);
}

function themesOf(piece: Piece): Theme[] {
  const dreamId = piece.kind === "dream" ? piece.ref : (JSON.parse(getEpisode(piece.ref)?.dream_ids ?? "[]") as string[])[0];
  const dream = dreamId ? (getDream(dreamId) as Dream | undefined) : undefined;
  const themes = (JSON.parse(dream?.tags_json ?? "{}").themes ?? []) as string[];
  return themes.filter((t): t is Theme => (THEMES as readonly string[]).includes(t));
}

// Job 'piece.arkiv': the public listing, created by the server and handed to the dreamer in one batch.
export async function arkivJob(pieceId: string) {
  const piece = getPiece(pieceId);
  if (!piece || piece.arkiv_key) return;
  const seller = sellerOf(piece.user_id);
  if (!seller) throw new Error("The seller has no ENS name yet.");
  const existing = await listingForPiece(piece.id);
  const key =
    existing?.key ??
    (
      await listOnArkiv({
        pieceId: piece.id,
        dreamer: seller.wallet,
        sellerEns: seller.ens.name,
        title: piece.title,
        category: piece.kind === "episode" ? "comic" : "portrait",
        style: piece.kind === "episode" ? "ink" : "oil",
        priceUsdc: BigInt(piece.price_usdc),
        editionsTotal: piece.editions,
        themes: themesOf(piece),
        sealed: piece.kind === "dream",
        model: piece.kind === "episode" ? "tencent/hy-image-3.5-preview" : "z-image-turbo",
        previewRef: `/api/market/${piece.id}/preview`,
      })
    ).key;
  getDb().prepare("UPDATE pieces SET arkiv_key = ? WHERE id = ?").run(key, pieceId);
}

// What NightMarket says right now: editions left are read on-chain, never from Arkiv.
export async function onChainPiece(pieceId: Hex) {
  const p = await reader().readContract({ address: market(), abi: marketAbi, functionName: "pieces", args: [pieceId] });
  return { listed: p.seller !== zeroAddress, active: p.active, sold: p.sold, max: p.maxEditions, priceUsdc: p.priceUsdc, registry: p.editionsRegistry, seller: p.seller };
}

// The two transactions the buyer's wallet sends: let NightMarket take the price, then buy.
export function buyTxs(pieceId: Hex, priceUsdc: bigint) {
  return [
    { to: env.usdc(), abi: usdcAbi, functionName: "approve" as const, args: [market(), priceUsdc] as const },
    { to: market(), abi: marketAbi, functionName: "buy" as const, args: [pieceId, priceUsdc] as const },
  ];
}
export const marketAddress = market;

// Reads the buyer's receipt and keeps a note of each edition it minted for this piece.
export async function recordPurchase(pieceId: Hex, tx: Hex) {
  const receipt = await reader().waitForTransactionReceipt({ hash: tx });
  const logs = parseEventLogs({ abi: marketAbi, logs: receipt.logs, eventName: "EditionSold" }).filter(
    (l) => l.address.toLowerCase() === market().toLowerCase() && l.args.pieceId === pieceId,
  );
  for (const l of logs) {
    getDb()
      .prepare("INSERT OR IGNORE INTO sales (tx, piece_id, buyer, edition_no, label, token_id, price_usdc, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(tx, pieceId, l.args.buyer, l.args.editionNo, l.args.label, l.args.tokenId.toString(), Number(l.args.price), now());
  }
  return logs.map((l) => ({ editionNo: l.args.editionNo, label: l.args.label }));
}

// Editions are transferable, so who holds one is read from ENS, not from our notes of who bought it.
export async function holdsEdition(piece: Piece, wallet: string | null) {
  if (!wallet) return false;
  const seller = sellerOf(piece.user_id);
  if (seller && seller.wallet.toLowerCase() === wallet.toLowerCase()) return true;
  if (!seller) return false;
  const labels = (getDb().prepare("SELECT label FROM sales WHERE piece_id = ?").all(piece.id) as { label: string }[]).map((r) => r.label);
  const client = reader();
  for (const label of labels) {
    const owner = await client.readContract({ address: seller.ens.editions, abi: registryAbi, functionName: "findOwner", args: [label] });
    if (owner.toLowerCase() === wallet.toLowerCase()) return true;
  }
  return false;
}

export const editionName = (label: string, handle: string) => `${label}.${handle}.${env.ensName()}`;
export const getPreview = (pieceId: string) => getBlob(MARKET_OWNER, previewKey(pieceId));

const card = (r: ListingRow) => ({
    pieceId: r.pieceId,
    title: r.title,
    category: r.category,
    priceUsdc: Number(r.priceUsdc) / 1e6,
    editionsTotal: r.editionsTotal,
    sellerEns: r.sellerEns,
    listedAt: r.listedAt,
    sealed: r.sealed,
    model: r.model,
    themes: r.themes,
    preview: r.previewRef?.startsWith("/api/market/") ? r.previewRef : null,
});

export async function findListings(search: MarketSearch) {
  const { listings } = await searchMarket({ availableOnly: false, ...search });
  return listings.map(card);
}

export const tonightsPicks = async () => (await tonightsStalls()).map(card);

// Job 'market.stalls': at dusk the newest listings get one-night stalls on Arkiv, which close by themselves at dawn.
export async function openTonightsStalls() {
  const { night } = nightOf();
  const opened = getDb().prepare("SELECT value FROM kv WHERE key = 'stalls_night'").get() as { value: string } | undefined;
  if (opened?.value === night) return;
  const keys = (getDb().prepare("SELECT arkiv_key FROM pieces WHERE arkiv_key IS NOT NULL ORDER BY created_at DESC LIMIT 12").all() as { arkiv_key: Hex }[]).map((r) => r.arkiv_key);
  if (keys.length) await openStalls(keys);
  getDb().prepare("INSERT INTO kv (key, value) VALUES ('stalls_night', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(night);
}

// Called by the worker every minute: dusk is 18:00 UTC, before the nightly comics.
export function scheduleStalls(at = new Date()) {
  if (at.getUTCHours() === 18 && !hasOpenJob("tonight", ["market.stalls"])) enqueue("market.stalls", "tonight");
}
