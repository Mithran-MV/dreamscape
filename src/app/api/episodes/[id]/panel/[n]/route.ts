// Decrypts one comic panel for its owner only.
import { getBlob } from "@/lib/server/dreams";
import { getEpisode, panelKey } from "@/lib/server/nightly";
import { currentUser } from "@/lib/server/session";

export async function GET(_request: Request, ctx: RouteContext<"/api/episodes/[id]/panel/[n]">) {
  const { id, n } = await ctx.params;
  const index = Number(n);
  const user = await currentUser();
  const ep = getEpisode(id);
  if (!Number.isInteger(index) || index < 0 || index > 3 || !user || !ep || ep.user_id !== user.id) return new Response("Not found", { status: 404 });
  const blob = getBlob(user.id, panelKey(id, index));
  if (!blob) return new Response("Not ready", { status: 404 });
  return new Response(new Uint8Array(blob.bytes), {
    headers: {
      "Content-Type": blob.mime,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
