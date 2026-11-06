// The Morning Note's AI line. A sealed model on 0G compares the dreamer's week with their own usual and
// with what most people dream. It only gets counts of themes and feelings, never the dreams' words, and
// it never says what a dream means. Written once a day, in the night run or the first time it's missing.
import { getDb, utcDay } from "./db";
import { THEMES } from "./dreams";
import { enqueue, hasOpenJob } from "./jobs";
import { chatJson } from "./zerog/router";


// The best-known survey of typical dreams (Typical Dreams Questionnaire, Nielsen et al. 2003, about
// 1,200 Canadian university students): how many had ever dreamed of each.
const TYPICAL = "In the best-known survey of typical dreams (about 1,200 university students, Nielsen et al. 2003): 81% had dreamed of being chased, 74% of falling, 67% of school, and 48% of flying. Water, animals, cities and the rest were not among the most common.";

const SYSTEM = `You write one short Morning Note for a private dream gallery, for the dreamer's eyes only.
You get counts of the themes and feelings in their dreams this week and over the four weeks before, and a few facts from a survey of typical dreams.
Write 1 or 2 sentences, at most 35 words, in the second person. Compare this week with the dreamer's own usual, or with what most people dream, using only the survey facts given. Be warm and curious.
Never say what a dream means, never diagnose, never give advice, never mention health. No exclamation marks.
Return only a JSON object {"note": string, "theme": string or null}, where "theme" is the one theme from this week's counts that could become a saga, or null.`;

export type AiNote = { day: number; text: string; theme: string | null; model: string; requestId: string | null };

const key = (userId: string) => `ai-note:${userId}`;

export function aiNoteFor(userId: string): AiNote | null {
  const row = getDb().prepare("SELECT value FROM kv WHERE key = ?").get(key(userId)) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as AiNote) : null;
}

// Queues today's note if there isn't one yet and the dreamer has dreams to compare.
export function startAiNote(userId: string) {
  if (aiNoteFor(userId)?.day === utcDay()) return;
  const has = getDb().prepare("SELECT 1 FROM dreams WHERE user_id = ? AND tags_json IS NOT NULL LIMIT 1").get(userId);
  if (has && !hasOpenJob(userId, ["note.write"])) enqueue("note.write", userId);
}

function counts(userId: string, from: number, to: number) {
  const rows = getDb()
    .prepare("SELECT tags_json, COALESCE(feeling, suggested_feeling) AS feeling FROM dreams WHERE user_id = ? AND day >= ? AND day < ? AND tags_json IS NOT NULL")
    .all(userId, from, to) as { tags_json: string; feeling: string | null }[];
  const themes: Record<string, number> = {};
  const feelings: Record<string, number> = {};
  for (const r of rows) {
    for (const t of (JSON.parse(r.tags_json).themes ?? []) as string[]) if ((THEMES as readonly string[]).includes(t)) themes[t] = (themes[t] ?? 0) + 1;
    if (r.feeling) feelings[r.feeling] = (feelings[r.feeling] ?? 0) + 1;
  }
  return { dreams: rows.length, themes, feelings };
}

// Job 'note.write', ref = user id. Runs on the dreamer's own 0G key when they connected one.
export async function writeAiNote(userId: string) {
  // Written in the night run, it's for the morning after.
  const today = utcDay() + (new Date().getUTCHours() >= 18 ? 1 : 0);
  if (aiNoteFor(userId)?.day === today) return;
  const week = counts(userId, today - 6, today + 1);
  const before = counts(userId, today - 34, today - 6);
  if (!week.dreams && !before.dreams) return;
  const { value, trace } = await chatJson<{ note?: string; theme?: string | null }>(SYSTEM, JSON.stringify({ thisWeek: week, fourWeeksBefore: before, typicalDreams: TYPICAL }), 1500);
  const text = String(value.note ?? "").trim().slice(0, 280);
  if (!text) throw new Error("The Morning Note came back empty.");
  const theme = value.theme && week.themes[value.theme] ? value.theme : null;
  const note: AiNote = { day: today, text, theme, model: trace.model, requestId: trace.requestId };
  getDb().prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key(userId), JSON.stringify(note));
}

// "Make this a saga tonight": tonight's comic continues this theme, even if no new dream comes.
const sagaKey = (userId: string, day: number) => `saga-tonight:${userId}:${day}`;
export function setSagaTonight(userId: string, theme: string) {
  if (!(THEMES as readonly string[]).includes(theme)) return false;
  getDb().prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(sagaKey(userId, utcDay()), theme);
  return true;
}
export const sagaTonight = (userId: string) => (getDb().prepare("SELECT value FROM kv WHERE key = ?").get(sagaKey(userId, utcDay())) as { value: string } | undefined)?.value ?? null;
