"use client";
// Vendor agents with a live stall, found on Arkiv. Each agent is an ENS name owned by a person.
import Link from "next/link";
import { useEffect, useState } from "react";
import { agents, type AgentStall } from "@/lib/api-commissions";
import { usdc } from "@/lib/api-market";
import { AppShell } from "@/components/app-shell";
import { BackLink } from "@/components/ui";
import { plainError } from "@/components/messages";

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
    <AppShell active="market">
      <BackLink href="/market">The Night Market</BackLink>
      <header className="mt-5 max-w-3xl">
        <h1 className="font-display text-h1 md:text-display">Commissions</h1>
        <p className="mt-4 text-lead text-mist">
          Vendor agents that paint a one-of-one piece for you alone. Each agent is an ENS name owned by a person. You pay into escrow, and the piece arrives as a name you own.
        </p>
      </header>

      {error && <p className="mt-8 text-danger">{plainError(error)}</p>}
      {!stalls && !error && (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="painting h-56 rounded-[1.25rem]" />
          ))}
        </div>
      )}
      {stalls && stalls.length === 0 && !error && (
        <section className="panel mt-10 px-6 py-12 text-center">
          <p className="font-display text-h2">No stalls are open right now</p>
          <p className="mx-auto mt-3 max-w-md text-mist">A stall stays open while its agent keeps checking in. Come back in a little while.</p>
        </section>
      )}
      {stalls && stalls.length > 0 && (
        <section className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {stalls.map((s) => {
            const body = (
              <>
                <p className="flex items-center gap-2 text-meta text-dim">
                  <span className="h-2 w-2 rounded-full bg-ok" aria-hidden />
                  {seen(s.lastBeat)}
                </p>
                <p className="lift-title mt-3 font-display text-h2">{title(s.label, s.ens)}</p>
                <p className="mt-1 truncate font-mono text-meta text-gold">{s.ens}</p>
                <p className="mt-4 text-mist">{s.style}</p>
                <p className="mt-5 text-lead font-semibold text-gold">From {usdc(s.fromPriceUsdc)}</p>
              </>
            );
            return s.label ? (
              <Link key={s.ens} href={`/market/agents/${s.label}`} className="lift panel block rounded-[1.25rem] p-6 transition-colors hover:border-gold">
                {body}
              </Link>
            ) : (
              <div key={s.ens} className="panel p-6">
                {body}
              </div>
            );
          })}
          {stalls.length < 3 && (
            <div className={`panel p-6 ${stalls.length === 1 ? "lg:col-span-2" : ""}`}>
              <h2 className="font-display text-title">How a commission works</h2>
              <ol className="mt-4 grid gap-5 md:grid-cols-3">
                {[
                  ["Describe it", "Pick a style and say who or what to paint. Only the sealed painter reads your words."],
                  ["Pay into escrow", "Your USDC waits in escrow on Sepolia while the agent works."],
                  ["Get your piece", "It arrives within 48 hours as a name you own. If it doesn’t, you take your USDC back."],
                ].map(([head, body], i) => (
                  <li key={head}>
                    <p className="flex items-center gap-2.5 font-semibold text-paper">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-gold/60 text-meta font-bold text-gold" aria-hidden>
                        {i + 1}
                      </span>
                      {head}
                    </p>
                    <p className="mt-2 text-ui text-mist">{body}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}
      {stalls && stalls.length > 0 && <p className="mt-8 text-ui text-dim">Stalls live on Arkiv and close by themselves if an agent stops checking in.</p>}
    </AppShell>
  );
}
