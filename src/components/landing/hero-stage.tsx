"use client";
// The hero: a dream told aloud becomes a painting. The gold record button listens, the spoken words
// drift up and gather into a gilt frame, and the painting lays itself down inside it, stroke by stroke.
// Plays once on load (about seven seconds) and settles. With reduced motion it shows the last frame.
import { DreamPainting } from "./dream-painting";

// Seconds from load. The CSS in landing.css times the frame, glow and caption to match.
const AT = { words: 0.7, wordStep: 0.1, gather: 3, paint: 3.8 };

// Where each word hangs in the air before it's gathered: [word, x, y, tilt], x and y in % of the stage width.
const WORDS: [string, number, number, number][] = [
  ["I", 29.4, 14, -4],
  ["was", 37.6, 12.8, 2],
  ["flying", 51.7, 14.8, -2],
  ["over", 66.4, 13.4, 3],
  ["my", 35.6, 26.4, 3],
  ["old", 45.4, 24.7, -3],
  ["school,", 59.9, 26.1, 2],
  ["and", 29.1, 36.6, -2],
  ["the", 40.1, 37.9, 4],
  ["roof", 51.4, 36.1, -3],
  ["turned", 67.2, 37.5, 2],
  ["into", 39, 49.2, 3],
  ["the", 50.2, 47.9, -2],
  ["sea.", 61.2, 49.3, 2],
];

const BARS = [4, 9, 6, 13, 18, 11, 16, 8, 14, 10, 5, 8];

const vars = (v: Record<string, string | number>) => v as React.CSSProperties;

export function HeroStage() {
  return (
    <figure className="ls-stage">
      <div
        className="ls-art"
        role="img"
        aria-label="A dream told aloud becoming a painting. The words rise from the gold record button and gather into a gilt frame, where a blue painting appears: a school whose roof is a breaking wave, with the dreamer flying above it."
      >
        {/* The frame: a gold line traces it as the words arrive, then the gilt fills in. */}
        <div className="ls-frame-glow" />
        <div className="ls-frame frame">
          <div className="mat aspect-square w-full">
            <DreamPainting animate start={AT.paint} />
          </div>
        </div>
        <svg className="ls-trace" viewBox="0 0 100 100">
          <rect x="0.6" y="0.6" width="98.8" height="98.8" rx="1" pathLength={1} fill="none" stroke="var(--gold)" strokeWidth="0.9" />
        </svg>

        {/* The record button as the app draws it, with its listening halo. */}
        <div className="ls-ring" style={vars({ "--d": "0.5s", "--n": 2 })} />
        <div className="ls-ring" style={vars({ "--d": "1.2s", "--n": 1 })} />
        <div className="ls-sphere sphere">
          <svg viewBox="0 0 60 24" className="ls-wave">
            {BARS.map((h, i) => (
              <rect key={i} x={i * 5 + 1} y={12 - h / 2} width="2.4" height={h} rx="1.2" fill="currentColor" style={vars({ "--d": `${0.5 + (i % 4) * 0.09}s` })} />
            ))}
          </svg>
          <svg viewBox="0 0 24 24" className="ls-mic" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
          </svg>
        </div>

        {WORDS.map(([word, x, y, tilt], i) => (
          <span
            key={i}
            className="ls-word font-display italic"
            style={vars({
              "--x": x,
              "--y": y,
              "--r": `${tilt}deg`,
              "--d": `${AT.words + i * AT.wordStep}s`,
              "--g": `${AT.gather + i * 0.018}s`,
            })}
          >
            {word}
          </span>
        ))}
      </div>

      <figcaption className="ls-caption">
        <span className="font-display italic">&ldquo;I was flying over my old school, and the roof turned into the sea.&rdquo;</span>
        <span className="ls-chip">
          <span className="ls-chip-dot" aria-hidden />
          Wonder
        </span>
      </figcaption>
    </figure>
  );
}
