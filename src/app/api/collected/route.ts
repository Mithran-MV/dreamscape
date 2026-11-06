import { getDb } from "@/lib/server/db";
import { heldEditions } from "@/lib/server/market";
import { currentUser } from "@/lib/server/session";

// The editions the signed-in dreamer's wallet holds right now.
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { wallet } = getDb().prepare("SELECT wallet FROM users WHERE id = ?").get(user.id) as { wallet: string | null };
  return Response.json({ editions: wallet ? await heldEditions(wallet) : [] });
}
