"use client";
// The landing page's pitch: what vanishes overnight, the morning tap, why you come back, and what's been made so far.
import { Fragment, useState } from "react";
import { ChoiceIcon, STAR } from "../memories";
import { useInView } from "./use-in-view";

const vars = (v: Record<string, string | number>) => v as React.CSSProperties;

const DREAM = "I was skating on a frozen river of stars, and every star I touched became a lit window.";

// Two things vanish while you sleep: the dream's words fade as you read them, and the day's credit runs out.
export function TwoThings() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const words = DREAM.split(" ");
  const last = words.length - 1;
  return (
    <div ref={ref} data-on={seen || undefined} className="ls-fade mt-10 grid gap-5 md:mt-12 md:grid-cols-2">
      <div className="panel flex flex-col gap-6 p-6 sm:p-8">
        <p className="font-display text-[clamp(2.4rem,5vw,3.4rem)] leading-none text-gold italic">By breakfast</p>
        <p className="min-h-[7.5rem] border-l-2 border-line pl-5 font-display text-xl leading-snug text-paper italic">
          {words.map((w, i) => (
            <Fragment key={i}>
              <span className="ls-fade-word" style={vars({ "--o": 1 - (i / last) * 0.85, "--b": `${(i / last) * 3.2}px`, "--d": `${0.3 + i * 0.12}s` })}>
                {i === 0 && "“"}
                {w}
                {i === last && "”"}
              </span>{" "}
            </Fragment>
          ))}
        </p>
        <div>
          <h3 className="text-xl font-semibold text-paper">Your dream</h3>
          <p className="mt-1.5 text-[17px] leading-relaxed text-mist">You wake up inside a whole world. An hour later you can&rsquo;t find it.</p>
        </div>
      </div>
      <div className="panel flex flex-col gap-6 p-6 sm:p-8">
        <p className="font-mono text-[clamp(2.2rem,4.6vw,3.2rem)] leading-none text-gold">00:00 UTC</p>
        <div className="flex min-h-[7.5rem] flex-col justify-center gap-3">
          <div className="flex justify-between text-sm">
            <span className="font-semibold text-gold">Spent today</span>
            <span className="text-mist">Expires tonight</span>
          </div>
          <div className="ls-credit relative h-6 overflow-hidden rounded-full">
            <span className="ls-credit-spent absolute inset-y-0 left-0 w-[30%] rounded-full bg-gold" />
          </div>
          <p className="text-sm text-dim">Today&rsquo;s iAI credit on 0G</p>
        </div>
        <div>
          <h3 className="text-xl font-semibold text-paper">Your 0G credit</h3>
          <p className="mt-1.5 text-[17px] leading-relaxed text-mist">It resets every night at midnight UTC. Whatever you didn&rsquo;t spend is gone.</p>
        </div>
      </div>
    </div>
  );
}

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const TODAY = 5;
type Pick = "dream" | "feeling" | "nothing";
const LIT: Record<Pick, string> = {
  dream: "Your dream lit today's star.",
  feeling: "A calm night lit today's star.",
  nothing: "You showed up, and that counts.",
};
const CHOICES: { kind: Pick; title: string; hint: string }[] = [
  { kind: "dream", title: "I remember a dream", hint: "Hold the gold button and tell it." },
  { kind: "feeling", title: "Just a feeling", hint: "Tap a colour: wonder, calm, joy and so on." },
  { kind: "nothing", title: "Nothing this time", hint: "Still counts. You showed up." },
];

// The app's morning card, to try: any of the three lights today's star.
export function MorningPick() {
  const [lit, setLit] = useState<Pick | null>(null);
  const kept = lit ? 2 : 1;
  return (
    <div className="panel mt-10 p-6 md:mt-12 md:p-8">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h3 className="font-display text-title">{lit ? "Today's star is lit" : "Light today's star"}</h3>
          <p className="mt-1.5 max-w-md text-ui text-mist">Every morning you open the app, you light one star. You don&rsquo;t need a dream to do it.</p>
          <ol className="mt-5 flex items-end gap-2 sm:gap-4" aria-label={`${kept} of 7 mornings kept this week`}>
            {DAYS.map((d, i) => (
              <li key={i} className="flex flex-col items-center gap-1.5">
                <DayMark i={i} lit={lit !== null} />
                <span className={`text-meta ${i === TODAY ? "font-semibold text-gold" : "text-dim"}`}>{d}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-ui text-mist">
            <span className="font-semibold text-paper">{kept}</span> mornings kept. <span className="text-gold">Your first pattern</span> in {7 - kept} more.
          </p>
          <p className="mt-1 text-ui text-mist">{5 - kept} more stars complete this week&rsquo;s constellation.</p>
        </div>
        {lit ? (
          <p className="max-w-xs font-display text-lead text-paper italic" aria-live="polite">
            {LIT[lit]}
            <span className="mt-1 block text-ui text-mist not-italic">See you tomorrow morning.</span>
          </p>
        ) : (
          <div className="flex w-full flex-col gap-2.5 lg:w-[26rem]">
            {CHOICES.map((c) => (
              <button key={c.kind} type="button" className={`ms-choice ${c.kind === "dream" ? "ms-choice-gold" : ""}`} onClick={() => setLit(c.kind)}>
                <ChoiceIcon kind={c.kind} />
                <span>
                  <span className="ms-choice-title">{c.title}</span>
                  <span className="ms-choice-hint">{c.hint}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Monday to Thursday rested, Friday lit, Saturday is today, Sunday still to come.
function DayMark({ i, lit }: { i: number; lit: boolean }) {
  if (i === 4 || (i === TODAY && lit))
    return (
      <span className={`ms-star ms-lit ${i === TODAY ? "ms-pop" : ""}`} style={vars({ "--glow": "var(--gold)" })}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d={STAR} fill="var(--gold)" />
        </svg>
        {i === TODAY && <span className="ms-burst" aria-hidden />}
      </span>
    );
  if (i === TODAY)
    return (
      <span className="ms-star ms-waiting">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d={STAR} fill="none" stroke="var(--gold)" strokeWidth="1.4" strokeDasharray="2.2 2" />
        </svg>
      </span>
    );
  return i < TODAY ? (
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
