// The nightly run: link the newest dream to the past week (its saga), write a 4-panel comic script,
// then draw the panels with no words in them. The app letters the page itself, so dialogue never
// reaches an image model, and image models never get to garble it.
import { getDb, now, utcDay } from "./db";
import { addTrace, getBlob, getDream, putBlob, updateDream, type Dream, type Feeling, FEELINGS } from "./dreams";
import { newId } from "./crypto";
import { enqueue, hasOpenJob } from "./jobs";
import { notify } from "./push";
import { chatJson, downloadVideo, drawPanel, pollVideo, submitVideo } from "./zerog/router";

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
const VIDEO_USD = 0.35; // a 5-second Seedance clip, billed when it finishes
const VIDEO_WAIT_MS = 30 * 60_000;

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

// ---------------------------------------------------------------- the run

const SHOWN: Record<string, true> = { painted: true, storing: true, done: true };

// Job 'night.run', ref = user id: the comic first, then a living portrait with whatever credit is left.
export async function runNight(userId: string) {
  await makeComic(userId);
  await startLivingPortrait(userId);
}

// Each step is skipped if an earlier attempt finished it.
async function makeComic(userId: string) {
  const db = getDb();
  const day = utcDay();
  const dreams = (db.prepare("SELECT * FROM dreams WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC").all(userId, now() - 7 * DAY_MS) as Dream[])
    .filter((d) => SHOWN[d.status] && d.tags_json);
  const newest = dreams[0];
  if (!newest || newest.created_at < now() - DAY_MS) return; // nothing dreamed since last night

  let ep = db.prepare("SELECT * FROM episodes WHERE user_id = ? AND day = ? AND status != 'discarded' ORDER BY created_at DESC LIMIT 1").get(userId, day) as
    | Episode
    | undefined;
  if (ep && ep.status !== "writing" && ep.status !== "drawing") return; // tonight's comic is already made
  if (!ep) {
    if (spentTodayUsd(userId) + EPISODE_USD > DAILY_BUDGET_USD) return; // not enough credit left today
    const feeling = (newest.feeling ?? newest.suggested_feeling ?? "wonder") as Feeling;
    const id = newId("episode");
    db.prepare("INSERT INTO episodes (id, user_id, day, status, feeling, dream_ids, created_at) VALUES (?, ?, ?, 'writing', ?, ?, ?)").run(
      id,
      userId,
      day,
      FEELINGS.includes(feeling) ? feeling : "wonder",
      JSON.stringify([newest.id]),
      now(),
    );
    ep = getEpisode(id)!;
  }

  try {
    await makeEpisode(ep, newest, dreams.slice(1));
  } catch (error) {
    updateEpisode(ep.id, { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

async function makeEpisode(ep: Episode, newest: Dream, earlier: Dream[]) {
  const db = getDb();
  const tags = (d: Dream) => {
    const t = JSON.parse(d.tags_json ?? "{}");
    return { id: d.id, title: d.title, saga: d.saga, themes: t.themes, places: t.places, objects: t.objects, people: t.people };
  };

  let saga = newest.saga;
  if (!saga) {
    const { value, trace } = await chatJson<{ saga?: string; links?: string[] }>(SAGA_SYSTEM, JSON.stringify({ newest: tags(newest), earlier: earlier.map(tags) }), 300);
    addTrace(ep.id, "saga", trace);
    saga = words(value.saga, 4) || newest.title || "A new saga";
    updateDream(newest.id, { saga });
    for (const id of value.links ?? []) if (earlier.some((d) => d.id === id && !d.saga)) updateDream(id, { saga });
  }

  const user = db.prepare("SELECT character FROM users WHERE id = ?").get(ep.user_id) as { character: string | null };
  let character = user.character;
  if (!character) {
    const { value, trace } = await chatJson<{ character?: string }>(CHARACTER_SYSTEM, "Invent the hero.", 200);
    addTrace(ep.id, "character", trace);
    character = String(value.character ?? "").slice(0, 300) || "a small cartoon person with a round head, a striped scarf and a tuft of messy hair";
    db.prepare("UPDATE users SET character = ? WHERE id = ?").run(character, ep.user_id);
  }

  let script = ep.script_json ? (JSON.parse(ep.script_json) as Script) : null;
  if (!script) {
    const previous = db.prepare("SELECT title FROM episodes WHERE user_id = ? AND saga = ? AND status = 'published' ORDER BY created_at DESC LIMIT 1").get(ep.user_id, saga) as
      | { title: string }
      | undefined;
    const input = { dream: newest.transcript, scene: newest.scene, ...tags(newest), saga, previousEpisode: previous?.title ?? null };
    const { value, trace } = await chatJson<Partial<Script>>(scriptSystem(character), JSON.stringify(input), 1200);
    addTrace(ep.id, "script", trace);
    script = cleanScript(value);
    updateEpisode(ep.id, { script_json: JSON.stringify(script), title: script.title, saga, status: "drawing" });
  }

  // Panel 1 is the reference for panels 2 to 4, which keeps the hero looking the same.
  let first: string | null = null;
  for (let n = 0; n < 4; n++) {
    const saved = getBlob(ep.user_id, panelKey(ep.id, n));
    if (saved) {
      if (n === 0) first = `data:${saved.mime};base64,${saved.bytes.toString("base64")}`;
      continue;
    }
    const { png, trace } = await drawPanel(panelPrompt(script.panels[n].scene, character, ep.feeling), first ? [first] : []);
    addTrace(ep.id, `panel ${n + 1}`, trace);
    const mime = imageMime(png);
    putBlob(ep.user_id, panelKey(ep.id, n), mime, png);
    if (n === 0) first = `data:${mime};base64,${png.toString("base64")}`;
  }

  updateEpisode(ep.id, { status: "draft", error: null });
  enqueue("episode.notify", ep.id);
}

const MOTION: Record<Feeling, string> = {
  wonder: "slow drifting light and a gentle floating motion",
  joy: "bright shimmering light and a soft bounce",
  calm: "slow breathing movement and soft ripples",
  confused: "a slow swirl, shapes quietly shifting",
  scared: "flickering shadows and a slow push in",
  sad: "slow falling light and a gentle drift",
};

// One clip per dream, for the newest painted one only.
export async function startLivingPortrait(userId: string) {
  const dream = getDb()
    .prepare("SELECT * FROM dreams WHERE user_id = ? AND created_at >= ? AND status IN ('painted', 'storing', 'done') ORDER BY created_at DESC LIMIT 1")
    .get(userId, now() - DAY_MS) as Dream | undefined;
  if (!dream || dream.video_state) return;
  if (spentTodayUsd(userId) + VIDEO_USD > DAILY_BUDGET_USD) return;
  const portrait = getBlob(userId, `dream/${dream.id}/portrait`);
  if (!portrait) return;
  const feeling = (dream.feeling ?? dream.suggested_feeling ?? "wonder") as Feeling;
  const prompt = `Animate this painting with ${MOTION[feeling] ?? MOTION.wonder}. Keep its painted style and composition, the camera nearly still. No text.`;
  const { job, trace } = await submitVideo(prompt, `data:${portrait.mime};base64,${portrait.bytes.toString("base64")}`);
  addTrace(dream.id, "video", trace);
  updateDream(dream.id, { video_job: job.id, video_state: "rendering", video_at: now() });
  enqueue("dream.video", dream.id, 60_000);
}

// Job 'dream.video': look at the clip, download it when it's done, or look again in 30 seconds.
export async function pollLivingPortrait(dreamId: string) {
  const dream = getDream(dreamId);
  if (!dream?.video_job || dream.video_state !== "rendering") return;
  const { job, trace } = await pollVideo(dream.video_job);
  if (job.status === "completed") {
    putBlob(dream.user_id, `dream/${dream.id}/video`, "video/mp4", await downloadVideo(job.id));
    addTrace(dream.id, "video done", trace);
    updateDream(dream.id, { video_state: "done" });
  } else if (job.status === "failed" || now() - (dream.video_at ?? 0) > VIDEO_WAIT_MS) {
    updateDream(dream.id, { video_state: "failed" });
    console.warn(`[nightly] living portrait for ${dream.id} stopped: ${job.error?.message ?? job.status}`);
  } else {
    enqueue("dream.video", dream.id, 30_000);
  }
}

// Job 'episode.notify'. Like every notice, it says nothing about the dream.
export async function notifyEpisode(episodeId: string) {
  const ep = getEpisode(episodeId);
  if (ep) await notify(ep.user_id, { title: "Last night's comic is waiting", body: "Approve it or let it go.", url: `/episode/${ep.id}`, tag: ep.id });
}

// Why tonight's comic can't be made yet, in words for the dreamer, or null if it can.
export function nightBlocker(userId: string): string | null {
  const db = getDb();
  if (db.prepare("SELECT 1 FROM episodes WHERE user_id = ? AND day = ? AND status IN ('draft', 'published')").get(userId, utcDay()))
    return "Tonight's comic is already made.";
  const recent = db.prepare("SELECT status FROM dreams WHERE user_id = ? AND created_at >= ? AND tags_json IS NOT NULL").all(userId, now() - DAY_MS) as { status: string }[];
  if (!recent.some((d) => SHOWN[d.status])) return "Tell a dream first. Tonight's comic is made from your newest painted dream.";
  if (spentTodayUsd(userId) + EPISODE_USD > DAILY_BUDGET_USD) return "Today's 0G credit is nearly used up. The comic can be made after the reset at midnight UTC.";
  return null;
}

// The demo button, and a dreamer's own "make tonight's comic now".
export function startNight(userId: string) {
  if (!hasOpenJob(userId, ["night.run"])) enqueue("night.run", userId);
}

// Called by the worker every minute: during the night hour, queue one run per opted-in dreamer.
export function scheduleNights(at = new Date()) {
  if (at.getUTCHours() !== NIGHT_HOUR_UTC) return;
  const day = utcDay(at.getTime());
  const due = getDb().prepare("SELECT id FROM users WHERE nightly = 1 AND (last_night IS NULL OR last_night < ?)").all(day) as { id: string }[];
  for (const { id } of due) {
    getDb().prepare("UPDATE users SET last_night = ? WHERE id = ?").run(day, id);
    startNight(id);
  }
}
