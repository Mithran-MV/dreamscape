// A dream portrait for a visitor with the whole-gallery scope, checked on ENS and Arkiv and decrypted here.
import { currentUser } from "@/lib/server/session";
import { checkVisit, visitorPortrait } from "@/lib/server/visits";

export async function GET(_request: Request, ctx: RouteContext<"/api/g/[handle]/dream/[id]">) {
  const { handle, id } = await ctx.params;
  const user = await currentUser();
  if (!user) return new Response("Not found", { status: 404 });
  const access = await checkVisit(user.id, handle).catch(() => null);
  const blob = access?.inside ? visitorPortrait(access, id) : undefined;
  if (!blob) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(blob.bytes), {
    headers: {
      "Content-Type": blob.mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
