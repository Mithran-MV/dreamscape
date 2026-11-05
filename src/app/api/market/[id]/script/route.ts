// A comic's words, for the dreamer and edition holders, so the app can letter the full page.
import { getDb } from "@/lib/server/db";
import { getPiece, holdsEdition } from "@/lib/server/market";
import { getEpisode, type Script } from "@/lib/server/nightly";
import { currentUser } from "@/lib/server/session";

export async function GET(_request: Request, ctx: RouteContext<"/api/market/[id]/script">) {
  const { id } = await ctx.params;
  const piece = getPiece(id);
  const user = await currentUser();
  if (!piece || piece.kind !== "episode" || !user) return Response.json({ error: "Not found." }, { status: 404 });
  const { wallet } = getDb().prepare("SELECT wallet FROM users WHERE id = ?").get(user.id) as { wallet: string | null };
  if (user.id !== piece.user_id && !(await holdsEdition(piece, wallet))) return Response.json({ error: "Not found." }, { status: 404 });
  const raw = getEpisode(piece.ref)?.script_json;
  if (!raw) return Response.json({ error: "Not found." }, { status: 404 });
  // Holders get only the words on the page. The panel scenes describe the dream itself, so they stay with its dreamer.
  const script = JSON.parse(raw) as Script;
  if (user.id === piece.user_id) return Response.json(script);
  return Response.json({ title: script.title, panels: script.panels.map((p) => ({ dialogue: p.dialogue, caption: p.caption })) });
}
