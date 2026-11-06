import type { Hex } from "viem";
import { getDb } from "@/lib/server/db";
import { editionName, getPiece, recordPurchase } from "@/lib/server/market";

// The buyer's browser reports its transaction; the server reads the receipt itself and trusts nothing else.
export async function POST(request: Request, ctx: RouteContext<"/api/market/[id]/bought">) {
  const { id } = await ctx.params;
  const piece = getPiece(id);
  if (!piece) return Response.json({ error: "Not found." }, { status: 404 });
  const { tx } = (await request.json().catch(() => ({}))) as { tx?: string };
  if (!tx || !/^0x[0-9a-fA-F]{64}$/.test(tx)) return Response.json({ error: "Send the purchase transaction hash." }, { status: 400 });
  const sold = await recordPurchase(piece.id, tx as Hex).catch(() => null);
  if (!sold) return Response.json({ error: "That transaction isn't on Sepolia yet. Try again in a moment." }, { status: 404 });
  if (!sold.length) return Response.json({ error: "That transaction didn't buy this piece." }, { status: 409 });
  const { handle } = getDb().prepare("SELECT handle FROM users WHERE id = ?").get(piece.user_id) as { handle: string };
  return Response.json({ editions: sold.map((s) => ({ editionNo: s.editionNo, name: editionName(s.label, handle) })) });
}
