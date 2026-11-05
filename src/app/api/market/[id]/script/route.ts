// A comic's words, for the dreamer and edition holders, so the app can letter the full page.
import { getDb } from "@/lib/server/db";
import { getPiece, holdsEdition } from "@/lib/server/market";
import { getEpisode } from "@/lib/server/nightly";
import { currentUser } from "@/lib/server/session";

export async function GET(_request: Request, ctx: RouteContext<"/api/market/[id]/script">) {
  const { id } = await ctx.params;
  const piece = getPiece(id);
  const user = await currentUser();
  if (!piece || piece.kind !== "episode" || !user) return Response.json({ error: "Not found." }, { status: 404 });
  const { wallet } = getDb().prepare("SELECT wallet FROM users WHERE id = ?").get(user.id) as { wallet: string | null };
  if (user.id !== piece.user_id && !(await holdsEdition(piece, wallet))) return Response.json({ error: "Not found." }, { status: 404 });
  const script = getEpisode(piece.ref)?.script_json;
  return script ? new Response(script, { headers: { "Content-Type": "application/json" } }) : Response.json({ error: "Not found." }, { status: 404 });
}
