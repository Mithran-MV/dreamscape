"use client";
// Sell numbered editions of a hung comic or a painted dream. Once listed, it links to its market page.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { market, pieceIdFor, usdc, type PieceView } from "@/lib/api-market";
import { plainError } from "@/components/messages";

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
      <Link href={`/market/${id}`} className="press mt-6 flex items-center justify-between gap-4 rounded-[1.25rem] border border-edge bg-card/80 px-5 py-4 transition-colors hover:border-gold">
        <span className="min-w-0">
          <span className="block font-semibold text-paper">On the Night Market at {usdc(piece.priceUsdc)}</span>
          <span className="mt-0.5 block text-ui text-mist">{piece.status === "listing" ? "Going up on the market…" : `${piece.sold} of ${piece.editions} sold`}</span>
        </span>
        <span className="shrink-0 text-ui font-semibold text-gold">See it</span>
      </Link>
    );
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-line mt-6">
        Sell numbered editions
      </button>
    );
  }
  return (
    <form
      className="panel appear mt-6 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        market
          .sell({ kind, ref: refId, priceUsdc: Number(price), editions: Number(editions) })
          .then(load, (err: Error) => setError(plainError(err.message)))
          .finally(() => setBusy(false));
      }}
    >
      <p className="font-display text-title font-semibold">Sell numbered editions</p>
      <p className="mt-1 text-ui text-mist">Each buyer gets an ENS name for their edition and the full piece. You get 95% of every sale.</p>
      <div className="mt-4 flex flex-wrap gap-4">
        <label className="text-ui font-semibold text-mist">
          Price in USDC
          <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="field mt-1.5 block w-32" />
        </label>
        <label className="text-ui font-semibold text-mist">
          Editions
          <input value={editions} onChange={(e) => setEditions(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" className="field mt-1.5 block w-24" />
        </label>
      </div>
      <div className="mt-5 flex items-center gap-2">
        <button disabled={busy} className="btn btn-gold">
          {busy ? "Listing…" : "List it"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-quiet">
          Not now
        </button>
      </div>
      {error && <p className="mt-3 text-ui text-danger">{error}</p>}
    </form>
  );
}
