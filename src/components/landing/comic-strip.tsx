"use client";
// A four-panel strip of the same dream, in the app's own comic style: ink line art, one spot colour
// from the dream's feeling, and lettering the app adds itself. The art keeps its top third empty,
// as the real panels do, and the captions and bubbles arrive panel by panel once the strip is in view.
import { Patrick_Hand } from "next/font/google";
import { useInView } from "./use-in-view";

const lettering = Patrick_Hand({ weight: "400", subsets: ["latin"] });

const INK = "#1d1a17";
const SPOT = "#5b92f2"; // wonder
const PAPER = "#fff";

type Panel = { art: React.ReactNode; caption?: string; bubble?: { text: string; side: "left" | "right" } };

// A row of roof tiles, then the same row gone to water.
const tiles = (x0: number, x1: number, y: number) => `M${x0} ${y}` + " q 3 4.5 6 0".repeat(Math.ceil((x1 - x0) / 6));
const ripples = (x0: number, x1: number, y: number) => `M${x0} ${y}` + " q 1.5 -2.4 3 0 t 3 0".repeat(Math.ceil((x1 - x0) / 6));
const sea = (y: number, step: number) => `M0 ${y} q ${step / 2} -${step * 0.3} ${step} 0` + ` t ${step} 0`.repeat(Math.ceil(100 / step)) + " L 104 100 L 0 100 Z";

const PANELS: Panel[] = [
  {
    caption: "I was flying over my old school.",
    art: (
      <>
        <path d="M3 93 C 30 92, 70 94, 97 92.5" />
        <path d="M23 92.5 L 23 66.5 M 77 66.5 L 77 92.5" />
        <path d="M46 52 L 46 43 L 54 43 L 54 52" fill={PAPER} />
        <path d="M44.5 43.2 L 50 37.5 L 55.5 43.2 Z" fill={PAPER} />
        <path d="M48.2 48.6 Q 50 44.6 51.8 48.6 Z" fill={INK} />
        <path d="M18 67 L 50 50 L 82 67 Z" fill={PAPER} />
        <circle cx="50" cy="59.6" r="3.4" fill={PAPER} />
        <path d="M50 59.6 L 50 57.4 M 50 59.6 L 51.8 60.4" strokeWidth="0.9" />
        <path d="M60 62.6 L 64 60.6 M 64.5 64.6 L 70.5 61.4 M 69 66.4 L 76 62.8" strokeWidth="0.8" />
        {[27, 36, 58.5, 67.5].flatMap((x) =>
          [71, 81].map((y) => (
            <g key={`${x}-${y}`}>
              <rect x={x} y={y} width="5.5" height="5.5" fill={PAPER} />
              <path d={`M${x + 2.75} ${y} L ${x + 2.75} ${y + 5.5}`} strokeWidth="0.8" />
            </g>
          )),
        )}
        <path d="M45.5 92.5 L 45.5 81 Q 50 76.5 54.5 81 L 54.5 92.5" fill={PAPER} />
        <path d="M28 44 q 1.8 -2 3.6 0 q 1.8 -2 3.6 0 M37 38.6 q 1.3 -1.5 2.6 0 q 1.3 -1.5 2.6 0" strokeWidth="1" />
        <path d="M53 42 L 57.5 42 M 54 46.5 L 58 46.5" strokeWidth="0.8" />
        <path d="M76.6 40.6 C 72 37.5, 68 39.5, 63 37.6" stroke={SPOT} strokeWidth="2" />
        <path d="M77.2 41.4 L 67 45 M 76 42 L 84 38.6 M 67 45 L 60 45.4 M 67 45 L 61 48" />
        <circle cx="79" cy="40" r="2.3" fill={PAPER} />
      </>
    ),
  },
  {
    bubble: { text: "Huh. Is the roof wet?", side: "left" },
    art: (
      <>
        <path d="M58 64 C 53 72, 50 84, 56 100 L 102 100 L 102 57 Z" fill={SPOT} fillOpacity="0.22" stroke="none" />
        <path d="M-2 61 L 102 53" />
        <path d="M-2 64.6 L 102 56.6" strokeWidth="0.9" />
        {[71, 79, 87, 95].map((y, i) => (
          <path key={y} d={tiles(-2 + (i % 2) * 3, 50, y)} strokeWidth="1.1" />
        ))}
        {[69, 77, 85, 93].map((y) => (
          <path key={y} d={ripples(54, 102, y)} stroke={SPOT} strokeWidth="1.6" />
        ))}
        <path d="M70 66 q -2 4 0 5 q 2 -1 0 -5 Z" fill={SPOT} stroke="none" />
        <path d="M22.6 44.4 C 18 41, 13 43, 7 40.6" stroke={SPOT} strokeWidth="2.2" />
        <path d="M22.4 45.6 L 9 49.5 M 21 47 L 29 51.5 M 9 49.5 L 1 48.8 M 9 49.5 L 2 53" />
        <circle cx="25" cy="43" r="3.6" fill={PAPER} />
        <circle cx="26.7" cy="44" r="0.65" fill={INK} stroke="none" />
        <path d="M30.5 38 L 32.5 35.8 M 31.8 41.4 L 34.8 40.6" strokeWidth="0.9" />
      </>
    ),
  },
  {
    caption: "Then the roof turned into the sea.",
    art: (
      <>
        <path d="M24 100 L 24 77 M 76 77 L 76 100" />
        <rect x="31" y="84" width="6" height="6" fill={PAPER} />
        <rect x="63" y="84" width="6" height="6" fill={PAPER} />
        <path d="M44 57 L 44 45 L 52 45 L 52 57" fill={PAPER} />
        <path d="M42.5 45.2 L 48 39.5 L 53.5 45.2 Z" fill={PAPER} />
        <path d="M46.2 51 Q 48 47 49.8 51 Z" fill={INK} />
        <path d="M14 80 C 20 66, 36 55, 56 53 C 72 52, 84 59, 83 67 C 82 73, 73 74, 71 68.5 C 69.5 64.5, 74 62.5, 76 65 L 90 80 Z" fill={SPOT} />
        <path d="M22 74 C 30 66, 40 61, 50 59 M 32 78 C 40 72, 48 68, 58 66" strokeWidth="0.8" />
        <path d={sea(92, 10)} fill={SPOT} />
        <path d="M70 56 Q 73 47 78.5 46.4" strokeWidth="0.8" strokeDasharray="1.4 1.6" />
        <path d="M80 47 Q 85 41 91 45 Q 86 50 80 47 Z M80 47 L 76.6 44 L 76.8 50 Z" fill={PAPER} />
        <circle cx="88" cy="45" r="0.6" fill={INK} stroke="none" />
        <path d="M18.8 41.6 C 15 39, 11.5 40.5, 7 39" stroke={SPOT} strokeWidth="1.8" />
        <path d="M18.6 42.4 L 10 45 M 17.2 43 L 15.4 38.6 M 10 45 L 4.6 44.6 M 10 45 L 5 47.6" />
        <circle cx="20.2" cy="41" r="2" fill={PAPER} />
      </>
    ),
  },
  {
    bubble: { text: "You're late for class. Again.", side: "right" },
    art: (
      <>
        <path d="M23 76 L 23 58 L 39 58 L 39 76" fill={PAPER} />
        <path d="M27.5 70 L 27.5 64.5 Q 31 60.5 34.5 64.5 L 34.5 70" />
        <path d="M29.3 68.4 Q 31 64 32.7 68.4 Z" fill={INK} />
        <path d="M20.5 58.4 L 31 49 L 41.5 58.4 Z" fill={PAPER} />
        <path d="M65 73 C 64 60, 69 52, 75 52 C 81 52, 86 60, 85 73" fill={PAPER} />
        <path d="M65.5 66 L 61 63.5 L 64.6 69 M 84.6 66 L 89 63.5 L 85.4 69" fill={PAPER} />
        <circle cx="71.5" cy="59.5" r="2.9" fill={PAPER} />
        <circle cx="78.5" cy="59.5" r="2.9" fill={PAPER} />
        <path d="M74.4 59.5 L 75.6 59.5 M 72.5 65.5 Q 75 68.5 77.5 65.5" />
        <circle cx="72" cy="60" r="0.75" fill={INK} stroke="none" />
        <circle cx="79" cy="60" r="0.75" fill={INK} stroke="none" />
        <path d="M68 51.4 L 75 48.4 L 82 51.4 L 75 54.4 Z" fill={INK} />
        <path d="M82 51.4 L 83.4 56" strokeWidth="0.9" />
        <path d={sea(71, 12)} fill={SPOT} />
        <path d="M8 84 q 3 -2 6 0 t 6 0 M 48 91 q 3 -2 6 0 t 6 0 M 80 82 q 3 -2 6 0" strokeWidth="0.8" />
        <path d="M29.6 44.2 C 26 45, 23 43.4, 20.4 45.6" stroke={SPOT} strokeWidth="1.8" />
        <path d="M31 44.3 L 31 49.4 M 31 49.4 L 28 53.6 M 31 49.4 L 34 53.2 M 31 46 L 27.6 48.2 M 31 46 L 34.4 48" />
        <circle cx="31" cy="41.6" r="2.8" fill={PAPER} />
        <path d="M35.8 38.4 q -1.2 2.2 0 2.8 q 1.2 -0.6 0 -2.8 Z" fill={SPOT} stroke="none" />
      </>
    ),
  },
];

function Bubble({ text, side }: { text: string; side: "left" | "right" }) {
  return (
    <div className={`ls-bub relative max-w-[80%] ${side === "right" ? "ml-auto origin-bottom-right" : "origin-bottom-left"}`}>
      <p className="rounded-[50%] border-[0.6cqw] bg-white px-[5cqw] py-[3cqw] text-center text-[7.2cqw] uppercase leading-[1.05]" style={{ borderColor: INK }}>
        {text}
      </p>
      <svg viewBox="0 0 20 16" className={`absolute top-[calc(100%-0.7cqw)] w-[7cqw] ${side === "right" ? "right-[28%]" : "left-[28%]"}`} aria-hidden>
        <path d={side === "right" ? "M2 0 L14 15 L13 0" : "M18 0 L6 15 L7 0"} fill="white" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
        <path d={side === "right" ? "M2.6 0 L13 0" : "M7.4 0 L17.4 0"} stroke="white" strokeWidth="2.2" />
      </svg>
    </div>
  );
}

export function ComicStrip() {
  const [ref, seen] = useInView<HTMLElement>();
  return (
    <figure
      ref={ref}
      data-on={seen || undefined}
      className={`${lettering.className} ls-comic rounded-[3px] bg-[#fbf9f4] p-[3%] shadow-[0_18px_50px_rgb(0_0_0/0.45)] md:p-4`}
      style={{ color: INK }}
    >
      <figcaption className="mb-[3%] flex items-end justify-between gap-4 px-[0.5%] md:mb-3">
        <span className="relative text-[clamp(22px,5vw,34px)] uppercase leading-none">
          The Sea Roof
          <svg viewBox="0 0 200 8" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-2 w-full" aria-hidden>
            <path className="ls-underline" pathLength={1} d="M2 5 C60 1 120 7 198 3" stroke={SPOT} strokeWidth="4" fill="none" strokeLinecap="round" />
          </svg>
        </span>
        <span className="pb-0.5 text-[clamp(13px,2.6vw,17px)] opacity-70">Episode 1</span>
      </figcaption>

      <div className="grid grid-cols-2 gap-[2.4%] md:grid-cols-4 md:gap-3">
        {PANELS.map((p, i) => (
          <div key={i} className="@container relative aspect-square overflow-hidden border-[3px] bg-white" style={{ borderColor: INK, "--p": i } as React.CSSProperties}>
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" fill="none" stroke={INK} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {p.art}
            </svg>
            <div className="absolute inset-x-0 top-0 flex flex-col gap-[2.5cqw] p-[3cqw]">
              {p.caption && (
                <p className="ls-cap -ml-[3cqw] -mt-[3cqw] max-w-[74%] self-start border-b-[0.6cqw] border-r-[0.6cqw] bg-[#fff1c1] px-[3cqw] py-[2cqw] text-[7cqw] uppercase leading-[1.08]" style={{ borderColor: INK }}>
                  {p.caption}
                </p>
              )}
              {p.bubble && <Bubble {...p.bubble} />}
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}
