import { commissionFile } from "@/lib/server/commissions";
import { fileResponse } from "@/lib/server/market-files";
import { currentUser } from "@/lib/server/session";

// The delivered piece, only for whoever holds its one-of-one name right now.
export async function GET(_request: Request, ctx: RouteContext<"/api/commissions/[id]/file">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  return fileResponse(await commissionFile(id, user?.id ?? null));
}
