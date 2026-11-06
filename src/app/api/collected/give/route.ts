import { getDb } from "@/lib/server/db";
import { giveTx } from "@/lib/server/market";
import { currentUser } from "@/lib/server/session";

// Spells out the transfer that gives one of your editions to a friend; your own wallet sends it.
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { wallet } = getDb().prepare("SELECT wallet FROM users WHERE id = ?").get(user.id) as { wallet: string | null };
  if (!wallet) return Response.json({ error: "Your gallery has no wallet yet." }, { status: 409 });
  const { pieceId, editionNo, to } = (await request.json().catch(() => ({}))) as { pieceId?: string; editionNo?: number; to?: string };
  if (!pieceId || !Number.isInteger(editionNo) || !to?.trim()) return Response.json({ error: "Say which edition, and who it's for." }, { status: 400 });
  const result = await giveTx(wallet, pieceId, editionNo as number, to);
  if ("error" in result) return Response.json({ error: result.error }, { status: 409 });
  return Response.json(result);
}
