"use client";
// The quieter pictures further down the page. Each plays once, the first time it scrolls into view.
// The paintings and receipts are real output from the sample dream, made by scripts/landing-art.ts.
import made from "../../../public/landing/made.json";
import { PaintedReveal } from "./painted-reveal";
import { useInView } from "./use-in-view";

const vars = (v: Record<string, string | number>) => v as React.CSSProperties;

const STEP: Record<string, string> = { transcribe: "Heard your voice", tag: "Read your words", portrait: "Painted the picture" };

// Private by default: the 0G receipts for the painting at the top of the page, step by step.
export function Sealed() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const steps = made.dream.traces.filter((t) => STEP[t.step]);
  return (
    <div ref={ref} data-on={seen || undefined} className="ls-seal panel p-6 sm:p-8">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 24 24" className="h-9 w-9 shrink-0 text-gold" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path className="ls-shackle" d="M8 11V7.6a4 4 0 0 1 8 0V11" />
          <rect x="5" y="11" width="14" height="10" rx="2" fill="rgb(240 200 120 / 0.12)" />
          <path d="M12 14.8v2.6" />
        </svg>
        <p className="font-display text-xl font-semibold text-paper">How the painting above was made</p>
      </div>
      <ol className="mt-6 space-y-4">
        {steps.map((t, i) => (
          <li key={t.step} className="ls-receipt border-t border-edge pt-4" style={vars({ "--d": `${0.5 + i * 0.35}s` })}>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <span className="text-[17px] font-medium text-paper">{STEP[t.step]}</span>
              {t.tee_verified === 1 ? <Badge>Verified in an enclave</Badge> : t.e2ee === "sealed" ? <Badge>Sealed end to end</Badge> : null}
            </div>
            <p className="mt-1.5 break-all font-mono text-sm text-mist">
              {t.model} <span className="text-dim">request {t.request_id?.slice(0, 8)}</span>
            </p>
          </li>
        ))}
        <li className="ls-receipt border-t border-edge pt-4 text-[15px] text-mist" style={vars({ "--d": `${0.5 + steps.length * 0.35}s` })}>
          Then it&rsquo;s encrypted onto 0G Storage under your key and recorded on 0G Chain.
        </li>
      </ol>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-ok/50 px-2.5 py-0.5 text-[13px] text-ok">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
      </svg>
      {children}
    </span>
  );
}

// The market's rule for an edition's name: the title as a slug, cut at a whole word, then the number.
function editionPrefix(title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (slug.length <= 24 ? slug : slug.slice(0, 25).replace(/-[^-]*$/, "")) || "piece";
}

const EDITION = `${editionPrefix(made.dream.title)}-3`;
const NAME = `${EDITION}.mithran.dream-scape.eth`;

// Every piece is a name: the edition's ENS name types itself under the painting it unlocks.
export function NamePlate() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} data-on={seen || undefined} className="ls-name flex flex-col items-center">
      <div className="frame w-52 sm:w-64" style={{ boxShadow: "0 0 34px -6px var(--wonder), 0 10px 30px rgb(0 0 0 / .55)" }}>
        <div className="mat aspect-square w-full">
          <PaintedReveal src="/landing/dream.jpg" label={`${made.dream.title}, the painting from the sample dream`} />
        </div>
      </div>
      <p className="mt-7 max-w-full font-mono text-[clamp(11px,2.9vw,19px)]">
        <span className="ls-type" style={vars({ "--n": NAME.length })}>
          <span className="text-gold">{EDITION}</span>
          <span className="text-paper">.mithran</span>
          <span className="text-mist">.dream-scape.eth</span>
        </span>
      </p>
      <p className="ls-edition mt-2 text-sm text-dim">Edition 3 of 10</p>
    </div>
  );
}

// A family visit, as the dreamer sees it: someone knocks with their pass, you let them in, and a
// ring counts down ten minutes until the door shuts by itself.
export function VisitDoor() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      data-on={seen || undefined}
      role="img"
      aria-label="A knock on the gallery door: Amma is at your door with a pass. You let them in for ten minutes, and a ring counts down to when the door shuts by itself."
      className="ls-visit flex flex-col items-center gap-8 sm:flex-row sm:justify-center"
    >
      <div aria-hidden className="ls-knock w-full max-w-sm rounded-[1.25rem] border border-gold/60 bg-card/85 px-5 py-5 shadow-[0_18px_50px_rgb(0_0_0/0.4)]">
        <p className="flex items-center gap-2 font-display text-xl font-semibold text-paper">
          <span className="breathe h-2.5 w-2.5 shrink-0 rounded-full bg-gold" />
          Amma is at your door
        </p>
        <p className="mt-1 text-[15px] text-mist">Their pass shows your whole gallery.</p>
        <p className="mt-1 break-all font-mono text-[13px] text-dim">k7f2q.passes.mithran.dream-scape.eth</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="ls-letin btn btn-gold">Let in for 10 minutes</span>
          <span className="btn btn-line">Let in for 1 hour</span>
        </div>
      </div>

      <div aria-hidden className="relative w-28 shrink-0 sm:w-32">
        <svg viewBox="0 0 100 100" className="block w-full -rotate-90">
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--edge)" strokeWidth="5" />
          <circle className="ls-countdown" cx="50" cy="50" r="44" pathLength={1} fill="none" stroke="var(--gold)" strokeWidth="5" />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="ls-clock block h-[1.25em] overflow-hidden font-mono text-lg leading-[1.25em] text-paper sm:text-xl">
            <span className="ls-clock-strip block">
              {Array.from({ length: 11 }, (_, i) => (
                <span key={i} className="block text-center">
                  {10 - i}:00
                </span>
              ))}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

// The World Dream from the sample night: the painting, and beside it what the night dreamed of, with
// the real counts. A theme fewer than five dreamers shared stays out of the painting.
const counts = made.world.counts;
const shared = counts.themes.map((t) => t.theme);
const ROWS = [
  ...counts.themes.map((t) => ({ theme: t.theme, dreamers: t.dreamers, kept: true })),
  ...made.dream.tags.themes.filter((t) => !shared.includes(t)).map((theme) => ({ theme, dreamers: 1, kept: false })),
];
const list = shared.length > 1 ? `${shared.slice(0, -1).join(", ")} and ${shared[shared.length - 1]}` : shared[0];

export function WorldDream() {
  const [ref, seen] = useInView<HTMLElement>();
  return (
    <figure ref={ref} data-on={seen || undefined} className="ls-world-wrap grid items-center gap-8 md:grid-cols-2 md:gap-12">
      <div className="ls-world-frame frame mx-auto w-full max-w-sm">
        <div className="ls-world-paint mat aspect-square w-full">
          <PaintedReveal src="/landing/world.jpg" label={`The World Dream from a sample night: ${list}, painted as figures drifting over calm water`} />
        </div>
      </div>
      <div className="panel p-6 sm:p-8">
        <p className="font-display text-xl font-semibold text-paper">What it dreamed of</p>
        <ul className="mt-5 space-y-4">
          {ROWS.map((r, i) => (
            <li key={r.theme} className={r.kept ? "" : "opacity-60"}>
              <div className="flex items-baseline justify-between gap-4 text-[16px]">
                <span className="capitalize text-paper">{r.theme}</span>
                <span className="font-mono text-sm text-mist">
                  {r.dreamers} {r.dreamers === 1 ? "dreamer" : "dreamers"}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-edge">
                <div
                  className="ls-bar h-full rounded-full"
                  style={vars({ width: `${(r.dreamers / counts.dreamers) * 100}%`, background: r.kept ? "var(--gold)" : "var(--line)", "--d": `${0.4 + i * 0.15}s` })}
                />
              </div>
              {!r.kept && <p className="mt-1.5 text-sm text-dim">Fewer than five dreamers had it, so it stays out of the painting.</p>}
            </li>
          ))}
        </ul>
        <figcaption className="ls-world-caption mt-6 border-t border-edge pt-5 font-display text-lg italic leading-snug text-paper">
          From a sample night: {counts.dreamers} dreamers dreamed of {list}, and mostly felt {counts.feeling}.
        </figcaption>
      </div>
    </figure>
  );
}
