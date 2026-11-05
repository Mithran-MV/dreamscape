import { createDream, FEELINGS, listDreams, putBlob, type Feeling } from "@/lib/server/dreams";
import { enqueue } from "@/lib/server/jobs";
import { currentUser } from "@/lib/server/session";

const MAX_AUDIO = 10 * 1024 * 1024;

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
  }));
  return Response.json({ dreams });
}

// A voice note (field "audio") or one line of text (field "text"), plus an optional feeling.
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
    const id = createDream(user.id, "voice", feeling, null);
    putBlob(user.id, `dream/${id}/voice`, audio.type || "audio/webm", new Uint8Array(await audio.arrayBuffer()));
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
