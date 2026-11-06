// Mornings and Memories. Every morning the dreamer lights a star: by telling a dream, tapping a feeling,
// or saying nothing came. The count of mornings kept only grows, and at 7, 21, 30 and 100 it brings a
// reveal made from their own dreams. "On this morning" brings an older dream back, as photo memories do.
import { getDb, now, utcDay } from "./db";
import { addTrace, FEELINGS, getBlob, putBlob, type Feeling } from "./dreams";
import { newId } from "./crypto";
import { enqueue, hasOpenJob } from "./jobs";
import { paint } from "./zerog/router";

export type MorningKind = "dream" | "feeling" | "nothing";
export type Star = { day: number; kind: MorningKind | null; feeling: string | null };

const PAINTED = "('painted', 'storing', 'done')";
const DAY_MS = 86_400_000;

// The reveals, in the order the count reaches them.
export const REVEALS = [
  { kind: "pattern", at: 7, title: "Your first pattern" },
  { kind: "cast", at: 21, title: "Your dream cast" },
  { kind: "book", at: 30, title: "Your month as a book" },
  { kind: "portrait", at: 100, title: "Your dream self-portrait" },
] as const;
type RevealKind = (typeof REVEALS)[number]["kind"];

export function keepMorning(userId: string, kind: MorningKind, feeling: string | null) {
  const f = feeling && (FEELINGS as readonly string[]).includes(feeling) ? feeling : null;
  getDb()
    .prepare(
      `INSERT INTO mornings (user_id, day, kind, feeling, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, day) DO UPDATE SET kind = CASE WHEN mornings.kind = 'dream' THEN 'dream' ELSE excluded.kind END,
       feeling = COALESCE(excluded.feeling, mornings.feeling)`,
    )
    .run(userId, utcDay(), kind, f, now());
  startDueReveals(userId);
}

// Each kept day once: a tap, or a dream told that day.
function keptDays(userId: string): Map<number, Star> {
  const db = getDb();
  const days = new Map<number, Star>();
  for (const m of db.prepare("SELECT day, kind, feeling FROM mornings WHERE user_id = ?").all(userId) as { day: number; kind: MorningKind; feeling: string | null }[])
    days.set(m.day, { day: m.day, kind: m.kind, feeling: m.feeling });
  for (const d of db.prepare(`SELECT day, COALESCE(feeling, suggested_feeling) AS feeling FROM dreams WHERE user_id = ? AND status != 'failed'`).all(userId) as { day: number; feeling: string | null }[])
    days.set(d.day, { day: d.day, kind: "dream", feeling: d.feeling ?? days.get(d.day)?.feeling ?? null });
  return days;
}

// This week, Monday to Sunday (UTC days), and the lifetime count.
export function morningState(userId: string) {
  const days = keptDays(userId);
  const today = utcDay();
  const monday = today - ((today + 3) % 7); // 1 Jan 1970 was a Thursday
  const week: Star[] = Array.from({ length: 7 }, (_, i) => days.get(monday + i) ?? { day: monday + i, kind: null, feeling: null });
  const kept = days.size;
  const next = REVEALS.find((r) => r.at > kept) ?? null;
  return { today, keptToday: days.has(today), week, kept, next: next && { title: next.title, at: next.at, left: next.at - kept } };
}

type DreamRow = { id: string; day: number; title: string | null; transcript: string | null; note: string | null; feeling: string | null; tags_json: string | null };

function paintedDreams(userId: string): DreamRow[] {
  return getDb()
    .prepare(`SELECT id, day, title, transcript, note, COALESCE(feeling, suggested_feeling) AS feeling, tags_json FROM dreams WHERE user_id = ? AND status IN ${PAINTED} ORDER BY created_at DESC`)
    .all(userId) as DreamRow[];
}

const words = (d: DreamRow) => {
  const text = (d.transcript ?? d.note ?? "").replace(/\s+/g, " ").trim();
  return text.length > 160 ? `${text.slice(0, 157).replace(/\s+\S*$/, "")}…` : text;
};

// "quote" marks a slide whose text is the dreamer's own words.
export type Slide = { image?: string; kicker?: string; title?: string; text?: string; quote?: boolean; feeling?: string | null };
export type Memory = { id: string; kind: string; title: string; subtitle: string; cover: string | null; feeling: string | null; slides: Slide[] };

const portrait = (id: string) => `/api/dreams/${id}/media/portrait`;

// "On this morning": a year, a month or a week ago today, or failing those the latest earlier dream.
function onThisMorning(dreams: DreamRow[], today: number): Memory | null {
  const older = dreams.filter((d) => d.day < today);
  if (!older.length) return null;
  const ago = [
    { days: 365, label: "One year ago today" },
    { days: 30, label: "One month ago today" },
    { days: 7, label: "One week ago today" },
  ];
  let pick: DreamRow | undefined;
  let label = "";
  for (const a of ago) {
    pick = older.find((d) => d.day === today - a.days);
    if (pick) {
      label = a.label;
      break;
    }
  }
  if (!pick) {
    pick = older[0];
    const n = today - pick.day;
    label = n === 1 ? "Yesterday" : `${n} days ago`;
  }
  return {
    id: `morning-${pick.id}`,
    kind: "this-morning",
    title: label,
    subtitle: pick.title ?? "A dream",
    cover: portrait(pick.id),
    feeling: pick.feeling,
    slides: [{ image: portrait(pick.id), kicker: label, title: pick.title ?? "A dream", text: words(pick), quote: true, feeling: pick.feeling }],
  };
}

type Tagged = { themes?: string[]; people?: string[]; places?: string[] };
const tagsOf = (d: DreamRow): Tagged => {
  try {
    return JSON.parse(d.tags_json ?? "{}");
  } catch {
    return {};
  }
};
function top(values: string[], n: number) {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : (xs[0] ?? ""));

type RevealRow = { id: string; kind: RevealKind; status: string; title: string; body: string | null; slides_json: string | null; created_at: number };

function revealMemory(r: RevealRow): Memory | null {
  if (r.status !== "ready" || !r.slides_json) return null;
  const slides = JSON.parse(r.slides_json) as Slide[];
  const at = REVEALS.find((x) => x.kind === r.kind)?.at;
  return { id: r.id, kind: r.kind, title: r.title, subtitle: `${at} mornings kept`, cover: slides.find((s) => s.image)?.image ?? null, feeling: slides.find((s) => s.feeling)?.feeling ?? null, slides };
}

export function memoriesFor(userId: string): Memory[] {
  const dreams = paintedDreams(userId);
  const out: Memory[] = [];
  const reveals = getDb().prepare("SELECT * FROM reveals WHERE user_id = ? ORDER BY created_at DESC").all(userId) as RevealRow[];
  for (const r of reveals) {
    const m = revealMemory(r);
    if (m) out.push(m);
  }
  const morning = onThisMorning(dreams, utcDay());
  if (morning) out.unshift(morning);
  return out;
}

// Starts any reveal the count has reached and that isn't made yet. Safe to call often.
export function startDueReveals(userId: string) {
  const kept = keptDays(userId).size;
  const db = getDb();
  for (const r of REVEALS) {
    if (kept < r.at) break;
    if (db.prepare("SELECT 1 FROM reveals WHERE user_id = ? AND kind = ?").get(userId, r.kind)) continue;
    const id = newId("reveal");
    db.prepare("INSERT INTO reveals (id, user_id, kind, status, title, created_at) VALUES (?, ?, ?, 'making', ?, ?)").run(id, userId, r.kind, r.title, now());
    if (!hasOpenJob(`${userId}:${r.kind}`, ["reveal.make"])) enqueue("reveal.make", `${userId}:${r.kind}`);
  }
}

const imageKey = (id: string) => `reveal/${id}/image`;
export const revealImageUrl = (id: string) => `/api/memories/${id}/image`;
export const revealImage = (userId: string, id: string) => getBlob(userId, imageKey(id));

// How a night's feeling reads in a sentence about waking.
const WAKE: Record<Feeling, string> = { wonder: "full of wonder", joy: "happy", calm: "calm", confused: "puzzled", scared: "uneasy", sad: "a little sad" };

const STYLE = "Rich oil paint texture, soft glowing light, gentle surreal atmosphere. No text, no letters, no signature, no border.";

// Job 'reveal.make', ref = "<userId>:<kind>". Runs on the dreamer's own 0G key when they connected one.
export async function makeReveal(ref: string) {
  const [userId, kind] = ref.split(":") as [string, RevealKind];
  const db = getDb();
  const row = db.prepare("SELECT * FROM reveals WHERE user_id = ? AND kind = ?").get(userId, kind) as RevealRow | undefined;
  if (!row || row.status === "ready") return;
  const dreams = paintedDreams(userId);
  const at = REVEALS.find((r) => r.kind === kind)!.at;
  const kicker = `${at} mornings kept`;
  const themes = top(dreams.flatMap((d) => tagsOf(d).themes ?? []), 3).map(([t]) => t);
  const feelings = top(dreams.map((d) => d.feeling).filter(Boolean) as string[], 1).map(([f]) => f);
  const mainFeeling = (feelings[0] ?? "wonder") as Feeling;
  let slides: Slide[] = [{ kicker, title: row.title }];
  let body = "";

  if (kind === "pattern") {
    const theme = themes[0];
    body = theme ? `You dream of ${theme} most, and you mostly wake ${WAKE[mainFeeling]}.` : `You mostly wake ${WAKE[mainFeeling]}.`;
    const these = dreams.filter((d) => !theme || (tagsOf(d).themes ?? []).includes(theme)).slice(0, 4);
    slides.push(...these.map((d) => ({ image: portrait(d.id), title: d.title ?? "A dream", text: words(d), quote: true, feeling: d.feeling })), { title: body, feeling: mainFeeling });
  } else if (kind === "book") {
    const month = dreams.filter((d) => d.day > utcDay() - 30).reverse();
    body = `${month.length} ${month.length === 1 ? "dream" : "dreams"} in 30 mornings${themes.length ? `, mostly of ${list(themes)}` : ""}.`;
    slides.push(...month.map((d) => ({ image: portrait(d.id), kicker: new Date(d.day * DAY_MS).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }), title: d.title ?? "A dream", text: words(d), quote: true, feeling: d.feeling })), {
      title: body,
      text: "Every page is kept encrypted on 0G Storage.",
      feeling: mainFeeling,
    });
  } else {
    // The cast and the self-portrait are painted fresh on 0G from the dreams' own tags.
    const people = top(dreams.flatMap((d) => tagsOf(d).people ?? []), 4).map(([p]) => p);
    const places = top(dreams.flatMap((d) => tagsOf(d).places ?? []), 3).map(([p]) => p);
    const prompt =
      kind === "cast"
        ? `A dreamlike painterly gathering of the figures who keep returning in one person's dreams${people.length ? `: ${list(people)}` : ""}, together in ${places.length ? list(places) : "a glowing dream place"}. Faces soft and suggested, never photographic. ${STYLE}`
        : `A dreamlike painterly self-portrait of a dreamer seen from behind, standing in a world woven from their dreams of ${themes.length ? list(themes) : "the night"}${places.length ? `, with ${list(places)} in the distance` : ""}, mood of ${mainFeeling}. ${STYLE}`;
    const { png, trace } = await paint(prompt);
    addTrace(row.id, kind, trace);
    putBlob(userId, imageKey(row.id), "image/png", png);
    body = kind === "cast" ? `${people.length ? `Who keeps coming back: ${list(people)}.` : "The figures who keep coming back."}${places.length ? ` Where: ${list(places)}.` : ""}` : `Who you are in your sleep, from ${dreams.length} dreams.`;
    slides.push({ image: revealImageUrl(row.id), title: kind === "cast" ? "Your dream cast" : "Your dream self-portrait", text: body, feeling: mainFeeling });
  }

  if (slides.length < 2) slides = [{ kicker, title: row.title, text: body }];
  db.prepare("UPDATE reveals SET status = 'ready', body = ?, slides_json = ? WHERE id = ?").run(body, JSON.stringify(slides), row.id);
}
