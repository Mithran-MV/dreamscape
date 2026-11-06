"use client";
// The moth who keeps the gallery company. Moths fly to light, so this one finds the gold record button.
// Drawn from above: two wings on each side, gold eyespots like the button, and a sleepy face.
// Tap it and it flutters awake for a moment. Pages place it and choreograph it with CSS (see moth.css).
import { useId, useState } from "react";
import "./moth.css";

function Wing({ fore, hind }: { fore: string; hind: string }) {
  return (
    <>
      <path d="M58 47C47 51 33 58 31 69c-1 10 10 13 18 6 6-6 9-15 10-22z" fill={`url(#${hind})`} />
      <circle cx="41" cy="70" r="2.4" fill="var(--paper)" opacity="0.35" />
      <path d="M58 37C46 22 23 12 11 17c-8 4-5 16 3 24 10 9 29 12 44 6z" fill={`url(#${fore})`} stroke="#b4a8ee" strokeOpacity="0.5" strokeWidth="0.8" />
      <path d="M13 19.5c10-4 29 3 42 15.5" fill="none" stroke="#cdc3fa" strokeOpacity="0.45" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="27" cy="31" r="6.6" fill="var(--gold)" />
      <circle cx="27.6" cy="31.6" r="3" fill="#2b2156" />
      <circle cx="25.6" cy="29.4" r="1.1" fill="var(--paper)" />
    </>
  );
}

export function Moth({ className = "" }: { className?: string }) {
  const id = useId();
  const fore = `${id}-fore`;
  const hind = `${id}-hind`;
  const [awake, setAwake] = useState(false);
  return (
    <button
      type="button"
      aria-label="Wake the moth"
      className={`moth ${className}`}
      data-awake={awake || undefined}
      onClick={() => setAwake(true)}
      onAnimationEnd={(e) => {
        if (e.animationName === "moth-flutter") setAwake(false);
      }}
    >
      <svg viewBox="0 0 120 92" aria-hidden className="block h-auto w-full overflow-visible">
        <defs>
          <linearGradient id={fore} x1="1" y1="0.6" x2="0" y2="0.2">
            <stop offset="0" stopColor="#4f4189" />
            <stop offset="1" stopColor="#8d80d8" />
          </linearGradient>
          <linearGradient id={hind} x1="1" y1="0" x2="0.2" y2="1">
            <stop offset="0" stopColor="#8a5a86" />
            <stop offset="1" stopColor="#d08fae" />
          </linearGradient>
        </defs>
        {/* Each wing is three layers: the page's beat, the tap flutter, then the drawing itself. */}
        <g className="moth-wing moth-wing-l">
          <g className="moth-flap">
            <Wing fore={fore} hind={hind} />
          </g>
        </g>
        <g className="moth-wing moth-wing-r">
          <g className="moth-flap">
            <g transform="translate(120 0) scale(-1 1)">
              <Wing fore={fore} hind={hind} />
            </g>
          </g>
        </g>
        <path d="M57.5 24.5C54 16 48 10.5 42.5 9c2.5 4.5 8 10 13 17z" fill="#eadcc0" />
        <path d="M62.5 24.5C66 16 72 10.5 77.5 9c-2.5 4.5-8 10-13 17z" fill="#eadcc0" />
        <ellipse cx="60" cy="60" rx="5.2" ry="12" fill="#e6d6b4" />
        <path d="M55.6 58q4.4 2 8.8 0M56 63q4 2 8 0M57 68q3 1.6 6 0" fill="none" stroke="#c9b48c" strokeWidth="1.2" strokeLinecap="round" />
        <ellipse cx="60" cy="43" rx="7.5" ry="9" fill="#f1e6cf" />
        <circle cx="60" cy="36" r="7.8" fill="#f6eedc" />
        <circle cx="60" cy="30" r="7" fill="#faf4e6" />
        <g className="moth-shut">
          <path d="M55 30.2q2.2 2.2 4.4 0M60.6 30.2q2.2 2.2 4.4 0" fill="none" stroke="#2b2156" strokeWidth="1.3" strokeLinecap="round" />
        </g>
        <g className="moth-open">
          <circle cx="57.2" cy="30.4" r="1.7" fill="#2b2156" />
          <circle cx="62.8" cy="30.4" r="1.7" fill="#2b2156" />
          <circle cx="56.7" cy="29.8" r="0.5" fill="#fff" />
          <circle cx="62.3" cy="29.8" r="0.5" fill="#fff" />
        </g>
        <ellipse cx="54.6" cy="33.4" rx="1.8" ry="1.1" fill="var(--rose)" opacity="0.75" />
        <ellipse cx="65.4" cy="33.4" rx="1.8" ry="1.1" fill="var(--rose)" opacity="0.75" />
        <path d="M58.6 34q1.4 1 2.8 0" fill="none" stroke="#2b2156" strokeWidth="0.9" strokeLinecap="round" />
      </svg>
    </button>
  );
}
