import { commissionsOf, commissionView, createCommission } from "@/lib/server/commissions";
import { currentUser } from "@/lib/server/session";

const ABANDONED_MS = 3600_000;

// The signed-in buyer's commissions with one agent, newest first. Requests never paid for drop out after an hour.
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ commissions: [] });
  const agent = new URL(request.url).searchParams.get("agent") ?? "";
  const rows = commissionsOf(user.id, agent).slice(0, 10);
  const views = await Promise.all(rows.map((c) => commissionView(c.id, user.id).catch(() => null)));
  const shown = views.filter((v, i) => v && (v.status !== "awaiting" || Date.now() - rows[i].created_at < ABANDONED_MS));
  return Response.json({ commissions: shown });
}

// Start a commission: the server checks the agent and its price on ENS, then returns the buyer's two transactions.
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { agent?: unknown; style?: unknown; note?: unknown };
  try {
    const result = await createCommission(user.id, { agent: String(body.agent ?? ""), style: body.style, note: body.note });
    if ("error" in result) return Response.json(result, { status: 409 });
    return Response.json(result, { status: 201 });
  } catch {
    return Response.json({ error: "The market can't be reached right now. Try again in a moment." }, { status: 503 });
  }
}
