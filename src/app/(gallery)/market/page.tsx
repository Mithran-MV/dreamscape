"use client";
// The Night Market: pieces dreamers have put up for sale, searched on Arkiv.
import Link from "next/link";
import { useEffect, useState } from "react";
import { market, previewUrl, usdc, type ListingCard } from "@/lib/api-market";
import { Frame } from "@/components/ui";
import { TabBar } from "@/components/tab-bar";

const THEMES = ["water", "flight", "falling", "chase", "home", "animals", "people", "school", "city", "nature", "fantasy", "night"];
const KINDS = [
  { key: "", label: "Everything" },
  { key: "comic", label: "Comics" },
  { key: "portrait", label: "Portraits" },
];

export default function Market() {
  const [themes, setThemes] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [max, setMax] = useState("");
  const [sort, setSort] = useState("newest");
  const [listings, setListings] = useState<ListingCard[] | null>(null);
  const [picks, setPicks] = useState<ListingCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    market
      .search({ themes, category, max: Number(max) || undefined, sort })
      .then((r) => live && (setListings(r.listings), setError(null)), (e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [themes, category, max, sort]);

  useEffect(() => {
    market.picks().then((r) => setPicks(r.listings), () => setPicks([]));
  }, []);

  const toggle = (t: string) => setThemes((all) => (all.includes(t) ? all.filter((x) => x !== t) : [...all, t]));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-28 pt-8">
      <Link href="/" className="text-sm text-dim">← Gallery</Link>
      <h1 className="mt-4 font-display text-4xl">The Night Market</h1>
      <p className="mt-2 max-w-xl text-mist">
        Comics and portraits from other people&rsquo;s dreams, sold as numbered editions. Each edition is an ENS name you own, and it opens the full piece.
      </p>
      <Link href="/market/agents" className="mt-3 inline-block text-sm text-gold">Or commission a one-of-one from a vendor agent</Link>

      {picks.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl">Tonight&rsquo;s picks</h2>
          <p className="text-sm text-dim">These stalls close by themselves at dawn.</p>
          <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
            {picks.map((l) => (
              <Link key={l.pieceId} href={`/market/${l.pieceId}`} className="w-36 shrink-0">
                <Frame src={l.preview ?? previewUrl(l.pieceId)} alt={l.title} />
                <p className="mt-2 truncate text-sm">{l.title}</p>
                <p className="text-xs text-gold">{usdc(l.priceUsdc)}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <button
            key={k.key}
            onClick={() => setCategory(k.key)}
            aria-pressed={category === k.key}
            className={`rounded-full border px-3.5 py-1.5 text-sm ${category === k.key ? "border-gold bg-gold text-gold-ink" : "border-line text-mist hover:border-gold"}`}
          >
            {k.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <label className="flex items-center gap-2 text-sm text-mist">
          Up to
          <input
            value={max}
            onChange={(e) => setMax(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder="any"
            className="w-16 rounded-lg border border-line bg-card px-2 py-1 text-paper placeholder:text-dim focus:border-gold focus:outline-none"
          />
          USDC
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-paper focus:border-gold focus:outline-none">
          <option value="newest">Newest first</option>
          <option value="price-asc">Price, low to high</option>
          <option value="price-desc">Price, high to low</option>
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {THEMES.map((t) => (
          <button
            key={t}
            onClick={() => toggle(t)}
            aria-pressed={themes.includes(t)}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${themes.includes(t) ? "border-paper text-paper" : "border-edge text-dim hover:text-mist"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <p className="mt-8 text-danger">{error}</p>}
      {listings && listings.length === 0 && !error && (
        <section className="mt-10 rounded-2xl border border-edge bg-card/70 p-8 text-center">
          <p className="font-display text-2xl italic">Nothing on the stalls yet{themes.length || category || max ? " for that search" : ""}.</p>
          <p className="mx-auto mt-2 max-w-md text-mist">Hang a comic or keep a painted dream, then sell numbered editions of it from its page.</p>
        </section>
      )}
      {listings && listings.length > 0 && (
        <section className="mt-8 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {listings.map((l) => (
            <Link key={l.pieceId} href={`/market/${l.pieceId}`} className="group block">
              {l.category === "comic" ? (
                <div className="rounded-[3px] bg-[#fbf9f4] p-2 transition-transform group-hover:-translate-y-0.5">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a small public preview */}
                  <img src={l.preview ?? previewUrl(l.pieceId)} alt="" className="aspect-square w-full object-cover" />
                </div>
              ) : (
                <Frame src={l.preview ?? previewUrl(l.pieceId)} alt={l.title} className="transition-transform group-hover:-translate-y-0.5" />
              )}
              <p className="mt-2 truncate font-display text-base">{l.title}</p>
              <p className="truncate font-mono text-[11px] text-dim">{l.sellerEns}</p>
              <p className="mt-1 text-sm text-gold">{usdc(l.priceUsdc)}</p>
              <p className="text-xs text-dim">{l.editionsTotal === 1 ? "One of one" : `${l.editionsTotal} editions`}</p>
            </Link>
          ))}
        </section>
      )}
      <TabBar active="market" />
    </main>
  );
}
