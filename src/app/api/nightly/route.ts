import { getDb } from "@/lib/server/db";
import { spentTodayUsd, startNight } from "@/lib/server/nightly";
import { currentUser } from "@/lib/server/session";

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const row = getDb().prepare("SELECT nightly FROM users WHERE id = ?").get(user.id) as { nightly: number };
  return Response.json({ optedIn: row.nightly === 1, spentTodayUsd: spentTodayUsd(user.id) });
}

// "run" makes tonight's comic now (the demo button); "opt-in" and "opt-out" set the nightly run.
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { action } = (await request.json().catch(() => ({}))) as { action?: string };
  if (action === "run") startNight(user.id);
  else if (action === "opt-in" || action === "opt-out") getDb().prepare("UPDATE users SET nightly = ? WHERE id = ?").run(action === "opt-in" ? 1 : 0, user.id);
  else return Response.json({ error: "Unknown action." }, { status: 400 });
  return Response.json({ ok: true });
}
