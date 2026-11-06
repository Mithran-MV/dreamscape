"use client";
// Drafts: tonight's comics wait here until the dreamer hangs them or lets them go,
// with what today has cost so far against the nightly budget.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, panelUrl, type EpisodeDetail, type EpisodeSummary } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { ComicPage } from "@/components/comic";
import { dayLabel } from "@/components/ui";
import { plainError } from "@/components/messages";

// The same daily limit as DAILY_BUDGET_USD in the server's nightly run: past it, comics and moving portraits wait for tomorrow.
const NIGHT_BUDGET_USD = 1;
const usd = (n: number) => `$${n.toFixed(n > 0 && n < 0.1 ? 4 : 2)}`;

export default function DraftsPage() {
  const [episodes, setEpisodes] = useState<EpisodeSummary[] | null>(null);
  const [details, setDetails] = useState<Record<string, EpisodeDetail>>({});
  const [spent, setSpent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([api.episodes(), api.nightly()]).then(async ([e, n]) => {
        setEpisodes(e.episodes);
        setSpent(n.spentTodayUsd);
        // Each draft's script and traces come from its own page.
        const drafts = e.episodes.filter((x) => x.status === "draft");
        const full = await Promise.all(drafts.map((d) => api.episode(d.id).catch(() => null)));
        setDetails(Object.fromEntries(full.filter((d): d is EpisodeDetail => d !== null).map((d) => [d.id, d])));
      }, (e: Error) => setError(e.message)),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  const working = episodes?.find((e) => e.status === "writing" || e.status === "drawing");
  // While tonight's comic is being made, look again every few seconds.
  useEffect(() => {
    if (!working) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [working, load]);

  const drafts = episodes?.filter((e) => e.status === "draft") ?? [];
  const makeNow = () => {
    setAsking(true);
    setError(null);
    api
      .night("run")
      .then(load, (e: Error) => setError(e.message))
      .finally(() => setAsking(false));
  };

  return (
    <AppShell active="drafts" drafts={episodes ? drafts.length : undefined}>
      <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-end">
        <div>
          <h1 className="font-display text-h1 md:text-display">Drafts</h1>
          <p className="mt-4 max-w-[52ch] text-lead text-mist">Each night your newest dream can become a four-panel comic. It waits here, seen only by you, until you hang it or discard it.</p>
        </div>
        {spent !== null && <CreditBar spent={spent} />}
      </header>

      {error && <p className="mt-8 text-ui text-danger">{plainError(error)}</p>}

      {working && (
        <Link href={`/episode/${working.id}`} className="mt-10 flex items-center justify-between gap-4 rounded-[1.25rem] border border-gold/50 bg-card/80 px-5 py-4 transition-colors hover:border-gold">
          <span className="flex items-center gap-3">
            <span className="breathe h-2.5 w-2.5 shrink-0 rounded-full bg-gold" aria-hidden />
            <span>
              <span className="block font-display text-title font-semibold">Tonight&rsquo;s comic is on its way</span>
              <span className="block text-ui text-mist">{working.status === "writing" ? "Writing the script from your dream." : "Drawing the four panels."}</span>
            </span>
          </span>
          <span className="shrink-0 text-ui font-semibold text-gold">Watch it</span>
        </Link>
      )}

      {!episodes ? (
        <div className="painting mt-12 aspect-[16/9] rounded-[1.25rem]" aria-hidden />
      ) : drafts.length === 0 ? (
        !working && (
          <section className="panel mt-12 px-6 py-14 text-center">
            <h2 className="font-display text-h2">Nothing waiting</h2>
            <p className="mx-auto mt-3 max-w-md text-mist">Tonight&rsquo;s comic lands here by morning. You can make one now from your newest dream.</p>
            <button onClick={makeNow} disabled={asking} className="btn btn-gold btn-lg mt-7">
              {asking ? "Starting it…" : "Make tonight’s comic now"}
            </button>
          </section>
        )
      ) : (
        <div className="mt-12 space-y-16">
          {drafts.map((d) => (
            <Draft key={d.id} summary={d} detail={details[d.id]} onDecided={load} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function CreditBar({ spent }: { spent: number }) {
  const share = Math.min(1, spent / NIGHT_BUDGET_USD);
  return (
    <section className="panel p-5" aria-labelledby="credit">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="credit" className="font-display text-title">
          Today&rsquo;s credit
        </h2>
        <p className="font-mono text-ui text-paper">
          {usd(spent)} <span className="text-dim">of {usd(NIGHT_BUDGET_USD)}</span>
        </p>
      </div>
      <div
        className="mt-3 h-3 overflow-hidden rounded-full bg-edge"
        role="meter"
        aria-label="Spent today"
        aria-valuemin={0}
        aria-valuemax={NIGHT_BUDGET_USD}
        aria-valuenow={Number(spent.toFixed(4))}
        aria-valuetext={`${usd(spent)} of ${usd(NIGHT_BUDGET_USD)}`}
      >
        <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(share * 100, spent > 0 ? 1.5 : 0)}%` }} />
      </div>
      <p className="mt-3 text-meta text-mist">What your dreams and comics cost on 0G today. Comics and moving portraits wait for tomorrow once this reaches the daily limit.</p>
    </section>
  );
}

function Draft({ summary, detail, onDecided }: { summary: EpisodeSummary; detail?: EpisodeDetail; onDecided: () => void }) {
  const [deciding, setDeciding] = useState<"publish" | "discard" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decide = (action: "publish" | "discard") => {
    setDeciding(action);
    setError(null);
    api
      .decide(summary.id, action)
      .then(onDecided, (e: Error) => setError(e.message))
      .finally(() => setDeciding(null));
  };
  const writer = detail?.traces.find((t) => t.step === "script")?.model;
  const drawer = detail?.traces.find((t) => t.step.startsWith("panel"))?.model;

  return (
    <article className="appear grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-14">
      <Link href={`/episode/${summary.id}`} className="block min-w-0 rounded-[3px]" aria-label={`Open ${summary.title ?? "this comic"}`}>
        {detail?.script ? (
          <ComicPage script={detail.script} feeling={detail.feeling} saga={detail.saga} panelSrc={(n) => panelUrl(summary.id, n)} />
        ) : (
          <div className="painting aspect-square rounded-[3px]" />
        )}
      </Link>
      <div className="lg:sticky lg:top-28 lg:self-start">
        <p className="text-ui font-semibold text-gold">{dayLabel(summary.day)}</p>
        <h2 className="mt-2 font-display text-h1">{summary.title ?? detail?.script?.title ?? "Tonight’s comic"}</h2>
        {summary.saga && (
          <p className="mt-3 text-ui text-mist">
            Part of <span className="font-display font-semibold italic text-paper">{summary.saga}</span>
          </p>
        )}
        {(writer || drawer) && (
          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-ui">
            {writer && (
              <>
                <dt className="text-dim">Written by</dt>
                <dd className="truncate font-mono text-meta text-paper">{writer}</dd>
              </>
            )}
            {drawer && (
              <>
                <dt className="text-dim">Drawn by</dt>
                <dd className="truncate font-mono text-meta text-paper">{drawer}</dd>
              </>
            )}
          </dl>
        )}
        <div className="mt-7 flex flex-wrap gap-3">
          <button onClick={() => decide("publish")} disabled={deciding !== null} className="btn btn-gold btn-lg">
            {deciding === "publish" ? "Hanging it…" : "Hang it"}
          </button>
          <button onClick={() => decide("discard")} disabled={deciding !== null} className="btn btn-line btn-lg">
            {deciding === "discard" ? "Discarding…" : "Discard"}
          </button>
        </div>
        <p className="mt-3 text-ui text-dim">Hanging it adds it to your wall. Nothing gets shared or sold unless you choose to.</p>
        {error && <p className="mt-3 text-ui text-danger">{plainError(error)}</p>}
      </div>
    </article>
  );
}
