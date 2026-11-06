"use client";
// The dreamer's own voice note, with a waveform to scrub. The real <audio> element plays it; this is only its face.
// The bars are drawn from the dream's id, so they read as a voice without pretending to be its levels.
import { useEffect, useRef, useState } from "react";

const BARS = 56;

function shape(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Array.from({ length: BARS }, (_, i) => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const wobble = ((h >>> 0) % 1000) / 1000;
    const envelope = Math.sin((Math.PI * (i + 0.5)) / BARS) * 0.55 + 0.35;
    return Math.max(0.14, Math.min(1, envelope * (0.55 + wobble * 0.65)));
  });
}

const clock = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

export function VoicePlayer({ src, seed }: { src: string; seed: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const [bars] = useState(() => shape(seed));

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    // Recordings made in the browser often don't say how long they are until they've been read to the end.
    const measure = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) return setLength(a.duration);
      const settle = () => {
        a.removeEventListener("timeupdate", settle);
        if (Number.isFinite(a.duration)) setLength(a.duration);
        a.currentTime = 0;
      };
      a.addEventListener("timeupdate", settle);
      a.currentTime = 1e7;
    };
    const tick = () => setTime(a.currentTime);
    const play = () => setPlaying(true);
    const pause = () => setPlaying(false);
    const durationChange = () => Number.isFinite(a.duration) && a.duration > 0 && setLength(a.duration);
    a.addEventListener("loadedmetadata", measure);
    a.addEventListener("durationchange", durationChange);
    a.addEventListener("timeupdate", tick);
    a.addEventListener("play", play);
    a.addEventListener("pause", pause);
    a.addEventListener("ended", pause);
    return () => {
      a.removeEventListener("loadedmetadata", measure);
      a.removeEventListener("durationchange", durationChange);
      a.removeEventListener("timeupdate", tick);
      a.removeEventListener("play", play);
      a.removeEventListener("pause", pause);
      a.removeEventListener("ended", pause);
    };
  }, []);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => undefined);
    else a.pause();
  };
  const seek = (fraction: number) => {
    const a = audio.current;
    if (!a || !length) return;
    a.currentTime = Math.max(0, Math.min(length, fraction * length));
  };
  const progress = length ? Math.min(1, time / length) : 0;

  return (
    <div className="panel mt-6 flex items-center gap-4 p-3 pr-5">
      <audio ref={audio} src={src} preload="metadata" />
      <button onClick={toggle} aria-label={playing ? "Pause your voice note" : "Play your voice note"} className="sphere sphere-press grid h-12 w-12 shrink-0 place-items-center rounded-full text-gold-ink">
        {playing ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
            <rect x="6" y="5" width="4" height="14" rx="1.2" />
            <rect x="14" y="5" width="4" height="14" rx="1.2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden>
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
          </svg>
        )}
      </button>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Position in your voice note"
        aria-valuemin={0}
        aria-valuemax={Math.round(length)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${clock(time)} of ${clock(length)}`}
        onPointerDown={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          seek((e.clientX - box.left) / box.width);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") seek((time + 5) / (length || 1));
          else if (e.key === "ArrowLeft") seek((time - 5) / (length || 1));
          else if (e.key === " " || e.key === "Enter") toggle();
          else return;
          e.preventDefault();
        }}
        className="flex h-12 min-w-0 flex-1 cursor-pointer items-center gap-[3px] rounded-md"
      >
        {bars.map((h, i) => (
          <span
            key={i}
            className={`flex-1 rounded-full transition-colors duration-150 ${i / BARS < progress ? "bg-gold" : "bg-line"}`}
            style={{ height: `${Math.round(h * 100)}%` }}
            aria-hidden
          />
        ))}
      </div>
      <p className="w-20 shrink-0 text-right font-mono text-meta tabular-nums text-mist" aria-hidden>
        {clock(time)} / {clock(length)}
      </p>
    </div>
  );
}
