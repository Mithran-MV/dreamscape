"use client";
// The World Dream: one painting a day from what everyone dreamed, and the dreamer's own circle beside it.
// It shows the themes five or more dreamers shared, with their real counts, never anyone's words.
import { useCallback, useEffect, useState } from "react";
import { api, worldImageUrl, type WorldState, type WorldSummary } from "@/lib/api";
import { chipColor, dayLabel, feelingColor, feelingLabel } from "@/components/ui";
import { plainError } from "@/components/messages";
import { useClientValue } from "@/lib/use-client-value";

// The route sends each shared theme with how many dreamers had it and how most of them felt.
type Theme = { theme: string; dreamers: number; feeling: string | null };
type World = WorldSummary & { themes?: Theme[] };

export function WorldView() {
  const [state, setState] = useState<WorldState | null>(null);
  const [tab, setTab] = useState<"world" | "circle">("world");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api.world().then(setState, (e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);
  const act = (action: "join" | "leave" | "paint", c?: string) => {
    setBusy(true);
    setError(null);
    return api
      .worldAction(action, c)
      .then(load, (e) => setError(e.message))
      .finally(() => setBusy(false));
  };

  if (!state) return error ? <p className="mt-8 text-danger">{plainError(error)}</p> : <div className="painting mt-10 aspect-[21/9] rounded-[3px]" aria-hidden />;
  const { circle } = state;
  const showing = tab === "circle" && circle ? circle.latest : state.world;
  const name = tab === "circle" && circle ? circle.name : "The world";
  const short = circle ? circle.needed - circle.today : 0;

  return (
    <>
      {circle && (
        <div className="mt-8 inline-flex rounded-full border border-line bg-card/70 p-1" role="tablist" aria-label="Whose dream">
          {(["world", "circle"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`press rounded-full px-5 py-2 text-ui font-semibold transition-colors duration-150 ${tab === t ? "bg-gold text-gold-ink" : "text-mist hover:text-paper"}`}
            >
              {t === "world" ? "The world" : circle.name}
            </button>
          ))}
        </div>
      )}

      <div role={circle ? "tabpanel" : undefined}>
        <Banner w={showing as World | null} name={name} />
        {showing && <Counts w={showing as World} />}
      </div>

      <section className="panel mt-14 p-6 md:p-7" aria-labelledby="circle">
        <h2 id="circle" className="font-display text-title">
          Your circle
        </h2>
        {circle ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <p className="text-mist">
              You dream with <span className="font-semibold text-paper">{circle.name}</span>. {circle.today} of {circle.needed} dreamers so far today.
              {circle.today < circle.needed && (
                <span className="block text-ui text-dim">
                  It can be painted once {short} more {short === 1 ? "person dreams" : "people dream"} today.
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {circle.today >= circle.needed && (
                <button onClick={() => act("paint")} disabled={busy} className="btn btn-gold">
                  Paint {circle.name}&rsquo;s dream now
                </button>
              )}
              <button onClick={() => act("leave")} disabled={busy} className="btn btn-line">
                Leave the circle
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-2 max-w-[60ch] text-mist">A circle is a smaller World Dream for people you know, like a team or a meetup. Everyone who joins with the same code dreams into one painting.</p>
            <form
              className="mt-4 flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                act("join", code);
              }}
            >
              <label htmlFor="circle-code" className="sr-only">
                Circle code
              </label>
              <input id="circle-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Circle code, like ethglobal-mumbai" className="field max-w-xs flex-1" />
              <button disabled={busy} className="btn btn-gold">
                Join a circle
              </button>
            </form>
          </>
        )}
        {error && <p className="mt-3 text-ui text-danger">{plainError(error)}</p>}
      </section>
    </>
  );
}

// The world is painted at 23:30 UTC; say when that is where the reader lives.
const paintedAt = () => new Date(Date.UTC(2026, 0, 1, 23, 30)).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function Banner({ w, name }: { w: World | null; name: string }) {
  const at = useClientValue(paintedAt, "23:30 UTC");
  if (!w) {
    return (
      <div className="frame mt-6">
        <div className="mat painting grid aspect-[16/9] w-full place-items-center p-6 text-center md:aspect-[3/1]">
          <p className="font-display text-title italic text-mist">{name === "The world" ? `We paint the first World Dream at ${at}.` : `${name} hasn’t been painted yet.`}</p>
        </div>
      </div>
    );
  }
  return (
    <figure className="frame frame-lit mt-6" style={{ "--glow": feelingColor(w.feeling) } as React.CSSProperties}>
      <div className="mat relative aspect-[4/5] w-full sm:aspect-[16/9] md:aspect-[21/9]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={worldImageUrl(w.id)} alt={`The World Dream for ${dayLabel(w.day)}`} className="absolute inset-0 h-full w-full object-cover" />
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-5 pb-6 pt-24 md:px-10 md:pb-9">
          <p className="text-ui font-semibold text-gold">
            {name}, {dayLabel(w.day)}. {w.dreamers} {w.dreamers === 1 ? "dreamer" : "dreamers"}
          </p>
          <p className="mt-2 max-w-4xl font-display text-title font-semibold leading-snug text-paper md:text-h2">{w.sentence}</p>
        </figcaption>
      </div>
    </figure>
  );
}

function Counts({ w }: { w: World }) {
  const themes = w.themes ?? [];
  const top = Math.max(1, ...themes.map((t) => t.dreamers));
  const felt = feelingLabel(w.feeling);
  return (
    <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-16">
      <section aria-labelledby="dreamed-of">
        <h2 id="dreamed-of" className="font-display text-h2">
          What it dreamed of
        </h2>
        {themes.length > 0 ? (
          <ul className="mt-6 space-y-4">
            {themes.map((t) => (
              <li key={t.theme} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-4">
                <span className="truncate font-semibold capitalize text-paper">{t.theme}</span>
                <span className="h-3 overflow-hidden rounded-full bg-edge" aria-hidden>
                  <span className="block h-full rounded-full" style={{ width: `${(t.dreamers / top) * 100}%`, background: feelingColor(t.feeling) }} />
                </span>
                <span className="text-right text-ui tabular-nums text-mist">
                  {t.dreamers} <span className="sr-only">dreamers</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-mist">No theme reached five dreamers that day.</p>
        )}
        <p className="mt-5 text-meta text-dim">A theme only counts once five dreamers share it. The numbers are dreamers, and no one&rsquo;s words are kept.</p>
      </section>

      <section aria-labelledby="how-felt">
        <h2 id="how-felt" className="font-display text-h2">
          How it felt
        </h2>
        {felt ? (
          <p className="mt-6 inline-flex items-center gap-3 rounded-full border px-5 py-2.5 text-lead font-semibold" style={{ ...chipColor(feelingColor(w.feeling)), borderColor: "var(--c)" }}>
            <span className="chip-dot h-3.5 w-3.5" aria-hidden />
            Mostly {felt.toLowerCase()}
          </p>
        ) : (
          <p className="mt-4 text-mist">Too few dreamers that day to say.</p>
        )}
        {themes.some((t) => t.feeling) && (
          <ul className="mt-6 space-y-2">
            {themes
              .filter((t) => t.feeling)
              .map((t) => (
                <li key={t.theme} className="flex items-center gap-3 text-ui text-mist">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: feelingColor(t.feeling) }} aria-hidden />
                  <span>
                    Most who dreamed of <span className="font-semibold capitalize text-paper">{t.theme}</span> felt {feelingLabel(t.feeling)?.toLowerCase()}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
