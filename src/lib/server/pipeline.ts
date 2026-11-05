// The morning pipeline. Job 'dream.paint' turns a dream into a portrait fast; job 'dream.store'
// then encrypts everything onto 0G Storage and anchors it, retrying until the chain side works.
import { addTrace, FEELINGS, getBlob, getDream, putBlob, THEMES, updateDream, type Dream, type Feeling } from "./dreams";
import { chatJson, paint, transcribe } from "./zerog/router";
import { putEncrypted } from "./zerog/storage";
import { dreamerKey } from "./crypto";
import { enqueue, hasOpenJob } from "./jobs";
import { anchorDream } from "./registry";
import { notify } from "./push";

export type Tags = {
  title: string;
  themes: string[];
  people: string[];
  places: string[];
  objects: string[];
  feeling: Feeling;
  scene: string;
};

const TAG_SYSTEM = `You tag dream reports for a private dream gallery.
Never interpret what a dream means, never diagnose, never give advice.
Return only a JSON object with these keys:
- "title": 2 to 6 words, evocative, no quotes
- "themes": up to 4 values chosen only from: ${THEMES.join(", ")}
- "people", "places", "objects": short lowercase phrases taken from the dream, at most 5 each
- "feeling": exactly one of: ${FEELINGS.join(", ")}
- "scene": one vivid visual description for a painter, 25 to 60 words, present tense, no names of real people, no text or lettering in the scene`;

const SPOT_COLOR: Record<Feeling, string> = {
  wonder: "luminous blue",
  joy: "warm gold",
  calm: "soft teal",
  confused: "violet",
  scared: "deep coral red",
  sad: "dusky indigo",
};

export function portraitPrompt(scene: string, feeling: Feeling) {
  return `A dreamlike painterly portrait, rich oil paint texture, soft glowing light, gentle surreal atmosphere, palette leaning toward ${SPOT_COLOR[feeling]}. ${scene} No text, no letters, no signature, no watermark, no border.`;
}

function cleanTags(raw: Partial<Tags>, fallbackFeeling: Feeling): Tags {
  const list = (v: unknown, max: number) =>
    (Array.isArray(v) ? v : []).map((x) => String(x).toLowerCase().trim()).filter(Boolean).slice(0, max);
  const feeling = FEELINGS.includes(raw.feeling as Feeling) ? (raw.feeling as Feeling) : fallbackFeeling;
  return {
    title: String(raw.title ?? "Untitled dream").replace(/["“”]/g, "").slice(0, 60),
    themes: list(raw.themes, 4).filter((t) => (THEMES as readonly string[]).includes(t)),
    people: list(raw.people, 5),
    places: list(raw.places, 5),
    objects: list(raw.objects, 5),
    feeling,
    scene: String(raw.scene ?? "").slice(0, 600),
  };
}

// Step 1: words, tags and the portrait. Each sub-step is skipped if a previous attempt finished it.
export async function paintDream(dreamId: string) {
  let dream = mustGet(dreamId);

  if (!dream.transcript && dream.input_kind === "voice") {
    updateDream(dreamId, { status: "transcribing" });
    const voice = getBlob(dream.user_id, `dream/${dreamId}/voice`);
    if (!voice) throw new Error("Voice note missing from the cache.");
    const { text, trace } = await transcribe(voice.bytes, voice.mime);
    addTrace(dreamId, "transcribe", trace);
    if (!text) throw new Error("Transcription came back empty.");
    updateDream(dreamId, { transcript: text });
    dream = mustGet(dreamId);
  }

  if (!dream.tags_json) {
    updateDream(dreamId, { status: "tagging" });
    const { value, trace } = await chatJson<Partial<Tags>>(TAG_SYSTEM, `Dream report:\n"""${dream.transcript}"""`);
    addTrace(dreamId, "tag", trace);
    const tags = cleanTags(value, (dream.feeling as Feeling) ?? "wonder");
    updateDream(dreamId, { tags_json: JSON.stringify(tags), title: tags.title, scene: tags.scene, suggested_feeling: tags.feeling });
    dream = mustGet(dreamId);
  }

  if (!getBlob(dream.user_id, `dream/${dreamId}/portrait`)) {
    updateDream(dreamId, { status: "painting" });
    const feeling = (dream.feeling as Feeling) ?? (dream.suggested_feeling as Feeling) ?? "wonder";
    const { png, trace } = await paint(portraitPrompt(dream.scene ?? dream.transcript ?? "", feeling));
    addTrace(dreamId, "portrait", trace);
    putBlob(dream.user_id, `dream/${dreamId}/portrait`, "image/png", png);
  }

  updateDream(dreamId, { status: "painted", error: null });
  enqueue("dream.store", dreamId);
  enqueue("dream.notify", dreamId);
}

// Puts a failed dream back in the queue from the step it stopped at. Finished steps are skipped.
export function restartDream(dream: Dream) {
  if (hasOpenJob(dream.id, ["dream.paint", "dream.store"])) return;
  const painted = !!getBlob(dream.user_id, `dream/${dream.id}/portrait`);
  updateDream(dream.id, { status: painted ? "painted" : "queued", error: null });
  enqueue(painted ? "dream.store" : "dream.paint", dream.id);
}

// Step 1b: tell the dreamer's phone the painting is up. The notice says nothing about the dream itself.
export async function notifyPainted(dreamId: string) {
  const dream = mustGet(dreamId);
  await notify(dream.user_id, { title: "Your dream is on the wall", body: "Last night's painting is ready.", url: `/dream/${dreamId}`, tag: dreamId });
}

// Step 2: encrypted copies on 0G Storage, then one anchor on 0G Chain.
export async function storeDream(dreamId: string) {
  let dream = mustGet(dreamId);
  const key = dreamerKey(dream.user_id);

  if (dream.input_kind === "voice" && !dream.voice_root) {
    const voice = getBlob(dream.user_id, `dream/${dreamId}/voice`)!;
    updateDream(dreamId, { voice_root: (await putEncrypted(voice.bytes, key)).root });
  }
  if (!dream.portrait_root) {
    const portrait = getBlob(dream.user_id, `dream/${dreamId}/portrait`)!;
    updateDream(dreamId, { portrait_root: (await putEncrypted(portrait.bytes, key)).root });
  }
  dream = mustGet(dreamId);
  if (!dream.record_root) {
    const record = { id: dream.id, day: dream.day, transcript: dream.transcript, tags: JSON.parse(dream.tags_json ?? "{}"), feeling: dream.feeling, voiceRoot: dream.voice_root, portraitRoot: dream.portrait_root };
    updateDream(dreamId, { record_root: (await putEncrypted(Buffer.from(JSON.stringify(record)), key)).root });
  }

  dream = mustGet(dreamId);
  if (!dream.registry_tx) {
    const anchored = await anchorDream(dream);
    if (anchored) updateDream(dreamId, { registry_tx: anchored.tx, registry_id: anchored.id });
  }
  updateDream(dreamId, { status: "done", error: null });
  enqueue("dream.ens", dreamId);
}

function mustGet(id: string): Dream {
  const dream = getDream(id);
  if (!dream) throw new Error(`No dream ${id}`);
  return dream;
}
