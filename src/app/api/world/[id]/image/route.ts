// World Dream paintings are public: they're made from shared themes only.
import { getBlob } from "@/lib/server/dreams";
import { getDb } from "@/lib/server/db";
import { WORLD_OWNER, worldImageKey } from "@/lib/server/world";

export async function GET(_request: Request, ctx: RouteContext<"/api/world/[id]/image">) {
  const { id } = await ctx.params;
  const known = getDb().prepare("SELECT 1 FROM world_dreams WHERE id = ? AND status = 'done'").get(id);
  const blob = known ? getBlob(WORLD_OWNER, worldImageKey(id)) : undefined;
  if (!blob) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(blob.bytes), {
    headers: { "Content-Type": blob.mime, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" },
  });
}
