import { getDream, tracesFor } from "@/lib/server/dreams";
import { currentUser } from "@/lib/server/session";
import { storageExplorer } from "@/lib/server/zerog/storage";
import { txLink } from "@/lib/server/registry";
import { noteLog, notesFor } from "@/lib/server/notes";
import { dayRecordProof } from "@/lib/server/names";

export async function GET(_request: Request, ctx: RouteContext<"/api/dreams/[id]">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  const dream = getDream(id);
  if (!user || !dream || dream.user_id !== user.id) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({
    id: dream.id,
    day: dream.day,
    createdAt: dream.created_at,
    status: dream.status,
    error: dream.error,
    inputKind: dream.input_kind,
    transcript: dream.transcript,
    note: dream.note,
    title: dream.title,
    tags: dream.tags_json ? JSON.parse(dream.tags_json) : null,
    feeling: dream.feeling,
    suggestedFeeling: dream.suggested_feeling,
    saga: dream.saga,
    video: dream.video_state,
    notes: notesFor(noteLog(user.id), dream.id).slice(0, 3),
    proof: {
      traces: tracesFor(dream.id),
      storage: [
        ["voice", dream.voice_root],
        ["portrait", dream.portrait_root],
        ["record", dream.record_root],
      ]
        .filter(([, root]) => root)
        .map(([what, root]) => ({ what, root, link: storageExplorer(root as string) })),
      registry: dream.registry_tx ? { id: dream.registry_id, tx: dream.registry_tx, link: txLink(dream.registry_tx) } : null,
      ens: await dayRecordProof(user.handle, dream.day, dream.ens_tx, dream.record_root),
    },
  });
}
