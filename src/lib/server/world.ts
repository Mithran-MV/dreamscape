// The World Dream: one painting a day of what everybody dreamed, from themes and feelings only.
// A theme counts only when at least five dreamers share it that day, so nobody can be picked out.
// A circle (a family, or an event code like ethglobal-mumbai) gets its own on demand.
import { getDb, now } from "./db";
import { addTrace, getBlob, putBlob, FEELINGS, type Feeling } from "./dreams";
import { newId } from "./crypto";
import { enqueue, hasOpenJob } from "./jobs";
import { paint } from "./zerog/router";

export const MIN_DREAMERS = 5;
export const WORLD = "world";
// The World Dream belongs to nobody, so its painting is sealed under this key name.
export const WORLD_OWNER = "world";

export type WorldCounts = { dreamers: number; themes: { theme: string; dreamers: number }[]; feeling: Feeling | null };

export type WorldDream = {
  id: string;
  day: number;
  circle: string;
  status: "painting" | "done" | "too-few";
  counts_json: string;
  error: string | null;
  created_at: number;
};

export const cleanCircle = (code: string) => code.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);

// Counts one UTC day, for everyone or for one circle. Each dreamer counts once per theme.
export function worldCounts(day: number, circle = WORLD): WorldCounts {
  const rows = getDb()
    .prepare(
      `SELECT d.user_id, d.tags_json, COALESCE(d.feeling, d.suggested_feeling) AS feeling FROM dreams d JOIN users u ON u.id = d.user_id
       WHERE d.day = ? AND d.tags_json IS NOT NULL AND d.status IN ('painted', 'storing', 'done') AND (? = 'world' OR u.circle = ?)`,
    )
    .all(day, circle, circle) as { user_id: string; tags_json: string; feeling: string | null }[];
  const themes = new Map<string, Set<string>>();
  const feelings = new Map<string, Set<string>>();
  for (const r of rows) {
    for (const t of (JSON.parse(r.tags_json).themes ?? []) as string[]) themes.set(t, (themes.get(t) ?? new Set()).add(r.user_id));
    if (r.feeling) feelings.set(r.feeling, (feelings.get(r.feeling) ?? new Set()).add(r.user_id));
  }
  const dreamers = new Set(rows.map((r) => r.user_id)).size;
  const shared = [...themes].map(([theme, who]) => ({ theme, dreamers: who.size })).filter((t) => t.dreamers >= MIN_DREAMERS);
  shared.sort((a, b) => b.dreamers - a.dreamers || a.theme.localeCompare(b.theme));
  const top = [...feelings].map(([f, who]) => ({ f, n: who.size })).sort((a, b) => b.n - a.n)[0];
  const feeling = dreamers >= MIN_DREAMERS && top && FEELINGS.includes(top.f as Feeling) ? (top.f as Feeling) : null;
  return { dreamers, themes: shared, feeling };
}

const SCENE: Record<string, string> = {
  water: "vast calm water", flight: "figures drifting through the sky", falling: "a long gentle fall through light", chase: "running shapes in a hallway of doors",
  home: "a glowing house", animals: "animals made of light", people: "a crowd of silhouettes", school: "an endless classroom",
  city: "a city of lit windows", nature: "an overgrown forest", fantasy: "impossible floating architecture", night: "a deep starry night",
};
const PALETTE: Record<Feeling, string> = { wonder: "luminous blue", joy: "warm gold", calm: "soft teal", confused: "violet", scared: "deep coral red", sad: "dusky indigo" };

function worldPrompt(c: WorldCounts) {
  const scene = c.themes.slice(0, 3).map((t) => SCENE[t.theme] ?? t.theme).join(", blending into ");
  return `A single dreamlike painterly canvas of many people's dreams merging into one: ${scene}. Rich oil paint texture, soft glowing light, palette leaning toward ${PALETTE[c.feeling ?? "wonder"]}. No people's faces, no text, no letters, no signature, no border.`;
}

export function getWorldDream(day: number, circle = WORLD) {
  return getDb().prepare("SELECT * FROM world_dreams WHERE day = ? AND circle = ? ORDER BY created_at DESC LIMIT 1").get(day, circle) as WorldDream | undefined;
}

export function latestWorldDream(circle = WORLD) {
  return getDb().prepare("SELECT * FROM world_dreams WHERE circle = ? AND status = 'done' ORDER BY day DESC LIMIT 1").get(circle) as WorldDream | undefined;
}

export const worldImageKey = (id: string) => `world/${id}/painting`;

// Job 'world.paint', ref = "<day>:<circle>". Too few dreamers means no painting, and that is recorded.
export async function paintWorld(ref: string) {
  const [dayText, circle = WORLD] = ref.split(":");
  const day = Number(dayText);
  let wd = getWorldDream(day, circle);
  if (wd?.status === "done" || wd?.status === "too-few") return;
  const counts = worldCounts(day, circle);
  if (!wd) {
    const id = newId("world");
    const status = counts.themes.length ? "painting" : "too-few";
    getDb().prepare("INSERT INTO world_dreams (id, day, circle, status, counts_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, day, circle, status, JSON.stringify(counts), now());
    wd = getWorldDream(day, circle)!;
    if (status === "too-few") return;
  }
  if (!getBlob(WORLD_OWNER, worldImageKey(wd.id))) {
    const { png, trace } = await paint(worldPrompt(counts));
    addTrace(wd.id, "world", trace);
    putBlob(WORLD_OWNER, worldImageKey(wd.id), "image/png", png);
  }
  getDb().prepare("UPDATE world_dreams SET status = 'done', counts_json = ?, error = NULL WHERE id = ?").run(JSON.stringify(counts), wd.id);
}

export function startWorld(day: number, circle = WORLD) {
  const ref = `${day}:${circle}`;
  if (!hasOpenJob(ref, ["world.paint"])) enqueue("world.paint", ref);
}

// "Last night 12 dreamers dreamed of water and flight, and mostly felt wonder."
export function worldSentence(c: WorldCounts, circleName?: string) {
  const who = circleName ? `${c.dreamers} dreamers at ${circleName}` : `${c.dreamers} dreamers`;
  if (!c.themes.length) return `Not enough dreamers shared a theme last night to paint it. It needs ${MIN_DREAMERS}.`;
  const themes = c.themes.slice(0, 3).map((t) => t.theme);
  const list = themes.length > 1 ? `${themes.slice(0, -1).join(", ")} and ${themes[themes.length - 1]}` : themes[0];
  return `Last night ${who} dreamed of ${list}${c.feeling ? `, and mostly felt ${c.feeling}` : ""}.`;
}

// Called by the worker every minute: from 23:30 UTC, paint the day's World Dream before the credit reset.
export function scheduleWorld(at = new Date()) {
  if (at.getUTCHours() !== 23 || at.getUTCMinutes() < 30) return;
  const day = Math.floor(at.getTime() / 86_400_000);
  if (!getWorldDream(day)) startWorld(day);
}
