// Sends a 0G Storage root to its page on the explorer. The file itself is encrypted; this only shows it's there.
import { fileSeq, submissionUrl } from "@/lib/server/zerog/storage";

export async function GET(_request: Request, ctx: RouteContext<"/api/storage/[root]">) {
  const { root } = await ctx.params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(root)) return new Response("Not a 0G Storage root.", { status: 400 });
  const seq = await fileSeq(root).catch(() => null);
  if (seq === null) return new Response("This file isn't on 0G Storage yet.", { status: 404 });
  return Response.redirect(submissionUrl(seq), 302);
}
