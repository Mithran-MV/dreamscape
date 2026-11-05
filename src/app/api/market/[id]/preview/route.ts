// The low-resolution preview that anyone, and any app reading Arkiv, may see.
import { getPreview } from "@/lib/server/market";

export async function GET(_request: Request, ctx: RouteContext<"/api/market/[id]/preview">) {
  const { id } = await ctx.params;
  const blob = getPreview(id);
  if (!blob) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(blob.bytes), {
    headers: { "Content-Type": blob.mime, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" },
  });
}
