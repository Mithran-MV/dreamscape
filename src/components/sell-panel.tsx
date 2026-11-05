"use client";
// Sell numbered editions of a hung comic or a painted dream. Once listed, it links to its market page.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { market, pieceIdFor, usdc, type PieceView } from "@/lib/api-market";

export function SellPanel({ kind, refId, suggested }: { kind: "episode" | "dream"; refId: string; suggested: number }) {
  const id = pieceIdFor(kind, refId);
  const [piece, setPiece] = useState<PieceView | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(String(suggested));
  const [editions, setEditions] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => market.piece(id).then(setPiece, () => setPiece(null)), [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (piece === undefined) return null;
  if (piece) {
    return (
      <Link href={`/market/${id}`} className="mt-6 block rounded-xl border border-edge bg-card/70 p-4 text-sm hover:border-gold">
        <span className="text-paper">On the Night Market at {usdc(piece.priceUsdc)}</span>
        <span className="mt-0.5 block text-dim">{piece.status === "listing" ? "Being listed…" : `${piece.sold} of ${piece.editions} sold`}</span>
      </Link>
    );
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-6 rounded-full border border-line px-4 py-2 text-sm text-mist hover:border-gold">
        Sell numbered editions
      </button>
    );
  }
  return (
    <form
      className="mt-6 rounded-xl border border-edge bg-card/70 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        market
          .sell({ kind, ref: refId, priceUsdc: Number(price), editions: Number(editions) })
          .then(load, (err: Error) => setError(err.message))
          .finally(() => setBusy(false));
      }}
    >
      <p className="font-display text-lg">Sell numbered editions</p>
      <p className="mt-1 text-sm text-dim">Each buyer gets an ENS name for their edition and the full piece. You get 95% of every sale.</p>
      <div className="mt-4 flex flex-wrap gap-4">
        <label className="text-sm text-mist">
          Price in USDC
          <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="mt-1 block w-28 rounded-lg border border-line bg-card px-3 py-2 text-paper focus:border-gold focus:outline-none" />
        </label>
        <label className="text-sm text-mist">
          Editions
          <input value={editions} onChange={(e) => setEditions(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" className="mt-1 block w-20 rounded-lg border border-line bg-card px-3 py-2 text-paper focus:border-gold focus:outline-none" />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button disabled={busy} className="rounded-full bg-gold px-5 py-2 font-medium text-gold-ink disabled:opacity-60">{busy ? "Listing…" : "List it"}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-dim">Not now</button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </form>
  );
}
