// Browser-side calls for the Night Market.
import { keccak256, toHex, type Hex } from "viem";

export type ListingCard = {
  pieceId: Hex;
  title: string;
  category: string;
  priceUsdc: number;
  editionsTotal: number;
  sellerEns: string;
  listedAt: number;
  sealed: boolean;
  model: string;
  themes: string[];
  preview: string | null;
};

export type PieceView = {
  id: Hex;
  kind: "episode" | "dream";
  title: string;
  status: "listing" | "listed";
  sellerEns: string | null;
  mine: boolean;
  priceUsdc: number;
  editions: number;
  sold: number;
  open: boolean;
  holds: boolean;
  names: string[];
  nextName: string | null;
  buy: { to: `0x${string}`; data: Hex }[] | null;
  proof: { market: string; listedTx: string | null; arkiv: string | null };
};

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

// Same id the server and NightMarket use, so the sell panel can look its piece up.
export const pieceIdFor = (kind: "episode" | "dream", ref: string) => keccak256(toHex(`dreamscape:${kind}:${ref}`));

export const market = {
  search: (q: { themes?: string[]; category?: string; max?: number; sort?: string }) => {
    const p = new URLSearchParams();
    if (q.themes?.length) p.set("themes", q.themes.join(","));
    if (q.category) p.set("category", q.category);
    if (q.max) p.set("max", String(q.max));
    if (q.sort) p.set("sort", q.sort);
    return fetch(`/api/market?${p}`).then((r) => json<{ listings: ListingCard[] }>(r));
  },
  picks: () => fetch("/api/market?picks=1").then((r) => json<{ listings: ListingCard[] }>(r)),
  piece: (id: string) => fetch(`/api/market/${id}`).then((r) => (r.status === 404 ? null : json<PieceView>(r))),
  sell: (body: { kind: "episode" | "dream"; ref: string; priceUsdc: number; editions: number }) =>
    fetch("/api/market", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => json<{ id: Hex }>(r)),
  bought: (id: string, tx: string) =>
    fetch(`/api/market/${id}/bought`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tx }) }).then((r) =>
      json<{ editions: { editionNo: number; name: string }[] }>(r),
    ),
};

export const previewUrl = (id: string) => `/api/market/${id}/preview`;
export const fullUrl = (id: string) => `/api/market/${id}/full`;
export const fullPanelUrl = (id: string, n: number) => `/api/market/${id}/panel/${n}`;
export const usdc = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`;
