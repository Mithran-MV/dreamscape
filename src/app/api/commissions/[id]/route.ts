import { commissionView } from "@/lib/server/commissions";
import { currentUser } from "@/lib/server/session";

// Where a commission stands, for its buyer or whoever holds its name now.
export async function GET(_request: Request, ctx: RouteContext<"/api/commissions/[id]">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  try {
    const view = await commissionView(id, user?.id ?? null);
    return view ? Response.json(view) : Response.json({ error: "Not found." }, { status: 404 });
  } catch {
    return Response.json({ error: "Sepolia can't be reached right now. Try again in a moment." }, { status: 503 });
  }
}
