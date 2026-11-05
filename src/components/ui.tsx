"use client";
// Small shared pieces: Dream Weather chips and the gilt frame.

export const FEELINGS = [
  { key: "wonder", label: "Wonder", color: "var(--wonder)" },
  { key: "joy", label: "Joy", color: "var(--joy)" },
  { key: "calm", label: "Calm", color: "var(--calm)" },
  { key: "confused", label: "Confused", color: "var(--confused)" },
  { key: "scared", label: "Scared", color: "var(--scared)" },
  { key: "sad", label: "Sad", color: "var(--sad)" },
] as const;

export const feelingColor = (f?: string | null) => FEELINGS.find((x) => x.key === f)?.color ?? "var(--line)";

export function FeelingChips({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="How did it feel?">
      {FEELINGS.map((f) => {
        const on = value === f.key;
        return (
          <button
            key={f.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? null : f.key)}
            className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors"
            style={{ borderColor: on ? f.color : "var(--line)", background: on ? f.color : "transparent", color: on ? "#fff" : "var(--mist)" }}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: f.color }} aria-hidden />
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

export function Frame({ src, glow, alt, className = "", failed = false }: { src?: string | null; glow?: string | null; alt: string; className?: string; failed?: boolean }) {
  return (
    <div className={`frame ${className}`} style={{ boxShadow: glow ? `0 0 34px -4px ${feelingColor(glow)}, 0 10px 30px rgb(0 0 0 / .55)` : undefined }}>
      <div className="mat aspect-square w-full">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="h-full w-full object-cover" />
        ) : (
          <div className={`${failed ? "" : "painting "}flex h-full w-full items-center justify-center`}>
            <span className="font-display text-sm italic text-mist">{failed ? "Not painted" : "Painting…"}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export const dayLabel = (day: number) =>
  new Date(day * 86_400_000).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
