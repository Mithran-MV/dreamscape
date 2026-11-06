"use client";
// "I was flying over my old school, and the roof turned into the sea", painted in wonder blue.
// Every mark is a brush stroke: a fat round-capped path that can lay itself down with
// stroke-dashoffset, in the order a painter would work (sky, sea, the school, the flyer, the stars).
import { useId } from "react";

type Stroke = {
  d: string;
  w: number; // brush width, in a 100-unit canvas
  c: string; // paint
  at: number; // seconds after the painting starts
  t?: number; // how long the stroke takes
  o?: number; // how thick the paint is
  b?: string; // a thinner, lighter bristle pass beside the stroke
};

const INK = "#0e1530";
const GOLD = "#f0c878";
const PAPER = "#f5efe3";

const SKY: Stroke[] = [
  { d: "M-6 9 C 22 4, 58 14, 106 7", w: 18, c: "#1b2b5e", b: "#2a3f7f", at: 0, t: 0.7 },
  { d: "M106 22 C 72 17, 34 27, -6 20", w: 17, c: "#22397a", b: "#30508f", at: 0.12, t: 0.7 },
  { d: "M-6 34 C 28 29, 66 39, 106 32", w: 16, c: "#2b4b95", b: "#3c62ae", at: 0.24, t: 0.7 },
  { d: "M106 46 C 66 42, 30 51, -6 45", w: 14, c: "#3760b0", b: "#4a76c6", at: 0.36, t: 0.7 },
  { d: "M70 17 C 70 9, 84 9, 84 17 C 84 25, 70 25, 70 17", w: 4, c: "#8fb0ec", o: 0.5, at: 0.5, t: 0.5 },
  { d: "M74 17 C 74 13.5, 80 13.5, 80 17 C 80 20.5, 74 20.5, 74 17", w: 5, c: GOLD, at: 0.62, t: 0.4 },
];

const SEA: Stroke[] = [
  { d: "M-6 60 C 14 54, 26 64, 46 58 S 78 53, 106 60", w: 10, c: "#3c6fd0", b: "#6d9cf0", at: 0.55, t: 0.65 },
  { d: "M106 71 C 86 65, 70 75, 50 69 S 20 66, -6 72", w: 10, c: "#5b92f2", b: "#8db4f7", at: 0.67, t: 0.65 },
  { d: "M-6 83 C 20 77, 36 87, 56 81 S 86 76, 106 83", w: 11, c: "#2f5fb8", b: "#4f7fd4", at: 0.79, t: 0.65 },
  { d: "M106 95 C 80 89, 60 99, 40 93 S 10 90, -6 97", w: 12, c: "#1f4590", b: "#3561ad", at: 0.91, t: 0.65 },
];

// The school stands in the water; its roof is a breaking wave.
const SCHOOL: Stroke[] = [
  ...[36, 42.5, 49, 55.5, 62].map((x, i) => ({ d: `M${x} 91 C ${x + 0.7} 82, ${x - 0.7} 74, ${x} 66`, w: 7, c: INK, at: 1 + i * 0.07, t: 0.3 })),
  { d: "M65.6 90 L 65.6 67.5", w: 1.2, c: "#6d9cf0", o: 0.7, at: 1.36, t: 0.25 },
  { d: "M28 68 C 34 58, 44 52, 56 51.5", w: 9, c: "#5b92f2", at: 1.4, t: 0.5 },
  { d: "M30 66 C 34 55, 46 47, 57 47.5 C 64 48, 68 53, 65 57.5 C 62.5 61, 57.5 59, 58.5 55.5", w: 5.5, c: "#a9c6fa", at: 1.5, t: 0.7 },
  { d: "M30 69.5 C 40 66.5, 58 66.5, 71 69.5", w: 4.5, c: "#3c6fd0", at: 1.62, t: 0.4 },
  { d: "M48 57 L 48 45", w: 4.5, c: INK, at: 1.62, t: 0.3 },
  { d: "M45.4 46.4 L 48 41.6 L 50.6 46.4", w: 2, c: INK, at: 1.78, t: 0.25 },
  { d: "M33 60 C 38 52, 47 47.6, 56 47.8 C 61 48, 65 51, 65.4 55", w: 1.7, c: PAPER, o: 0.9, at: 1.85, t: 0.5 },
  { d: "M48 49 l 0 0.1", w: 2.4, c: GOLD, at: 1.95, t: 0.15 },
  ...[
    [39.5, 72],
    [46, 72],
    [52.5, 72],
    [59, 72],
    [39.5, 80],
    [59, 80],
  ].map(([x, y], i) => ({ d: `M${x} ${y} l 0 2.4`, w: 2.2, c: GOLD, o: 0.85, at: 2 + i * 0.04, t: 0.18 })),
  { d: "M49.2 90.5 L 49.2 84", w: 3.2, c: GOLD, o: 0.6, at: 2.1, t: 0.2 },
];

// The dreamer, flying over it all with a gold scarf.
const FLYER: Stroke[] = [
  { d: "M40 27 C 35 28.5, 29 30.5, 24 32", w: 2.9, c: PAPER, at: 2.15, t: 0.3 },
  { d: "M42.6 25.6 l 0.1 0", w: 4.4, c: PAPER, at: 2.22, t: 0.12 },
  { d: "M39 28 L 48 23.6", w: 2, c: PAPER, at: 2.28, t: 0.2 },
  { d: "M24 32 L 15 31.4 M24 32 L 16.4 35.8", w: 2, c: PAPER, at: 2.34, t: 0.25 },
  { d: "M39.4 26.6 C 34 21.4, 27 24, 18.6 19.8", w: 1.8, c: GOLD, at: 2.42, t: 0.35 },
];

const STARS: Stroke[] = [
  [12, 13, 1.8],
  [57, 7, 1.5],
  [90, 31, 1.7],
  [21, 44, 1.4],
  [64, 25, 1.3],
  [5, 28, 1.2],
].map(([x, y, w], i) => ({ d: `M${x} ${y} l 0.1 0`, w, c: PAPER, o: 0.85, at: 2.55 + i * 0.06, t: 0.12 }));

const STROKES = [...SKY, ...SEA, ...SCHOOL, ...FLYER, ...STARS];

// The World Dream: everyone's themes in one picture. A sea at night, a flock of flyers, a school bell on a cliff.
const WORLD: Stroke[] = [
  { d: "M-6 10 C 30 4, 64 16, 106 8", w: 20, c: "#1a2c5c", b: "#25407a", at: 0 },
  { d: "M106 26 C 70 20, 30 30, -6 24", w: 18, c: "#1f3f72", b: "#2b5590", at: 0 },
  { d: "M-6 41 C 30 36, 70 45, 106 39", w: 16, c: "#265a86", b: "#347aa0", at: 0 },
  { d: "M-6 52 C 30 49, 70 54, 106 50", w: 8, c: "#3f8f9a", o: 0.8, at: 0 },
  { d: "M-6 62 C 20 56, 40 66, 60 60 S 90 56, 106 62", w: 11, c: "#2da28c", b: "#5cc4ae", o: 0.85, at: 0 },
  { d: "M106 74 C 80 68, 60 78, 40 72 S 10 70, -6 76", w: 11, c: "#5b92f2", b: "#8db4f7", at: 0 },
  { d: "M-6 87 C 24 81, 44 91, 64 85 S 94 81, 106 88", w: 12, c: "#2f6fa8", b: "#4f8fc4", at: 0 },
  { d: "M106 99 C 80 93, 50 102, 20 96 S 0 96, -6 99", w: 12, c: "#1f4a80", at: 0 },
  { d: "M66 13 C 66 9.5, 72 9.5, 72 13 C 72 16.5, 66 16.5, 66 13", w: 4.5, c: GOLD, at: 0 },
  { d: "M72 62 C 78 50, 92 47, 106 49", w: 11, c: INK, at: 0 },
  { d: "M88 50 L 88 36.5", w: 4, c: INK, at: 0 },
  { d: "M85.6 37.4 L 88 33 L 90.4 37.4", w: 1.8, c: INK, at: 0 },
  { d: "M88 41.6 l 0 0.1", w: 2.2, c: GOLD, at: 0 },
  ...[
    [16, 24],
    [26, 17],
    [34, 28],
    [45, 20],
    [55, 27],
    [22, 34],
    [40, 36],
  ].map(([x, y], i) => ({ d: `M${x} ${y} q 1.6 -1.9 3.2 0 q 1.6 -1.9 3.2 0`, w: 1.2, c: i % 3 ? GOLD : PAPER, at: 0 })),
];

function Painting({ strokes, animate, start, className }: { strokes: Stroke[]; animate: boolean; start: number; className: string }) {
  const brush = `ls-brush-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 100 100" className={`${animate ? "ls-paint " : ""}block h-full w-full ${className}`} aria-hidden>
      <defs>
        {/* Rough, slightly torn edges, as dry paint leaves them. */}
        <filter id={brush} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="7" result="grain" />
          <feDisplacementMap in="SourceGraphic" in2="grain" scale="1.8" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <rect width="100" height="100" fill="#121a3c" className="ls-wash" style={{ "--d": `${start}s` } as React.CSSProperties} />
      <g filter={`url(#${brush})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {strokes.map((s, i) => {
          const timing = { "--d": `${start + s.at}s`, "--t": `${s.t ?? 0.6}s` } as React.CSSProperties;
          return (
            <g key={i}>
              <path d={s.d} pathLength={1} className="ls-stroke" stroke={s.c} strokeWidth={s.w} strokeOpacity={s.o ?? 0.92} style={timing} />
              {s.b && <path d={s.d} pathLength={1} className="ls-stroke" stroke={s.b} strokeWidth={s.w * 0.22} strokeOpacity={0.45} transform={`translate(0 ${s.w * 0.2})`} style={timing} />}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export function DreamPainting({ animate = false, start = 0, className = "" }: { animate?: boolean; start?: number; className?: string }) {
  return <Painting strokes={STROKES} animate={animate} start={start} className={className} />;
}

export function WorldPainting({ className = "" }: { className?: string }) {
  return <Painting strokes={WORLD} animate={false} start={0} className={className} />;
}
