import { fileResponse, fullFile } from "@/lib/server/market-files";

export async function GET(_request: Request, ctx: RouteContext<"/api/market/[id]/panel/[n]">) {
  const { id, n } = await ctx.params;
  const index = Number(n);
  if (!Number.isInteger(index) || index < 0 || index > 3) return new Response("Not found", { status: 404 });
  return fileResponse(await fullFile(id, index));
}
