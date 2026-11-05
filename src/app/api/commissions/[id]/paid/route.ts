import type { Hex } from "viem";
import { getCommission, recordPayment } from "@/lib/server/commissions";
import { currentUser } from "@/lib/server/session";

// The buyer's browser reports its transaction; the server reads the receipt itself and trusts nothing else.
export async function POST(request: Request, ctx: RouteContext<"/api/commissions/[id]/paid">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  const c = getCommission(id);
  if (!user || !c || c.buyer_id !== user.id) return Response.json({ error: "Not found." }, { status: 404 });
  const { tx } = (await request.json().catch(() => ({}))) as { tx?: string };
  if (!tx || !/^0x[0-9a-fA-F]{64}$/.test(tx)) return Response.json({ error: "Send the payment transaction hash." }, { status: 400 });
  try {
    const result = await recordPayment(id, tx as Hex);
    return result.ok ? Response.json({ status: result.status }) : Response.json({ error: result.error }, { status: 409 });
  } catch {
    // The escrow is still on-chain; the status check finds it there once Sepolia answers.
    return Response.json({ error: "Sepolia is slow right now. Your payment will show up here in a moment." }, { status: 503 });
  }
}
