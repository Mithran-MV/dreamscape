import { createDream, FEELINGS, listDreams, putBlob, type Feeling } from "@/lib/server/dreams";
import { enqueue } from "@/lib/server/jobs";
import { noteLog, notesFor } from "@/lib/server/notes";
import { currentUser } from "@/lib/server/session";

const MAX_AUDIO = 10 * 1024 * 1024;
const AUDIO_TYPES = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/x-m4a", "audio/aac"]);

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const dreams = listDreams(user.id).map((d) => ({
    id: d.id,
    day: d.day,
    createdAt: d.created_at,
    status: d.status,
    title: d.title,
    feeling: d.feeling ?? d.suggested_feeling,
    stored: Boolean(d.portrait_root),
    anchored: Boolean(d.registry_tx),
    moving: d.video_state === "done",
  }));
  const log = noteLog(user.id);
  const notes = log.length ? notesFor(log, log[log.length - 1].id).slice(0, 2) : [];
  return Response.json({ dreams, notes });
}

// A voice note (field "audio"), a line of text (field "text"), or both, plus an optional feeling.
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const form = await request.formData();
  const audio = form.get("audio");
  const text = String(form.get("text") ?? "").trim().slice(0, 2000);
  const feelingRaw = String(form.get("feeling") ?? "");
  const feeling = (FEELINGS as readonly string[]).includes(feelingRaw) ? (feelingRaw as Feeling) : null;

  if (audio instanceof File && audio.size > 0) {
    if (audio.size > MAX_AUDIO) return Response.json({ error: "That voice note is too long." }, { status: 413 });
    const mime = (audio.type || "audio/webm").split(";")[0].trim().toLowerCase();
    if (!AUDIO_TYPES.has(mime)) return Response.json({ error: "That isn't an audio recording." }, { status: 415 });
    const id = createDream(user.id, "voice", feeling, null, text.length ? text : null);
    putBlob(user.id, `dream/${id}/voice`, mime, new Uint8Array(await audio.arrayBuffer()));
    enqueue("dream.paint", id);
    return Response.json({ id }, { status: 201 });
  }
  if (text.length >= 3) {
    const id = createDream(user.id, "text", feeling, text);
    enqueue("dream.paint", id);
    return Response.json({ id }, { status: 201 });
  }
  return Response.json({ error: "Tell the dream in a voice note or a line of text." }, { status: 400 });
}
