// Decrypts a dream's portrait or voice note for its owner only. Keys never leave the server.
import { getBlob, getDream } from "@/lib/server/dreams";
import { currentUser } from "@/lib/server/session";

const KINDS = new Set(["portrait", "voice"]);

export async function GET(_request: Request, ctx: RouteContext<"/api/dreams/[id]/media/[kind]">) {
  const { id, kind } = await ctx.params;
  const user = await currentUser();
  const dream = getDream(id);
  if (!KINDS.has(kind) || !user || !dream || dream.user_id !== user.id) return new Response("Not found", { status: 404 });
  const blob = getBlob(user.id, `dream/${id}/${kind}`);
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
