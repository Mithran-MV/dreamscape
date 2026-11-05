// One panel of a hung comic for a visitor, checked on ENS and Arkiv and decrypted here.
import { currentUser } from "@/lib/server/session";
import { checkVisit, visitorPanel } from "@/lib/server/visits";

export async function GET(_request: Request, ctx: RouteContext<"/api/g/[handle]/panel/[id]/[n]">) {
  const { handle, id, n } = await ctx.params;
  const user = await currentUser();
  if (!user) return new Response("Not found", { status: 404 });
  const access = await checkVisit(user.id, handle).catch(() => null);
  const blob = access?.inside ? visitorPanel(access, id, Number(n)) : undefined;
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
