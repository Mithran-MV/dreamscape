"use client";
// Small shared pieces: Dream Weather chips, the gilt frame, and the links every page uses.
import Link from "next/link";
import { useSyncExternalStore } from "react";

export const FEELINGS = [
  { key: "wonder", label: "Wonder", color: "var(--wonder)" },
  { key: "joy", label: "Joy", color: "var(--joy)" },
  { key: "calm", label: "Calm", color: "var(--calm)" },
  { key: "confused", label: "Confused", color: "var(--confused)" },
  { key: "scared", label: "Scared", color: "var(--scared)" },
  { key: "sad", label: "Sad", color: "var(--sad)" },
] as const;

export const feelingColor = (f?: string | null) => FEELINGS.find((x) => x.key === f)?.color ?? "var(--line)";
export const feelingLabel = (f?: string | null) => FEELINGS.find((x) => x.key === f)?.label ?? null;

// A chip's colour travels as --c, so its border, tint and dot all agree.
export const chipColor = (color: string) => ({ "--c": color }) as React.CSSProperties;

export function FeelingChips({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How did it feel?">
      {FEELINGS.map((f) => {
        const on = value === f.key;
        return (
          <button key={f.key} type="button" role="radio" aria-checked={on} onClick={() => onChange(on ? null : f.key)} className="chip" style={chipColor(f.color)}>
            <span className="chip-dot" aria-hidden />
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

// A living portrait plays muted on a loop over its still, which stays as the poster.
// Anything passed as children sits over the picture, like the progress badge on the wall.
export function Frame({
  src,
  video,
  glow,
  alt,
  className = "",
  failed = false,
  children,
}: {
  src?: string | null;
  video?: string | null;
  glow?: string | null;
  alt: string;
  className?: string;
  failed?: boolean;
  children?: React.ReactNode;
}) {
  const color = glow ? feelingColor(glow) : null;
  const style = { "--glow": color ?? undefined, boxShadow: color ? `0 0 34px -4px ${color}, 0 10px 30px rgb(0 0 0 / .55)` : undefined } as React.CSSProperties;
  return (
    <div className={`frame frame-lit ${className}`} style={style}>
      <div className="mat relative aspect-square w-full">
        {src && video ? (
          <video src={video} poster={src} autoPlay loop muted playsInline aria-label={alt} className="h-full w-full object-cover" />
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="h-full w-full object-cover" />
        ) : (
          <div className={`${failed ? "" : "painting "}flex h-full w-full items-center justify-center`}>
            <span className="font-display text-ui italic text-mist">{failed ? "Didn’t paint" : "Painting…"}</span>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="press inline-flex items-center gap-1.5 rounded-full py-1 pr-2 text-ui font-semibold text-mist transition-colors hover:text-paper">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M15 5 8 12l7 7" />
      </svg>
      {children}
    </Link>
  );
}

// A link that leaves Dreamscape, for explorers and ENS. The small arrow says it opens elsewhere.
export function ExternalLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex max-w-full items-center gap-1 text-gold underline decoration-gold/30 underline-offset-4 transition-colors hover:decoration-gold ${className}`}
    >
      <span className="min-w-0 truncate">{children}</span>
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 16 16 8M9 8h7v7" />
      </svg>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

// A switch that flips the moment it's tapped. The caller saves the change and flips it back if that fails.
export function Switch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="press inline-flex items-center gap-3 rounded-full py-1 text-ui font-semibold text-mist transition-colors hover:text-paper disabled:opacity-50"
    >
      <span className={`relative h-6 w-10 shrink-0 rounded-full border transition-colors duration-150 ${checked ? "border-gold bg-gold" : "border-line bg-card"}`} aria-hidden>
        <span
          className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-[left,background-color] duration-150 ease-out ${checked ? "left-[1.2rem] bg-gold-ink" : "left-[0.2rem] bg-mist"}`}
        />
      </span>
      {label}
    </button>
  );
}

// The current minute, ticking every half minute, for countdowns. 0 on the server and the first render.
const everyHalfMinute = (tick: () => void) => {
  const t = setInterval(tick, 30_000);
  return () => clearInterval(t);
};
export const useMinute = () => useSyncExternalStore(everyHalfMinute, () => Math.floor(Date.now() / 60_000), () => 0);

export const dayLabel = (day: number) =>
  new Date(day * 86_400_000).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
