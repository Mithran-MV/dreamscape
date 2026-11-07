"use client";
// The gallery wall as a calendar: one month per block, newest first, Monday to Sunday.
// Each day shows its newest dream that painted, or up to four when there were several; a click opens the
// newest. Only the weeks from the one the gallery began in up to this one are drawn, so a new gallery
// isn't a month of empty boxes. Days without a dream stay dim; days before the first dream or still ahead stay blank.
import Link from "next/link";
import { PAINTED, portraitUrl, type DreamSummary } from "@/lib/api";
import { useClientValue } from "@/lib/use-client-value";
import { feelingColor, feelingLabel } from "@/components/ui";
import { ProgressBadge } from "@/components/dream-progress";

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Day numbers count from 1 January 1970, a Thursday.
const mondayIndex = (day: number) => (day + 3) % 7;

function monthsBack(today: number, oldest: number) {
  const months: { year: number; month: number }[] = [];
  const now = new Date(today * DAY_MS);
  const end = new Date(oldest * DAY_MS);
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth();
  while (y > end.getUTCFullYear() || (y === end.getUTCFullYear() && m >= end.getUTCMonth())) {
    months.push({ year: y, month: m });
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
  }
  return months;
}

export function CalendarWall({ dreams, feeling }: { dreams: DreamSummary[]; feeling: string | null }) {
  const today = useClientValue(() => Math.floor(Date.now() / DAY_MS), 0);
  if (!today) return <div className="mt-12 h-[60vh]" aria-hidden />;

  // The list comes newest first, so the first dream seen on a day is that day's newest.
  const byDay = new Map<number, DreamSummary[]>();
  for (const d of dreams) byDay.set(d.day, [...(byDay.get(d.day) ?? []), d]);
  const oldest = Math.min(today, ...dreams.map((d) => d.day));
  const firstWeek = oldest - mondayIndex(oldest);
  const lastDay = today - mondayIndex(today) + 6;

  return (
    <div className="mt-14 space-y-14">
      {monthsBack(today, oldest).map(({ year, month }) => {
        const first = Date.UTC(year, month, 1) / DAY_MS;
        const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const name = new Date(first * DAY_MS).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
        const kept = dreams.filter((d) => d.day >= first && d.day < first + length).length;
        const from = Math.max(first, firstWeek);
        const to = Math.min(first + length - 1, lastDay);
        return (
          <section key={`${year}-${month}`} aria-labelledby={`m-${year}-${month}`}>
            <div className="flex items-baseline justify-between gap-4">
              <h2 id={`m-${year}-${month}`} className="font-display text-title sm:text-h2">
                {name}
              </h2>
              <p className="shrink-0 text-meta text-dim sm:text-ui">{kept === 0 ? "No dreams kept" : `${kept} ${kept === 1 ? "dream" : "dreams"} kept`}</p>
            </div>
            <div className="mt-5 grid grid-cols-7 gap-1.5 sm:gap-3 lg:gap-4" role="list">
              {WEEKDAYS.map((w) => (
                <p key={w} className="pb-1 text-center text-meta font-semibold text-dim sm:text-left" aria-hidden>
                  <span className="sm:hidden">{w.charAt(0)}</span>
                  <span className="hidden sm:inline">{w.slice(0, 3)}</span>
                </p>
              ))}
              {Array.from({ length: mondayIndex(from) }, (_, i) => (
                <span key={`lead-${i}`} aria-hidden />
              ))}
              {Array.from({ length: to - from + 1 }, (_, i) => (
                <DayTile key={from + i} day={from + i} n={from + i - first + 1} today={today} began={oldest} dreams={byDay.get(from + i) ?? []} feeling={feeling} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DayTile({ day, n, today, began, dreams, feeling }: { day: number; n: number; today: number; began: number; dreams: DreamSummary[]; feeling: string | null }) {
  const isToday = day === today;
  const date = new Date(day * DAY_MS).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  if (day > today) return <span role="listitem" aria-label={`${date}, still ahead`} />;
  if (day < began) return <span role="listitem" aria-label={`${date}, before your first dream`} />;

  // The day's newest dream that painted (or is painting), so one failed try doesn't hide that morning's picture.
  const newest = dreams.find((d) => d.status !== "failed") ?? dreams[0];
  if (!newest) {
    return (
      <span
        role="listitem"
        aria-label={`${date}${isToday ? ", today" : ""}: no dream kept`}
        className={`flex aspect-square items-start rounded-[4px] border p-1.5 text-meta font-semibold sm:p-2.5 ${isToday ? "border-gold text-gold" : "border-edge/70 bg-card/25 text-dim/70"}`}
      >
        {isToday ? <span className="text-[11px] sm:text-meta">Today</span> : n}
      </span>
    );
  }

  const painted = PAINTED.has(newest.status);
  const mosaic = dreams.filter((d) => PAINTED.has(d.status)).slice(0, 4);
  const dimmed = feeling !== null && newest.feeling !== feeling;
  const color = feelingColor(newest.feeling);
  const parts = [newest.title ?? (newest.status === "failed" ? "didn’t paint" : "painting"), feelingLabel(newest.feeling)?.toLowerCase(), newest.moving && "moving", dreams.length > 1 && `${dreams.length} dreams that day`];
  return (
    <Link
      role="listitem"
      href={`/dream/${newest.id}`}
      aria-label={`${date}${isToday ? ", today" : ""}: ${parts.filter(Boolean).join(", ")}`}
      className="lift group block"
    >
      <div
        className={`frame frame-lit frame-thin transition-[opacity,filter] duration-200 ${isToday ? "outline-2 outline-offset-[3px] outline-gold" : ""} ${dimmed ? "opacity-25 saturate-0" : ""}`}
        style={{ "--glow": color, boxShadow: newest.feeling ? `0 0 22px -6px ${color}, 0 8px 22px rgb(0 0 0 / .5)` : undefined } as React.CSSProperties}
      >
        <div className="mat relative aspect-square w-full">
          {mosaic.length > 1 ? (
            // A morning with several dreams shows up to four of them, newest first.
            <span className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px bg-[#0b0918]">
              {mosaic.map((d) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={d.id} src={portraitUrl(d.id)} alt="" loading="lazy" className={`h-full w-full object-cover ${mosaic.length === 3 && d === mosaic[0] ? "row-span-2" : ""} ${mosaic.length === 2 ? "row-span-2" : ""}`} />
              ))}
            </span>
          ) : painted ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={portraitUrl(newest.id)} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : newest.status === "failed" ? (
            <span className="grid h-full w-full place-items-center bg-[#0b0918] text-[11px] font-semibold text-dim sm:text-meta">
              <span className="hidden sm:inline">Didn&rsquo;t paint</span>
              <span className="sm:hidden" aria-hidden>
                !
              </span>
            </span>
          ) : (
            <span className="painting block h-full w-full" />
          )}
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1 pt-4 text-[11px] font-semibold leading-tight text-paper sm:px-2 sm:pb-1.5 sm:text-meta" aria-hidden>
            {isToday ? "Today" : n}
            {newest.moving && <span className="hidden text-gold sm:inline">, moving</span>}
          </span>
          {dreams.length > 1 && (
            <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[10px] font-bold text-gold-ink sm:right-1.5 sm:top-1.5 sm:h-5 sm:min-w-5 sm:text-[11px]" aria-hidden>
              {dreams.length}
            </span>
          )}
          {!painted && newest.status !== "failed" && (
            <span className="hidden md:block">
              <ProgressBadge dream={newest} />
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
