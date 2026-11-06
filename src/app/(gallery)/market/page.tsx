"use client";
// The Night Market: tonight's stalls, then everything dreamers have put up for sale, searched on Arkiv.
import Link from "next/link";
import { useEffect, useState } from "react";
import { market, previewUrl, usdc, type ListingCard } from "@/lib/api-market";
import { AppShell } from "@/components/app-shell";
import { Frame, useMinute } from "@/components/ui";
import { plainError } from "@/components/messages";

const THEMES = ["water", "flight", "falling", "chase", "home", "animals", "people", "school", "city", "nature", "fantasy", "night"];
const KINDS = [
  { key: "", label: "All" },
  { key: "comic", label: "Comics" },
  { key: "portrait", label: "Portraits" },
];

// Tonight's stalls close at dawn, 06:00 UTC.
function untilDawn(minute: number) {
  const now = minute * 60_000;
  const dawn = new Date(now);
  dawn.setUTCHours(6, 0, 0, 0);
  if (dawn.getTime() <= now) dawn.setUTCDate(dawn.getUTCDate() + 1);
  const left = Math.round((dawn.getTime() - now) / 60_000);
  return `${Math.floor(left / 60)}h ${left % 60}m`;
}

export default function Market() {
  const [themes, setThemes] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [max, setMax] = useState("");
  const [sort, setSort] = useState("newest");
  const [listings, setListings] = useState<ListingCard[] | null>(null);
  const [picks, setPicks] = useState<ListingCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const minute = useMinute();

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
  const filtered = themes.length > 0 || category !== "" || max !== "";

  return (
    <AppShell active="market">
      <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-end">
        <div>
          <h1 className="font-display text-h1 md:text-display">The Night Market</h1>
          <p className="mt-4 max-w-2xl text-lead text-mist">
            Comics and portraits from other people&rsquo;s dreams, sold as numbered editions. Each edition is an ENS name you own, and it opens the full piece.
          </p>
        </div>
        <Link href="/market/agents" className="press group block rounded-[1.25rem] border border-gold/50 bg-card/80 p-5 transition-colors hover:border-gold">
          <span className="block font-display text-title font-semibold">Commission a one-of-one</span>
          <span className="mt-1 block text-ui text-mist">A vendor agent paints a piece for you alone. You pay into escrow, and the piece arrives as a name you own.</span>
          <span className="mt-3 block text-ui font-semibold text-gold">See the stalls</span>
        </Link>
      </header>

      {picks.length > 0 && (
        <section className="mt-14" aria-labelledby="stalls">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 id="stalls" className="font-display text-h2">
              Tonight&rsquo;s stalls
            </h2>
            <p className="text-ui text-dim">These close by themselves at dawn.</p>
          </div>
          <div className="-mx-5 mt-6 flex snap-x gap-6 overflow-x-auto px-5 pb-4 md:-mx-8 md:px-8">
            {picks.map((l) => (
              <Link key={l.pieceId} href={`/market/${l.pieceId}`} className="lift w-60 shrink-0 snap-start sm:w-64 lg:w-72">
                <Frame src={l.preview ?? previewUrl(l.pieceId)} alt={l.title} />
                <p className="lift-title mt-4 truncate font-display text-title font-semibold">{l.title}</p>
                <p className="mt-1 flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-gold">{usdc(l.priceUsdc)}</span>
                  {minute > 0 && <span className="text-meta text-dim">Gone at dawn, in {untilDawn(minute)}</span>}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="panel mt-14 p-5 md:p-6" aria-labelledby="search">
        <h2 id="search" className="font-display text-title">
          Search the market
        </h2>
        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Kind">
              <span className="w-16 text-meta font-semibold text-dim">Kind</span>
              {KINDS.map((k) => (
                <button key={k.key} type="button" onClick={() => setCategory(k.key)} aria-pressed={category === k.key} className="chip">
                  {k.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Themes">
              <span className="w-16 text-meta font-semibold text-dim">Themes</span>
              {THEMES.map((t) => (
                <button key={t} type="button" onClick={() => toggle(t)} aria-pressed={themes.includes(t)} className="chip">
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-ui font-semibold text-mist">
              Up to
              <input value={max} onChange={(e) => setMax(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="any" className="field w-24 py-2 text-ui" />
              USDC
            </label>
            <label className="sr-only" htmlFor="sort">
              Sort
            </label>
            <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)} className="field w-auto py-2 text-ui">
              <option value="newest">Newest first</option>
              <option value="price-asc">Price, low to high</option>
              <option value="price-desc">Price, high to low</option>
            </select>
          </div>
        </div>
      </section>

      {error && <p className="mt-8 text-danger">{plainError(error)}</p>}
      {!listings && !error && (
        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="painting aspect-square rounded-[3px]" />
          ))}
        </div>
      )}
      {listings && listings.length === 0 && !error && (
        <section className="panel mt-10 px-6 py-12 text-center">
          <p className="font-display text-h2">{filtered ? "Nothing matches that search" : "The stalls are empty tonight"}</p>
          <p className="mx-auto mt-3 max-w-md text-mist">
            {filtered ? "Try fewer themes, or raise the price cap." : "Hang a comic or keep a painted dream, then sell numbered editions of it from its page."}
          </p>
        </section>
      )}
      {listings && listings.length > 0 && (
        <section className="mt-10 grid grid-cols-1 gap-x-7 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Results">
          {listings.map((l) => (
            <Result key={l.pieceId} l={l} />
          ))}
          {!filtered && listings.length < 4 && (
            <Link href="/" className="lift group hidden sm:block">
              <div className="grid aspect-square place-items-center rounded-[3px] border-2 border-dashed border-line p-6 text-center transition-colors group-hover:border-gold">
                <span className="text-ui text-mist">
                  <span className="block font-display text-title font-semibold text-paper">Your stall could be here</span>
                  <span className="mt-2 block">Open a painted dream or a hung comic and choose Sell numbered editions.</span>
                </span>
              </div>
            </Link>
          )}
        </section>
      )}
    </AppShell>
  );
}

// One result. What's left comes from NightMarket itself, so each card asks for its own piece.
function Result({ l }: { l: ListingCard }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    market.piece(l.pieceId).then((p) => p && setLeft(p.editions - p.sold), () => undefined);
  }, [l.pieceId]);
  const comic = l.category === "comic";
  return (
    <Link href={`/market/${l.pieceId}`} className="lift appear">
      {comic ? (
        <div className="paper-card">
          {/* eslint-disable-next-line @next/next/no-img-element -- a small public preview */}
          <img src={l.preview ?? previewUrl(l.pieceId)} alt="" className="aspect-square w-full object-cover" />
        </div>
      ) : (
        <Frame src={l.preview ?? previewUrl(l.pieceId)} alt={l.title} />
      )}
      <div className="mt-4 flex items-center gap-2">
        <span className="text-meta font-semibold text-mist">{comic ? "Comic" : "Portrait"}</span>
        {l.sealed && (
          <span className="inline-flex items-center gap-1 rounded-full border border-ok/50 px-2 py-px text-[12px] font-semibold text-ok" title="Made in a sealed enclave on 0G">
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
            Verified
          </span>
        )}
      </div>
      <p className="lift-title mt-1 truncate font-display text-title font-semibold">{l.title}</p>
      <p className="truncate font-mono text-meta text-dim">{l.sellerEns}</p>
      <p className="mt-2 flex items-baseline justify-between gap-3">
        <span className="text-lead font-semibold text-gold">{usdc(l.priceUsdc)}</span>
        <span className="text-meta text-mist">
          {left === null ? (l.editionsTotal === 1 ? "One of one" : `${l.editionsTotal} editions`) : left === 0 ? "Sold out" : `${left} of ${l.editionsTotal} left`}
        </span>
      </p>
    </Link>
  );
}
