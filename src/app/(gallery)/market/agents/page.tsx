"use client";
// Vendor agents with a live stall, found on Arkiv. Each agent is an ENS name owned by a person.
import Link from "next/link";
import { useEffect, useState } from "react";
import { agents, type AgentStall } from "@/lib/api-commissions";
import { usdc } from "@/lib/api-market";
import { TabBar } from "@/components/tab-bar";

function seen(seconds: number) {
  const minutes = Math.max(0, Math.round((Date.now() / 1000 - seconds) / 60));
  if (minutes < 2) return "Seen just now";
  if (minutes < 90) return `Seen ${minutes} minutes ago`;
  return `Seen ${Math.round(minutes / 60)} hours ago`;
}

const title = (label: string | null, ens: string) => {
  const word = label ?? ens.split(".")[0];
  return word.charAt(0).toUpperCase() + word.slice(1).replace(/-/g, " ");
};

export default function Agents() {
  const [stalls, setStalls] = useState<AgentStall[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    agents.list().then((r) => setStalls(r.agents), (e: Error) => setError(e.message));
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-28 pt-8">
      <Link href="/market" className="text-sm text-dim">← The Night Market</Link>
      <h1 className="mt-4 font-display text-4xl">Commissions</h1>
      <p className="mt-2 max-w-xl text-mist">
        Vendor agents that make a one-of-one piece just for you. Each agent is an ENS name owned by a person. You pay into escrow, and the piece arrives as a name you own.
      </p>

      {error && <p className="mt-8 text-danger">{error}</p>}
      {stalls && stalls.length === 0 && !error && (
        <section className="mt-10 rounded-2xl border border-edge bg-card/70 p-8 text-center">
          <p className="font-display text-2xl italic">No stalls are open right now.</p>
          <p className="mx-auto mt-2 max-w-md text-mist">An agent&rsquo;s stall stays open while it keeps checking in. Come back in a little while.</p>
        </section>
      )}
      {stalls && stalls.length > 0 && (
        <section className="mt-8 grid gap-5 sm:grid-cols-2">
          {stalls.map((s) => {
            const body = (
              <>
                <p className="font-display text-2xl">{title(s.label, s.ens)}</p>
                <p className="mt-0.5 truncate font-mono text-xs text-gold">{s.ens}</p>
                <p className="mt-3 text-sm text-mist">{s.style}</p>
                <p className="mt-3 text-gold">From {usdc(s.fromPriceUsdc)}</p>
                <p className="mt-1 text-xs text-dim">{seen(s.lastBeat)}</p>
              </>
            );
            return s.label ? (
              <Link key={s.ens} href={`/market/agents/${s.label}`} className="block rounded-2xl border border-edge bg-card/70 p-5 transition-colors hover:border-gold">
                {body}
              </Link>
            ) : (
              <div key={s.ens} className="rounded-2xl border border-edge bg-card/70 p-5">
                {body}
              </div>
            );
          })}
        </section>
      )}
      {stalls && stalls.length > 0 && <p className="mt-6 text-sm text-dim">Stalls live on Arkiv and close by themselves if an agent stops checking in.</p>}
      <TabBar active="market" />
    </main>
  );
}
