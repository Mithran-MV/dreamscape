"use client";
// Dream Weather: this month as a strip of days, each tinted by how that night's dream felt.
import { useState } from "react";
import { feelingColor, FEELINGS } from "@/components/ui";

const DAY_MS = 86_400_000;

export function WeatherStrip({ dreams }: { dreams: { day: number; feeling: string | null }[] }) {
  const [today] = useState(() => Math.floor(Date.now() / DAY_MS));
  const now = new Date(today * DAY_MS);
  const first = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / DAY_MS);
  const length = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  // The newest dream of each day sets its colour.
  const byDay = new Map<number, string | null>();
  for (const d of [...dreams].reverse()) byDay.set(d.day, d.feeling);
  const month = now.toLocaleDateString(undefined, { month: "long", timeZone: "UTC" });
  const counted = FEELINGS.map((f) => ({ ...f, n: [...byDay.entries()].filter(([day, x]) => day >= first && x === f.key).length })).filter((f) => f.n);

  return (
    <div className="mt-4">
      <div className="flex gap-[3px]" role="img" aria-label={`Dream weather for ${month}: ${counted.map((f) => `${f.n} ${f.label.toLowerCase()}`).join(", ") || "no dreams yet"}`}>
        {Array.from({ length }, (_, i) => {
          const day = first + i;
          const felt = byDay.get(day);
          return (
            <span
              key={day}
              title={felt ? `${i + 1} ${month}: ${FEELINGS.find((f) => f.key === felt)?.label ?? felt}` : `${i + 1} ${month}`}
              className={`h-2.5 flex-1 rounded-[2px] ${day === today ? "ring-1 ring-paper/60" : ""}`}
              style={{ background: felt ? feelingColor(felt) : day > today ? "transparent" : "var(--edge)", border: day > today ? "1px solid var(--edge)" : undefined }}
            />
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-dim">{month}&rsquo;s dream weather</p>
    </div>
  );
}
