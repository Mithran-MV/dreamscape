// Commissions: a buyer pays a vendor agent through NightMarket's escrow for a one-of-one portrait.
// The buyer's note stays in this database. Arkiv gets the public request, ENS the one-of-one name.
import { randomBytes } from "node:crypto";
import { createPublicClient, encodeFunctionData, http, parseAbi, parseEventLogs, toHex, type Address, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { getDb, now } from "./db";
import { env } from "./env";
import { dreamerKey } from "./crypto";
import { getBlob, putBlob } from "./dreams";
import { enqueue } from "./jobs";
import { marketAddress, usdcAbi } from "./market";
import { registryAbi } from "./ens/contracts";
import { readAgent, agentName } from "./ens/agents";
import { openCommissions, requestCommission as requestOnArkiv } from "./arkiv/agents";
import { RABDI_EXPLORER } from "./arkiv/config";
import type { Service } from "./arkiv/schemas";
import { getDecrypted, storageExplorer } from "./zerog/storage";

export const commissionAbi = parseAbi([
  "function operators(address operator) view returns (bool)",
  "function agentOwner(address agent) view returns (address)",
  "function registryOwner(address registry) view returns (address)",
  "function bindAgent(address agent, address owner)",
  "function bindRegistry(address registry, address owner)",
  "function commonsBps() view returns (uint16)",
  "function commonsFund() view returns (address)",
  "function requestCommission(bytes32 commissionId, address vendorAgent, address vendorOwner, uint256 priceUsdc, uint64 deadline, address editionsRegistry, string label)",
  "function deliver(bytes32 commissionId, bytes32 storageRoot) returns (uint256 tokenId)",
  "function refund(bytes32 commissionId)",
  "function commissions(bytes32 commissionId) view returns ((address buyer, uint8 status, uint64 deadline, address vendorAgent, address vendorOwner, address editionsRegistry, uint256 priceUsdc, string label))",
  "event CommissionRequested(bytes32 indexed commissionId, address indexed buyer, address indexed vendorAgent, address vendorOwner, uint256 priceUsdc, uint64 deadline, address editionsRegistry, string label)",
  "event CommissionDelivered(bytes32 indexed commissionId, bytes32 storageRoot, uint256 tokenId)",
  "event CommissionRefunded(bytes32 indexed commissionId, address indexed buyer, uint256 amount)",
  "error NotOperator()",
  "error AgentNotBound()",
  "error RegistryNotBound()",
  "error ZeroPrice()",
  "error BadLabel()",
  "error BadDeadline()",
  "error CommissionExists()",
  "error NotOpen()",
  "error NotVendorAgent()",
  "error NotBuyer()",
  "error DeadlinePassed()",
  "error TooEarly()",
  "error EmptyRoot()",
  "error TransferFailed()",
  "error ZeroAddress()",
]);

// NightMarket's Status enum.
export const ON_CHAIN = { none: 0, open: 1, delivered: 2, refunded: 3 } as const;

export const SERVICE: Service = "portrait";
export const DEADLINE_HOURS = 48;
const NOTE_MAX = 280;

// The styles a buyer can pick, and how each one reads to the painter.
export const STYLES = {
  oil: { label: "Oil", prompt: "rich oil paint with soft, glowing light" },
  watercolour: { label: "Watercolour", prompt: "loose watercolour washes on textured paper" },
  ink: { label: "Ink", prompt: "fine ink linework with one quiet wash of colour" },
  pastel: { label: "Pastel", prompt: "soft chalk pastel with a velvety grain" },
  gouache: { label: "Gouache", prompt: "flat gouache shapes, like an old storybook" },
} as const;
export type Style = keyof typeof STYLES;
export const isStyle = (value: unknown): value is Style => typeof value === "string" && Object.hasOwn(STYLES, value);
export const styleList = () => (Object.keys(STYLES) as Style[]).map((key) => ({ key, label: STYLES[key].label }));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS vendor_agents (
  label TEXT PRIMARY KEY,               -- portraits, as in portraits.market.dream-scape.eth
  agent TEXT NOT NULL,                  -- the agent's own wallet, the only one NightMarket lets deliver
  owner_id TEXT NOT NULL REFERENCES users(id),
  owner TEXT NOT NULL,                  -- the human's wallet: it holds the name and is paid
  editions TEXT NOT NULL,               -- the human's editions registry, where one-of-one names are minted
  resolver TEXT NOT NULL,               -- the agent's own Permissioned Resolver
  market_registry TEXT NOT NULL,
  vendor_key TEXT,                      -- its stall on Arkiv
  last_beat INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_commissions (
  id TEXT PRIMARY KEY,                  -- NightMarket's bytes32 commission id
  agent TEXT NOT NULL,                  -- the vendor agent's label
  buyer_id TEXT NOT NULL REFERENCES users(id),
  buyer TEXT NOT NULL,                  -- the wallet that pays; who holds the name later is read from ENS
  style TEXT NOT NULL,
  note TEXT NOT NULL,                   -- private: only the sealed painter sees it, never Arkiv
  label TEXT NOT NULL,                  -- the one-of-one name minted to the buyer
  editions TEXT NOT NULL,
  price_usdc INTEGER NOT NULL,          -- 6 decimals
  deadline INTEGER NOT NULL,            -- unix seconds, the last second the agent may deliver
  status TEXT NOT NULL,                 -- awaiting, paid, claimed, making, delivered, late, refunded
  error TEXT,
  pay_tx TEXT,
  pay_block INTEGER,
  arkiv_key TEXT,                       -- the public request on Arkiv
  claim_key TEXT,                       -- the agent's claim on Arkiv
  storage_root TEXT,                    -- the encrypted piece on 0G Storage
  deliver_tx TEXT,
  token_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_commissions_by_buyer ON agent_commissions(buyer_id, agent);
`;

let ready = false;
export function db() {
  const d = getDb();
  if (!ready) {
    d.exec(SCHEMA);
    ready = true;
  }
  return d;
}

export type VendorAgent = {
  label: string;
  agent: Address;
  owner_id: string;
  owner: Address;
  editions: Address;
  resolver: Address;
  market_registry: Address;
  vendor_key: Hex | null;
  last_beat: number | null;
  created_at: number;
};

export type CommissionStatus = "awaiting" | "paid" | "claimed" | "making" | "delivered" | "late" | "refunded";
export type Commission = {
  id: Hex;
  agent: string;
  buyer_id: string;
  buyer: Address;
  style: Style;
  note: string;
  label: string;
  editions: Address;
  price_usdc: number;
  deadline: number;
  status: CommissionStatus;
  error: string | null;
  pay_tx: Hex | null;
  pay_block: number | null;
  arkiv_key: Hex | null;
  claim_key: Hex | null;
  storage_root: Hex | null;
  deliver_tx: Hex | null;
  token_id: string | null;
  created_at: number;
};

// A stall counts as open while its agent has beaten in the last two hours; the stall itself lasts six.
export const STALL_FRESH_MS = 2 * 3600_000;
export const stallOpen = (v: VendorAgent, at = Date.now()) => Boolean(v.last_beat && at - v.last_beat < STALL_FRESH_MS);

export const getVendor = (label: string) => db().prepare("SELECT * FROM vendor_agents WHERE label = ?").get(label) as VendorAgent | undefined;
export const listVendors = () => db().prepare("SELECT * FROM vendor_agents ORDER BY created_at").all() as VendorAgent[];
export const getCommission = (id: string) => db().prepare("SELECT * FROM agent_commissions WHERE id = ?").get(id) as Commission | undefined;
export const commissionsOf = (buyerId: string, agent: string) =>
  db().prepare("SELECT * FROM agent_commissions WHERE buyer_id = ? AND agent = ? ORDER BY created_at DESC LIMIT 20").all(buyerId, agent) as Commission[];

export function saveVendor(v: Omit<VendorAgent, "created_at" | "vendor_key" | "last_beat">) {
  db()
    .prepare(
      `INSERT INTO vendor_agents (label, agent, owner_id, owner, editions, resolver, market_registry, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(label) DO UPDATE SET agent = excluded.agent, owner_id = excluded.owner_id, owner = excluded.owner, editions = excluded.editions, resolver = excluded.resolver, market_registry = excluded.market_registry`,
    )
    .run(v.label, v.agent, v.owner_id, v.owner, v.editions, v.resolver, v.market_registry, now());
}

const VENDOR_FIELDS = new Set(["vendor_key", "last_beat"]);
export function updateVendor(label: string, fields: Partial<Record<string, string | number | null>>) {
  const keys = Object.keys(fields).filter((k) => VENDOR_FIELDS.has(k));
  if (keys.length) db().prepare(`UPDATE vendor_agents SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE label = ?`).run(...keys.map((k) => fields[k] ?? null), label);
}

const COMMISSION_FIELDS = new Set(["status", "error", "pay_tx", "pay_block", "arkiv_key", "claim_key", "storage_root", "deliver_tx", "token_id"]);
export function updateCommission(id: string, fields: Partial<Record<string, string | number | null>>) {
  const keys = Object.keys(fields).filter((k) => COMMISSION_FIELDS.has(k));
  if (keys.length) db().prepare(`UPDATE agent_commissions SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(...keys.map((k) => fields[k] ?? null), id);
}

export const reader = () => createPublicClient({ chain: sepolia, transport: http(env.sepoliaRpc()) });
export const readOnChain = (id: Hex) => reader().readContract({ address: marketAddress(), abi: commissionAbi, functionName: "commissions", args: [id] });
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// The piece is sealed under a key of its own, since the name can change hands and the next holder must still open it.
export const pieceOwner = (id: string) => `commission:${id}`;
export const pieceKey = (id: string) => `commission/${id}/piece`;
export const pieceSecret = (id: string) => dreamerKey(pieceOwner(id));

export const commissionName = (label: string, ownerHandle: string) => `${label}.${ownerHandle}.${env.ensName()}`;
const handleOf = (userId: string) => (db().prepare("SELECT handle FROM users WHERE id = ?").get(userId) as { handle: string } | undefined)?.handle ?? "";
const walletOf = (userId: string) => (db().prepare("SELECT wallet FROM users WHERE id = ?").get(userId) as { wallet: string | null } | undefined)?.wallet ?? null;

// One plain line: control characters become spaces.
export function cleanNote(text: unknown) {
  return Array.from(String(text ?? ""), (ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? " " : ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NOTE_MAX);
}

// portrait-for-<buyer>-<n>, the first n not yet taken here or in the owner's editions registry.
async function labelFor(buyerHandle: string, editions: Address) {
  const base = `portrait-for-${buyerHandle}`.slice(0, 48).replace(/-+$/, "");
  const taken = new Set((db().prepare("SELECT label FROM agent_commissions WHERE editions = ?").all(editions) as { label: string }[]).map((r) => r.label));
  const client = reader();
  for (let n = 1; n < 1000; n++) {
    const label = `${base}-${n}`;
    if (taken.has(label)) continue;
    const owner = await client.readContract({ address: editions, abi: registryAbi, functionName: "findOwner", args: [label] });
    if (/^0x0{40}$/.test(owner)) return label;
  }
  throw new Error("No free name for this commission.");
}

export type Tx = { to: Address; data: Hex };
type NewCommission = { agent: string; style: unknown; note: unknown };

// Checks everything the buyer's two transactions rely on, so NightMarket never refuses them, then returns them.
export async function createCommission(userId: string, input: NewCommission): Promise<{ id: Hex; txs: Tx[]; priceUsdc: number; name: string; deadline: number } | { error: string }> {
  const buyer = walletOf(userId);
  if (!buyer) return { error: "Sign in with 0G first, so you have a wallet to pay from." };
  const vendor = getVendor(input.agent);
  if (!vendor) return { error: "That agent isn't taking commissions." };
  if (!stallOpen(vendor)) return { error: "This agent's stall is closed right now. Try again later." };
  if (same(vendor.owner, buyer)) return { error: "This is your own agent." };
  if (!isStyle(input.style)) return { error: "Pick a style." };
  const note = cleanNote(input.note);
  if (note.length < 3) return { error: "Write a few words about who or what to paint." };

  const client = reader();
  const agent = await readAgent(client, vendor.label);
  const price = agent?.prices?.[SERVICE];
  if (!agent || !price) return { error: "This agent has no price for a portrait right now." };
  const market = marketAddress();
  const [boundAgent, boundRegistry, block] = await Promise.all([
    client.readContract({ address: market, abi: commissionAbi, functionName: "agentOwner", args: [vendor.agent] }),
    client.readContract({ address: market, abi: commissionAbi, functionName: "registryOwner", args: [vendor.editions] }),
    client.getBlock(),
  ]);
  if (!same(boundAgent, vendor.owner) || !same(boundRegistry, vendor.owner)) return { error: "This agent isn't set up on NightMarket yet." };

  const id = toHex(randomBytes(32));
  const priceUsdc = Math.round(price * 1e6);
  // From the chain's clock, so a fork that has moved time still gets 48 hours.
  const deadline = Number(block.timestamp) + DEADLINE_HOURS * 3600;
  const label = await labelFor(handleOf(userId), vendor.editions);
  db()
    .prepare("INSERT INTO agent_commissions (id, agent, buyer_id, buyer, style, note, label, editions, price_usdc, deadline, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting', ?)")
    .run(id, vendor.label, userId, buyer, input.style, note, label, vendor.editions, priceUsdc, deadline, now());
  const txs: Tx[] = [
    { to: env.usdc(), data: encodeFunctionData({ abi: usdcAbi, functionName: "approve", args: [market, BigInt(priceUsdc)] }) },
    {
      to: market,
      data: encodeFunctionData({
        abi: commissionAbi,
        functionName: "requestCommission",
        args: [id, vendor.agent, vendor.owner, BigInt(priceUsdc), BigInt(deadline), vendor.editions, label],
      }),
    },
  ];
  return { id, txs, priceUsdc: priceUsdc / 1e6, name: commissionName(label, handleOf(vendor.owner_id)), deadline };
}

// Everything the escrow says must match what we handed the buyer.
function matches(c: Commission, v: VendorAgent, e: { buyer: Address; vendorAgent: Address; vendorOwner: Address; priceUsdc: bigint; deadline: bigint; editionsRegistry: Address; label: string }) {
  return (
    same(e.buyer, c.buyer) &&
    same(e.vendorAgent, v.agent) &&
    same(e.vendorOwner, v.owner) &&
    e.priceUsdc === BigInt(c.price_usdc) &&
    e.deadline === BigInt(c.deadline) &&
    same(e.editionsRegistry, c.editions) &&
    e.label === c.label
  );
}

function markPaid(c: Commission, tx: Hex | null, block: bigint | null) {
  updateCommission(c.id, { status: "paid", pay_tx: tx, pay_block: block === null ? null : Number(block), error: null });
  enqueue("commission.arkiv", c.id);
}

// The buyer's browser reports its transaction; the server reads the receipt itself and trusts nothing else.
export async function recordPayment(id: string, tx: Hex) {
  const c = getCommission(id);
  if (!c) return { ok: false as const, error: "Not found." };
  if (c.status !== "awaiting") return { ok: true as const, status: c.status };
  const v = getVendor(c.agent)!;
  const receipt = await reader().waitForTransactionReceipt({ hash: tx, timeout: 90_000 });
  const event = parseEventLogs({ abi: commissionAbi, logs: receipt.logs, eventName: "CommissionRequested" }).find(
    (l) => same(l.address, marketAddress()) && l.args.commissionId === c.id,
  );
  if (receipt.status !== "success" || !event || !matches(c, v, event.args)) return { ok: false as const, error: "That transaction didn't pay for this commission." };
  markPaid(c, tx, receipt.blockNumber);
  return { ok: true as const, status: "paid" as const };
}

// If the browser never reported back, NightMarket's own record of the escrow is enough.
export async function syncPayment(c: Commission) {
  if (c.status !== "awaiting") return c;
  const onChain = await readOnChain(c.id);
  if (onChain.status === ON_CHAIN.open && matches(c, getVendor(c.agent)!, onChain)) markPaid(c, null, null);
  return getCommission(c.id)!;
}

// The public brief: which agent, which style and which escrow. Never the note.
export const briefOf = (c: Commission) => JSON.stringify({ commission: c.id, vendor: agentName(c.agent), service: SERVICE, style: c.style });
export const parseBrief = (brief: string) => {
  try {
    return JSON.parse(brief) as { commission?: string; vendor?: string; service?: string; style?: string };
  } catch {
    return {};
  }
};

// Job 'commission.arkiv': the request goes on Arkiv once it's paid, created by the server and handed to the buyer.
// It expires at the deadline. A rerun finds the request it already wrote.
export async function recordRequestJob(id: string) {
  const c = getCommission(id);
  if (!c || c.arkiv_key || !["paid", "claimed", "making"].includes(c.status)) return;
  const existing = (await openCommissions(SERVICE)).find((r) => same(r.buyer, c.buyer) && parseBrief(r.brief).commission === c.id);
  const buyerHandle = handleOf(c.buyer_id);
  const key =
    existing?.key ??
    (
      await requestOnArkiv({
        buyer: c.buyer,
        kind: SERVICE,
        budgetUsdc: BigInt(c.price_usdc),
        deadline: new Date(c.deadline * 1000),
        brief: briefOf(c),
        buyerEns: buyerHandle ? `${buyerHandle}.${env.ensName()}` : undefined,
      })
    ).key;
  updateCommission(id, { arkiv_key: key });
  enqueue("commission.claim", id);
}

// The one-of-one name moves with its holder, so who may open the piece is read from ENS, never from our notes.
export async function holdsCommission(c: Commission, wallet: string | null) {
  if (!wallet || c.status !== "delivered") return false;
  const owner = await reader().readContract({ address: c.editions, abi: registryAbi, functionName: "findOwner", args: [c.label] });
  return same(owner, wallet);
}

// The delivered piece, for whoever holds its name right now. The local copy first, else 0G Storage.
export async function commissionFile(id: string, userId: string | null) {
  const c = getCommission(id);
  if (!c || !userId || !(await holdsCommission(c, walletOf(userId)))) return null;
  const cached = getBlob(pieceOwner(id), pieceKey(id));
  if (cached) return cached;
  if (!c.storage_root) return null;
  const bytes = await getDecrypted(c.storage_root, pieceSecret(id));
  putBlob(pieceOwner(id), pieceKey(id), "image/png", bytes);
  return { mime: "image/png", bytes };
}

// After the deadline the buyer may take the escrow back, if the agent never delivered.
export function refundTx(c: Commission): Tx {
  return { to: marketAddress(), data: encodeFunctionData({ abi: commissionAbi, functionName: "refund", args: [c.id] }) };
}

const explorerTx = (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`;
const arkivEntity = (key: string) => `${RABDI_EXPLORER}/entity/${key}`;

// What the buyer, or whoever holds the name now, may see. The note only goes back to the buyer.
export async function commissionView(id: string, userId: string | null) {
  let c = getCommission(id);
  if (!c || !userId) return null;
  const wallet = walletOf(userId);
  const isBuyer = c.buyer_id === userId;
  const holds = await holdsCommission(c, wallet);
  if (!isBuyer && !holds) return null;
  c = await syncPayment(c);
  const late = Math.floor(Date.now() / 1000) > c.deadline;
  if (late && ["paid", "claimed", "making", "late"].includes(c.status)) {
    const onChain = await readOnChain(c.id);
    if (onChain.status === ON_CHAIN.refunded) updateCommission(c.id, { status: "refunded" });
    else if (onChain.status === ON_CHAIN.open && c.status !== "late") updateCommission(c.id, { status: "late" });
    c = getCommission(id)!;
  }
  const owner = getVendor(c.agent);
  return {
    id: c.id,
    agent: c.agent,
    agentName: agentName(c.agent),
    status: c.status,
    style: c.style,
    styleLabel: STYLES[c.style]?.label ?? c.style,
    note: isBuyer ? c.note : null,
    name: owner ? commissionName(c.label, handleOf(owner.owner_id)) : c.label,
    priceUsdc: c.price_usdc / 1e6,
    deadline: c.deadline,
    error: c.status === "delivered" ? null : c.error,
    holds,
    file: holds ? `/api/commissions/${c.id}/file` : null,
    refund: isBuyer && c.status === "late" ? refundTx(c) : null,
    proof: {
      paid: c.pay_tx ? explorerTx(c.pay_tx) : null,
      request: c.arkiv_key ? arkivEntity(c.arkiv_key) : null,
      claim: c.claim_key ? arkivEntity(c.claim_key) : null,
      storage: c.storage_root ? storageExplorer(c.storage_root) : null,
      delivered: c.deliver_tx ? explorerTx(c.deliver_tx) : null,
      name: c.status === "delivered" && owner ? `https://sepolia.app.ens.domains/${commissionName(c.label, handleOf(owner.owner_id))}` : null,
    },
  };
}

export type CommissionView = NonNullable<Awaited<ReturnType<typeof commissionView>>>;
