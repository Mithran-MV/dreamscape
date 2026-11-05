import { getDream } from "@/lib/server/dreams";
import { restartDream } from "@/lib/server/pipeline";
import { currentUser } from "@/lib/server/session";

// Try a failed dream again, for example once a missing key has been added.
export async function POST(_request: Request, ctx: RouteContext<"/api/dreams/[id]/retry">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  const dream = getDream(id);
  if (!user || !dream || dream.user_id !== user.id) return Response.json({ error: "Not found." }, { status: 404 });
  if (dream.status !== "failed") return Response.json({ error: "This dream hasn't failed." }, { status: 409 });
  restartDream(dream);
  return Response.json({ ok: true });
}
