// A reveal's own painting (the dream cast, the self-portrait), for its owner only.
import { revealImage } from "@/lib/server/memories";
import { currentUser } from "@/lib/server/session";

export async function GET(_request: Request, ctx: RouteContext<"/api/memories/[id]/image">) {
  const user = await currentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  const { id } = await ctx.params;
  const blob = revealImage(user.id, id);
  if (!blob) return new Response("Not found.", { status: 404 });
  return new Response(new Uint8Array(blob.bytes), { headers: { "Content-Type": blob.mime, "Cache-Control": "private, max-age=86400" } });
}
