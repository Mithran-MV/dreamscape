"use client";
// A real painting from the pipeline, laid down the way a painter works: broad strokes sweep across
// from the top, each one uncovering the picture beneath, and a last wash fills the gaps.
// The strokes are a mask with roughened edges, so they read as brush rather than a wipe.
// Still, or with reduced motion, it's simply the picture.
import { useId } from "react";

// Nine broad strokes across a 100-unit canvas, alternating direction like a wash.
const STROKES = Array.from({ length: 9 }, (_, i) => {
  const y = 5 + i * 11.4;
  const w = i % 2 ? -3.5 : 3.5;
  return i % 2 === 0 ? `M-10 ${y} C 24 ${y + w}, 66 ${y - w}, 110 ${y + 1.5}` : `M110 ${y} C 72 ${y - w}, 30 ${y + w}, -10 ${y + 1.5}`;
});
const STEP = 0.2;

export function PaintedReveal({ src, label, animate = false, start = 0 }: { src: string; label: string; animate?: boolean; start?: number }) {
  const id = useId();
  const mask = `${id}-mask`;
  const rough = `${id}-rough`;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" role="img" aria-label={label} className="block h-full w-full">
      {animate && (
        <defs>
          <filter id={rough} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="7" />
            <feDisplacementMap in="SourceGraphic" scale="5" />
          </filter>
          <mask id={mask}>
            <g filter={`url(#${rough})`}>
              {STROKES.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  pathLength={1}
                  className="ls-reveal-stroke"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="16"
                  strokeLinecap="round"
                  style={{ "--d": `${start + i * STEP}s` } as React.CSSProperties}
                />
              ))}
            </g>
            <rect className="ls-reveal-wash" width="100" height="100" fill="#fff" style={{ "--d": `${start + STROKES.length * STEP + 0.15}s` } as React.CSSProperties} />
          </mask>
        </defs>
      )}
      <image href={src} width="100" height="100" preserveAspectRatio="xMidYMid slice" mask={animate ? `url(#${mask})` : undefined} />
    </svg>
  );
}
