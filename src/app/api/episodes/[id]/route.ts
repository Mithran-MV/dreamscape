import { tracesFor } from "@/lib/server/dreams";
import { getEpisode, updateEpisode } from "@/lib/server/nightly";
import { currentUser } from "@/lib/server/session";

async function owned(ctx: RouteContext<"/api/episodes/[id]">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  const ep = getEpisode(id);
  return user && ep && ep.user_id === user.id ? ep : null;
}

export async function GET(_request: Request, ctx: RouteContext<"/api/episodes/[id]">) {
  const ep = await owned(ctx);
  if (!ep) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({
    id: ep.id,
    day: ep.day,
    status: ep.status,
    error: ep.error,
    title: ep.title,
    saga: ep.saga,
    feeling: ep.feeling,
    script: ep.script_json ? JSON.parse(ep.script_json) : null,
    dreamIds: JSON.parse(ep.dream_ids),
    traces: tracesFor(ep.id),
  });
}

// The morning choice: publish the draft to the gallery, or let it go.
export async function POST(request: Request, ctx: RouteContext<"/api/episodes/[id]">) {
  const ep = await owned(ctx);
  if (!ep) return Response.json({ error: "Not found." }, { status: 404 });
  const { action } = (await request.json().catch(() => ({}))) as { action?: string };
  if (action !== "publish" && action !== "discard") return Response.json({ error: "Unknown action." }, { status: 400 });
  if (ep.status !== "draft") return Response.json({ error: "Only a draft can be published or discarded." }, { status: 409 });
  updateEpisode(ep.id, { status: action === "publish" ? "published" : "discarded" });
  return Response.json({ ok: true });
}
