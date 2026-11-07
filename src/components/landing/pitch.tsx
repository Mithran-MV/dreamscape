"use client";
// The landing page's pitch: what vanishes overnight, the morning tap, why you come back, and what's been made so far.
import { Fragment } from "react";
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
