// The nightly run: link the newest dream to the past week (its saga), write a 4-panel comic script,
// then draw the panels with no words in them. The app letters the page itself, so dialogue never
// reaches an image model, and image models never get to garble it.
import { getDb, utcDay } from "./db";
import type { Feeling } from "./dreams";

export type Line = { who: string; text: string };
export type Panel = { scene: string; dialogue: Line[]; caption: string | null };
export type Script = { title: string; panels: Panel[] };

export type Episode = {
  id: string;
  user_id: string;
  day: number;
  status: "writing" | "drawing" | "draft" | "published" | "discarded";
  error: string | null;
  saga: string | null;
  title: string | null;
  feeling: Feeling;
  script_json: string | null;
  dream_ids: string;
  created_at: number;
};

const DAY_MS = 86_400_000;
export const NIGHT_HOUR_UTC = 20; // before the 00:00 UTC credit reset, with time left for video
// iAI gives $1.00 of credit a day; the night never plans past it.
const DAILY_BUDGET_USD = 1.0;
const PANEL_USD = 0.0252;
const EPISODE_USD = 4 * PANEL_USD + 0.005; // four panels plus the saga and script calls

const INK_SPOT: Record<Feeling, string> = {
  wonder: "cobalt blue",
  joy: "golden yellow",
  calm: "teal",
  confused: "violet",
  scared: "coral red",
  sad: "slate blue",
};

// ---------------------------------------------------------------- records

export function getEpisode(id: string) {
  return getDb().prepare("SELECT * FROM episodes WHERE id = ?").get(id) as Episode | undefined;
}

export function listEpisodes(userId: string, limit = 60) {
  return getDb().prepare("SELECT * FROM episodes WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").all(userId, limit) as Episode[];
}

const EPISODE_COLUMNS = new Set(["status", "error", "saga", "title", "script_json"]);

export function updateEpisode(id: string, fields: Partial<Record<string, string | number | null>>) {
  const keys = Object.keys(fields).filter((k) => EPISODE_COLUMNS.has(k));
  if (!keys.length) return;
  getDb()
    .prepare(`UPDATE episodes SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
    .run(...keys.map((k) => fields[k] ?? null), id);
}

export const panelKey = (episodeId: string, n: number) => `episode/${episodeId}/panel/${n}`;

// What this dreamer's 0G calls cost today, from the stored traces.
export function spentTodayUsd(userId: string) {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) AS usd FROM traces WHERE created_at >= ?
       AND (dream_id IN (SELECT id FROM dreams WHERE user_id = ?) OR dream_id IN (SELECT id FROM episodes WHERE user_id = ?))`,
    )
    .get(utcDay() * DAY_MS, userId, userId) as { usd: number };
  return row.usd;
}

// ---------------------------------------------------------------- prompts

const SAGA_SYSTEM = `You keep the sagas of a private dream gallery: dreams that share places, people, objects or themes.
You get the newest dream and the dreamer's earlier dreams from the past week, each with an id and maybe a saga name.
Return only a JSON object {"saga": string, "links": string[]}:
- "saga": if the newest dream continues an earlier saga, reuse that saga's exact name; otherwise invent a new name of 2 to 4 words from the newest dream
- "links": ids of earlier dreams that belong to the same saga (may be empty)
Never interpret what a dream means.`;

const CHARACTER_SYSTEM = `Invent the recurring hero of someone's dream comic: the dreamer, drawn as a simple cartoon.
Return only a JSON object {"character": string}: one sentence of 15 to 30 words naming 3 fixed, easy-to-draw features,
such as a hair shape, one item of clothing and one accessory. No real or famous person.`;

const scriptSystem = (character: string) => `You write a 4-panel newspaper comic strip from someone's own dream, for their private gallery.
Panel 1 is the setup, panel 2 the turn, panel 3 the escalation, panel 4 the punchline. Be funny by default; if the dream is tender or sad, end tenderly instead of with a joke.
The hero is the dreamer: ${character}. Captions call the hero "you"; when the hero speaks, "who" is "Dreamer".
Return only a JSON object {"title": string, "panels": [{"scene": string, "dialogue": [{"who": string, "text": string}], "caption": string or null}]} with exactly 4 panels.
- "title": 2 to 5 words
- "scene": what to draw, 20 to 45 words, purely visual, present tense; describe the hero by their look, never by name; no signs, letters or speech bubbles in the scene
- "dialogue": 0 to 2 lines per panel, each at most 8 words
- "caption": at most 10 words, or null
Never interpret what the dream means. No names of real people.`;

function panelPrompt(scene: string, character: string, feeling: Feeling) {
  return `Black ink line art on a plain white background with one ${INK_SPOT[feeling]} spot color, simple cartoon, a newspaper comic strip panel, clean confident lines. Keep the top third of the frame empty plain white. No text, no letters, no speech bubbles, no captions, no signature, no border. The hero: ${character}. ${scene}`;
}

const words = (s: unknown, max: number) => String(s ?? "").trim().split(/\s+/).filter(Boolean).slice(0, max).join(" ");

function cleanScript(raw: Partial<Script>): Script {
  const panels = (Array.isArray(raw.panels) ? raw.panels : []).slice(0, 4).map((p) => ({
    scene: String(p?.scene ?? "").slice(0, 400),
    dialogue: (Array.isArray(p?.dialogue) ? p.dialogue : [])
      .slice(0, 2)
      .map((l) => ({ who: words(l?.who, 3) || "Dreamer", text: words(l?.text, 8) }))
      .filter((l) => l.text),
    caption: p?.caption ? words(p.caption, 10) : null,
  }));
  if (panels.length !== 4 || panels.some((p) => !p.scene)) throw new Error("The comic script didn't have four drawable panels.");
  return { title: words(raw.title, 5) || "Last night", panels };
}

function imageMime(bytes: Buffer) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return "image/png";
}

