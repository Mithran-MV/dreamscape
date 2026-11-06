"use client";
// The top of the wall: this week's stars, today's one-tap morning, and Memories, a row of story cards
// like a photo app's. "On this morning" brings an older dream back; at 7, 21, 30 and 100 mornings kept
// a reveal made from the dreamer's own dreams joins the row. Each card opens as a story to tap through.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, type Memory, type Mornings, type Star } from "@/lib/api";
import { chipColor, feelingColor, FEELINGS } from "@/components/ui";
import "./memories.css";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const STAR = "M12 2.6l2.7 6.1 6.6.6-5 4.4 1.5 6.5L12 16.8l-5.8 3.4 1.5-6.5-5-4.4 6.6-.6z";

export function MorningsAndMemories() {
  const [state, setState] = useState<Mornings | null>(null);
  const [open, setOpen] = useState<Memory | null>(null);
  const [lit, setLit] = useState(false);
  useEffect(() => {
    api.mornings().then(setState, () => setState(null));
  }, []);
  const keep = useCallback((kind: "feeling" | "nothing", feeling?: string) => {
    api.keepMorning(kind, feeling).then((s) => {
      setState(s);
      setLit(true);
    });
  }, []);
  if (!state) return null;
  return (
    <>
      <WeekStars state={state} justLit={lit} onKeep={keep} />
      <MemoriesRow state={state} onOpen={setOpen} />
      {open && <StoryViewer memory={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function StarMark({ star, today, justLit }: { star: Star; today: number; justLit: boolean }) {
  const kept = star.kind !== null;
  const isToday = star.day === today;
  const past = star.day < today;
  const color = star.feeling ? feelingColor(star.feeling) : "var(--gold)";
  if (kept) {
    return (
      <span className={`ms-star ms-lit ${isToday && justLit ? "ms-pop" : ""}`} style={{ "--glow": color } as React.CSSProperties}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d={STAR} fill="var(--gold)" />
        </svg>
        {isToday && justLit && <span className="ms-burst" aria-hidden />}
      </span>
    );
  }
  if (isToday)
    return (
      <span className="ms-star ms-waiting">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d={STAR} fill="none" stroke="var(--gold)" strokeWidth="1.4" strokeDasharray="2.2 2" />
        </svg>
      </span>
    );
  // A morning not kept is a rest night under soft cloud; a morning still to come is a faint dot.
  return past ? (
    <span className="ms-star ms-rest">
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M7 17.5h10a3.6 3.6 0 0 0 .5-7.2A5 5 0 0 0 8 9.6a3.9 3.9 0 0 0-1 7.9z" fill="var(--line)" opacity="0.7" />
      </svg>
    </span>
  ) : (
    <span className="ms-star ms-later">
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="2.2" fill="var(--line)" />
      </svg>
    </span>
  );
}

function WeekStars({ state, justLit, onKeep }: { state: Mornings; justLit: boolean; onKeep: (kind: "feeling" | "nothing", feeling?: string) => void }) {
  const [feelings, setFeelings] = useState(false);
  const lit = state.week.filter((s) => s.kind !== null).length;
  const complete = lit >= 5;
  return (
    <section className="panel mt-8 p-6 md:p-7" aria-labelledby="mornings">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 id="mornings" className="font-display text-title">
            {complete ? "This week's constellation is complete" : state.keptToday ? "Today's star is lit" : "Light today's star"}
          </h2>
          <ol className="mt-4 flex items-end gap-2 sm:gap-4" aria-label={`${lit} of 7 mornings kept this week`}>
            {state.week.map((s, i) => (
              <li key={s.day} className="flex flex-col items-center gap-1.5">
                <StarMark star={s} today={state.today} justLit={justLit} />
                <span className={`text-meta ${s.day === state.today ? "font-semibold text-gold" : "text-dim"}`}>{DAY_LETTERS[i]}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-ui text-mist">
            <span className="font-semibold text-paper">{state.kept}</span> {state.kept === 1 ? "morning" : "mornings"} kept.
            {state.next && (
              <>
                {" "}
                <span className="text-gold">{state.next.title}</span> in {state.next.left} more.
              </>
            )}
          </p>
        </div>

        {state.keptToday ? (
          <p className="max-w-xs font-display text-lead italic text-paper" aria-live="polite">
            {justLit ? "Star lit. See you tomorrow morning." : "See you tomorrow morning."}
          </p>
        ) : (
          <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[22rem]">
            <Link href="/tell" className="btn btn-gold btn-lg justify-center">
              I remember a dream
            </Link>
            {feelings ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="How did the night feel?">
                {FEELINGS.map((f) => (
                  <button key={f.key} type="button" className="chip" style={chipColor(f.color)} onClick={() => onKeep("feeling", f.key)}>
                    <span className="chip-dot" aria-hidden />
                    {f.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button type="button" className="btn btn-line justify-center" onClick={() => setFeelings(true)}>
                  Just a feeling
                </button>
                <button type="button" className="btn btn-line justify-center" onClick={() => onKeep("nothing")}>
                  Nothing this time
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function MemoriesRow({ state, onOpen }: { state: Mornings; onOpen: (m: Memory) => void }) {
  if (!state.memories.length && !state.next) return null;
  return (
    <section className="mt-8" aria-labelledby="memories">
      <h2 id="memories" className="font-display text-title">
        Memories
      </h2>
      <ul className="ms-row mt-4 flex gap-4 overflow-x-auto pb-2">
        {state.memories.map((m) => (
          <li key={m.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onOpen(m)}
              className={`ms-card press relative block h-60 w-44 overflow-hidden rounded-2xl text-left ${m.kind === "this-morning" ? "" : "ms-spot"}`}
              style={{ "--glow": feelingColor(m.feeling) } as React.CSSProperties}
            >
              {m.cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- private, decrypted per request
                <img src={m.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span className="ms-painted absolute inset-0" />
              )}
              <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 p-3.5">
                <span className="block text-meta font-semibold text-gold">{m.kind === "this-morning" ? "On this morning" : m.subtitle}</span>
                <span className="mt-0.5 block font-display text-[1.15rem] font-semibold leading-tight text-paper">{m.title}</span>
                {m.kind === "this-morning" && <span className="mt-0.5 block truncate text-meta text-mist">{m.subtitle}</span>}
              </span>
            </button>
          </li>
        ))}
        {state.next && (
          <li className="shrink-0">
            <div className="ms-next flex h-60 w-44 flex-col justify-between rounded-2xl p-4">
              <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
                <path d={STAR} fill="none" stroke="var(--gold)" strokeWidth="1.4" />
              </svg>
              <div>
                <p className="font-display text-[1.15rem] font-semibold leading-tight text-paper">{state.next.title}</p>
                <p className="mt-1 text-meta text-mist">
                  in {state.next.left} more {state.next.left === 1 ? "morning" : "mornings"}
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-edge">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(4, ((state.next.at - state.next.left) / state.next.at) * 100)}%` }} />
                </div>
              </div>
            </div>
          </li>
        )}
      </ul>
    </section>
  );
}

const SLIDE_MS = 5500;

// Full-screen story: tap the right side for the next slide, the left for the one before; Escape closes.
function StoryViewer({ memory, onClose }: { memory: Memory; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [held, setHeld] = useState(false);
  const slides = memory.slides;
  const go = useCallback(
    (n: number) => {
      if (n >= slides.length) return onClose();
      setI(Math.max(0, n));
    },
    [slides.length, onClose],
  );
  useEffect(() => {
    if (held) return;
    const t = setTimeout(() => go(i + 1), SLIDE_MS);
    return () => clearTimeout(t);
  }, [i, held, go]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(i + 1);
      if (e.key === "ArrowLeft") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, go, onClose]);

  const s = slides[i];
  const glow = feelingColor(s.feeling ?? memory.feeling);
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/90 p-0 sm:p-6" role="dialog" aria-modal="true" aria-label={memory.title}>
      <div
        className="ms-story relative h-full w-full overflow-hidden bg-ground sm:h-[min(88vh,820px)] sm:w-auto sm:aspect-[9/16] sm:rounded-3xl"
        style={{ "--glow": glow } as React.CSSProperties}
        onPointerDown={() => setHeld(true)}
        onPointerUp={() => setHeld(false)}
        onPointerLeave={() => setHeld(false)}
      >
        {s.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, decrypted per request
          <img key={i} src={s.image} alt="" className="ms-kenburns absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="ms-painted absolute inset-0" />
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/40" />

        <div className="absolute inset-x-0 top-0 flex gap-1.5 p-3 pt-4">
          {slides.map((_, n) => (
            <span key={n} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
              <span className={`block h-full bg-white ${n < i ? "w-full" : n === i ? "ms-progress" : "w-0"}`} style={n === i ? ({ animationDuration: `${SLIDE_MS}ms`, animationPlayState: held ? "paused" : "running" } as React.CSSProperties) : undefined} />
            </span>
          ))}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-8 z-10 grid h-10 w-10 place-items-center rounded-full bg-black/40 text-paper">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>

        <div key={`t${i}`} className={`ms-copy absolute inset-x-0 p-6 sm:p-8 ${s.image ? "bottom-0" : "top-1/2 -translate-y-1/2 text-center"}`}>
          {s.kicker && <p className="text-ui font-semibold text-gold">{s.kicker}</p>}
          {s.title && <p className={`mt-1 font-display font-semibold leading-tight text-paper ${s.image ? "text-h2" : "text-h1"}`}>{s.title}</p>}
          {s.text && <p className="mt-3 font-display text-lead italic text-mist">{s.quote ? <>&ldquo;{s.text}&rdquo;</> : s.text}</p>}
        </div>

        <button type="button" aria-label="Previous" className="absolute inset-y-0 left-0 w-1/3" onClick={() => go(i - 1)} />
        <button type="button" aria-label="Next" className="absolute inset-y-0 right-0 w-2/3" onClick={() => go(i + 1)} />
      </div>
    </div>
  );
}
