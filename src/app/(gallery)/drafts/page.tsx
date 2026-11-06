"use client";
// Drafts: last night's three pieces wait here until the dreamer hangs them or lets them go: the comic,
// the poster of the week's sky, and the moving portrait. Hung, the comic and the poster can go to the
// Night Market. Beside them, what today has cost so far against the nightly budget.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, panelUrl, type EpisodeDetail, type EpisodeSummary, type NightlyDrafts } from "@/lib/api";
import { SellPanel } from "@/components/sell-panel";
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
  const [night, setNight] = useState<NightlyDrafts | null>(null);
  const [hung, setHung] = useState<{ id: string; title: string; image: string }[]>([]);

  const load = useCallback(
    () =>
      Promise.all([api.episodes(), api.nightly(), api.nightlyDrafts()]).then(async ([e, n, d]) => {
        setEpisodes(e.episodes);
        setSpent(n.spentTodayUsd);
        setNight(d);
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
          <p className="mt-4 max-w-[56ch] text-lead text-mist">
            Every night, three hours before your 0G credit resets, what&rsquo;s left of it makes three pieces: a poster of your week&rsquo;s sky, a comic of your newest dream and a moving portrait. They wait
            here, seen only by you, until you hang them or let them go.
          </p>
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
      ) : drafts.length === 0 && !night?.posters.length && !night?.portraits.length && !hung.length ? (
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
          {night?.posters.map((p) => (
            <Poster key={p.id} poster={p} onHung={() => setHung((h) => [...h, { id: p.id, title: p.title, image: p.image }])} onDecided={setNight} />
          ))}
          {hung.map((p) => (
            <HungPoster key={p.id} poster={p} />
          ))}
          {night?.portraits.map((p) => (
            <Portrait key={p.dreamId} portrait={p} onDecided={setNight} />
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

function Decide({ onHang, onLetGo, hang = "Hang it", note }: { onHang: () => Promise<unknown>; onLetGo: () => Promise<unknown>; hang?: string; note: string }) {
  const [deciding, setDeciding] = useState<"hang" | "let-go" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = (which: "hang" | "let-go", act: () => Promise<unknown>) => {
    setDeciding(which);
    setError(null);
    act()
      .catch((e: Error) => setError(e.message))
      .finally(() => setDeciding(null));
  };
  return (
    <>
      <div className="mt-7 flex flex-wrap gap-3">
        <button onClick={() => run("hang", onHang)} disabled={deciding !== null} className="btn btn-gold btn-lg">
          {deciding === "hang" ? "Hanging it…" : hang}
        </button>
        <button onClick={() => run("let-go", onLetGo)} disabled={deciding !== null} className="btn btn-line btn-lg">
          {deciding === "let-go" ? "Letting it go…" : "Let it go"}
        </button>
      </div>
      <p className="mt-3 text-ui text-dim">{note}</p>
      {error && <p className="mt-3 text-ui text-danger">{plainError(error)}</p>}
    </>
  );
}

function Poster({ poster, onHung, onDecided }: { poster: NightlyDrafts["posters"][number]; onHung: () => void; onDecided: (d: NightlyDrafts) => void }) {
  return (
    <article className="appear grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-14">
      <div className="frame">
        <div className="mat aspect-square w-full">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, decrypted per request */}
          <img src={poster.image} alt={poster.title} className="h-full w-full object-cover" />
        </div>
      </div>
      <div className="lg:sticky lg:top-28 lg:self-start">
        <p className="text-ui font-semibold text-gold">{poster.kind === "week" ? "This week's constellation" : "Last night's poster"}</p>
        <h2 className="mt-2 font-display text-h1">{poster.title}</h2>
        {poster.text && <p className="mt-3 text-lead text-mist">{poster.text}</p>}
        <Decide
          onHang={() =>
            api.decideDraft("poster", poster.id, "hang").then((d) => {
              onHung();
              onDecided(d);
            })
          }
          onLetGo={() => api.decideDraft("poster", poster.id, "let-go").then(onDecided)}
          note="Hanging it puts it in your Memories, and you can sell it on the Night Market."
        />
      </div>
    </article>
  );
}

// A poster just hung: it can go straight to the Night Market.
function HungPoster({ poster }: { poster: { id: string; title: string; image: string } }) {
  return (
    <article className="appear grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-14">
      <div className="frame">
        <div className="mat aspect-square w-full">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, decrypted per request */}
          <img src={poster.image} alt={poster.title} className="h-full w-full object-cover" />
        </div>
      </div>
      <div className="lg:sticky lg:top-28 lg:self-start">
        <p className="text-ui font-semibold text-gold">On your wall</p>
        <h2 className="mt-2 font-display text-h1">{poster.title}</h2>
        <p className="mt-3 text-lead text-mist">It&rsquo;s in your Memories now. Sell numbered editions if you like.</p>
        <SellPanel kind="poster" refId={poster.id} suggested={2} />
      </div>
    </article>
  );
}

function Portrait({ portrait, onDecided }: { portrait: NightlyDrafts["portraits"][number]; onDecided: (d: NightlyDrafts) => void }) {
  return (
    <article className="appear grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-14">
      <div className="frame">
        <div className="mat aspect-square w-full">
          <video src={portrait.video} poster={portrait.image} autoPlay muted loop playsInline className="h-full w-full object-cover" />
        </div>
      </div>
      <div className="lg:sticky lg:top-28 lg:self-start">
        <p className="text-ui font-semibold text-gold">Last night&rsquo;s moving portrait</p>
        <h2 className="mt-2 font-display text-h1">{portrait.title ?? "Your dream"}</h2>
        <Decide
          hang="Keep it moving"
          onHang={() => api.decideDraft("portrait", portrait.dreamId, "hang").then(onDecided)}
          onLetGo={() => api.decideDraft("portrait", portrait.dreamId, "let-go").then(onDecided)}
          note="Kept, the painting moves on your wall and on its day page."
        />
      </div>
    </article>
  );
}
