"use client";
// The quieter pictures further down the page. Each plays once, the first time it scrolls into view.
import { DreamPainting, WorldPainting } from "./dream-painting";
import { useInView } from "./use-in-view";

const vars = (v: Record<string, string | number>) => v as React.CSSProperties;

// Private by default: a lock shuts, the enclave's Verified badge appears, and the words turn to ciphertext.
export function Sealed() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      data-on={seen || undefined}
      role="img"
      aria-label="A padlock closes, a Verified badge appears, and the dream's words turn into ciphertext."
      className="ls-seal rounded-md border border-edge bg-[#0b0918]/70 p-6 sm:p-8"
    >
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 24 24" className="h-9 w-9 text-gold" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path className="ls-shackle" d="M8 11V7.6a4 4 0 0 1 8 0V11" />
          <rect x="5" y="11" width="14" height="10" rx="2" fill="rgb(240 200 120 / 0.12)" />
          <path d="M12 14.8v2.6" />
        </svg>
        <span className="ls-verified inline-flex items-center gap-1.5 rounded border border-ok/50 px-2 py-0.5 text-[13px] text-ok">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
          </svg>
          Verified
        </span>
      </div>
      <p className="ls-cipher relative mt-6 grid">
        <span className="ls-plain font-display text-lg italic leading-snug text-paper [grid-area:1/1] sm:text-xl">
          &ldquo;I was flying over my old school, and the roof turned into the sea.&rdquo;
        </span>
        <span className="ls-crypt break-all font-mono text-[15px] leading-relaxed text-gold/90 [grid-area:1/1]">
          UKEeJ3aKvtHHQ7ROe8ur4x/oFC2Hm32YGZbaTBeHJAxZkUqVO2U9ZmADe23c
        </span>
        <span className="ls-sweep" />
      </p>
    </div>
  );
}

// Every piece is a name: the edition's ENS name types itself under the painting it unlocks.
export function NamePlate() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} data-on={seen || undefined} className="ls-name flex flex-col items-center">
      <div className="frame w-36 sm:w-44" style={{ boxShadow: "0 0 34px -6px var(--wonder), 0 10px 30px rgb(0 0 0 / .55)" }}>
        <div className="mat aspect-square w-full">
          <DreamPainting />
        </div>
      </div>
      <p className="mt-7 max-w-full font-mono text-[clamp(13px,3.7vw,19px)]">
        <span className="ls-type">
          <span className="text-gold">sea-roof-3</span>
          <span className="text-paper">.mithran</span>
          <span className="text-mist">.dream-scape.eth</span>
        </span>
      </p>
      <p className="ls-edition mt-2 text-sm text-dim">Edition 3 of 10</p>
    </div>
  );
}

// A family visit: the door opens, a ring counts down ten minutes, and the door shuts by itself.
export function VisitDoor() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const arch = "M38 196 L 38 82 A 42 42 0 0 1 122 82 L 122 196 Z";
  return (
    <div
      ref={ref}
      data-on={seen || undefined}
      role="img"
      aria-label="A gallery door opens onto a lit room where a visitor looks at a painting. A ring counts down from ten minutes, and when it runs out the door closes by itself."
      className="ls-visit flex items-end justify-center gap-6 sm:gap-10"
    >
      <svg viewBox="0 0 160 214" className="w-40 sm:w-48">
        <defs>
          <linearGradient id="ls-room" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f6d999" />
            <stop offset="1" stopColor="#b8862e" />
          </linearGradient>
        </defs>
        <path d={arch} fill="#0b0918" />
        <g className="ls-lit">
          <path d={arch} fill="url(#ls-room)" />
          <rect x="66" y="98" width="28" height="23" fill="#2f5fb8" stroke="#8f611c" strokeWidth="3" />
          <path d="M68 117 C 74 112, 80 118, 92 113" stroke="#9cc0fa" strokeWidth="2" fill="none" />
          <circle cx="94" cy="146" r="7.5" fill="#2a2348" />
          <path d="M81 196 C 81 170, 85 156, 94 156 C 103 156, 107 170, 107 196 Z" fill="#2a2348" />
          <path d="M38 196 L 122 196 L 158 212 L 2 212 Z" fill="var(--gold)" opacity="0.16" />
        </g>
        <path d="M0 196 L 160 196" stroke="var(--edge)" strokeWidth="2" />
        <path d="M31 196 L 31 82 A 49 49 0 0 1 129 82 L 129 196" fill="none" stroke="var(--line)" strokeWidth="3" />
        <g className="ls-leaf">
          <path d={arch} fill="var(--card)" stroke="var(--line)" strokeWidth="2" />
          <path d="M49 186 L 49 130 L 111 130 L 111 186 Z M49 120 L 49 88 A 31 31 0 0 1 111 88 L 111 120 Z" fill="none" stroke="var(--edge)" strokeWidth="2" />
          <circle cx="112" cy="152" r="3.4" fill="var(--gold)" />
        </g>
      </svg>

      <div className="relative mb-24 w-24 shrink-0 sm:mb-28 sm:w-28">
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

// The World Dream: themes drift in; any that fewer than five dreamers share stay out, faint, and the rest become one painting.
// x and y place each theme on a wide stage; mx and my on a phone, where the stage is taller.
const THEMES: { word: string; n: number; x: number; y: number; mx: number; my: number }[] = [
  { word: "water", n: 41, x: 15, y: 8, mx: 22, my: 7 },
  { word: "flight", n: 23, x: 85, y: 8, mx: 78, my: 7 },
  { word: "the 8:15 train", n: 3, x: 16, y: 27, mx: 25, my: 16 },
  { word: "a red bicycle", n: 2, x: 84, y: 27, mx: 75, my: 16 },
  { word: "school", n: 12, x: 14, y: 46, mx: 12, my: 46 },
  { word: "falling", n: 9, x: 86, y: 46, mx: 88, my: 46 },
  { word: "teeth", n: 6, x: 33, y: 56, mx: 22, my: 80 },
  { word: "my cousin's wedding", n: 1, x: 67, y: 56, mx: 63, my: 80 },
];
const KEPT = THEMES.filter((t) => t.n >= 5).map((t) => t.word);

export function WorldDream() {
  const [ref, seen] = useInView<HTMLElement>();
  return (
    <figure ref={ref} data-on={seen || undefined} className="ls-world-wrap">
      <div
        className="ls-world"
        role="img"
        aria-label="Theme words from many dreamers drift together. Water, flight, school, falling and teeth, each shared by five or more dreamers, gather into one painting of a night sea with a flock of flyers and a school bell. Themes shared by fewer than five, like a red bicycle, stay out."
      >
        <div className="ls-world-frame frame">
          <div className="mat aspect-square w-full">
            <WorldPainting className="ls-world-paint" />
          </div>
        </div>
        {THEMES.map((t, i) => {
          const counted = t.n >= 5;
          return (
            <span
              key={t.word}
              className={`ls-theme ${counted ? "ls-kept" : "ls-dropped"} font-display`}
              style={vars({ "--x": t.x, "--y": t.y, "--mx": t.mx, "--my": t.my, "--d": `${0.1 + i * 0.07}s`, "--g": `${2 + Math.max(0, KEPT.indexOf(t.word)) * 0.06}s` })}
            >
              {t.word}
              <span className={`ml-[0.35em] font-mono text-[0.62em] ${counted ? "text-gold" : "text-dim"}`}>{t.n}</span>
            </span>
          );
        })}
      </div>
      <figcaption className="ls-world-caption mx-auto mt-6 max-w-md text-center font-display text-lg italic leading-snug text-paper sm:text-xl">
        Yesterday the world dreamed of water, flight and school, and mostly felt wonder.
      </figcaption>
    </figure>
  );
}
