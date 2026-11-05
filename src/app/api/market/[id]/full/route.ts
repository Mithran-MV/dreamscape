import { fileResponse, fullFile } from "@/lib/server/market-files";

export async function GET(_request: Request, ctx: RouteContext<"/api/market/[id]/full">) {
  const { id } = await ctx.params;
  return fileResponse(await fullFile(id, "portrait"));
}
