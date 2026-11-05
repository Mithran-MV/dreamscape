import { getDb, utcDay } from "@/lib/server/db";
import { currentUser } from "@/lib/server/session";
import { cleanCircle, latestWorldDream, MIN_DREAMERS, startWorld, WORLD, worldCounts, worldSentence, type WorldDream } from "@/lib/server/world";

const NAMES: Record<string, string> = { "ethglobal-mumbai": "ETHGlobal Mumbai" };
const circleName = (code: string) => NAMES[code] ?? code;

function summary(wd: WorldDream | undefined, name?: string) {
  if (!wd) return null;
  const counts = JSON.parse(wd.counts_json);
  return { id: wd.id, day: wd.day, sentence: worldSentence(counts, name), themes: counts.themes, feeling: counts.feeling, dreamers: counts.dreamers };
}

async function circleOf() {
  const user = await currentUser();
  if (!user) return { user: null, circle: null };
  const row = getDb().prepare("SELECT circle FROM users WHERE id = ?").get(user.id) as { circle: string | null };
  return { user, circle: row.circle };
}

// The latest World Dream, and the dreamer's own circle with how many have dreamed in it today.
export async function GET() {
  const { circle } = await circleOf();
  return Response.json({
    world: summary(latestWorldDream(WORLD)),
    circle: circle
      ? { code: circle, name: circleName(circle), latest: summary(latestWorldDream(circle), circleName(circle)), today: worldCounts(utcDay(), circle).dreamers, needed: MIN_DREAMERS }
      : null,
  });
}

// join or leave a circle, or paint the circle's dream now (the demo button).
export async function POST(request: Request) {
  const { user, circle } = await circleOf();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { action, code } = (await request.json().catch(() => ({}))) as { action?: string; code?: string };
  if (action === "join") {
    const clean = cleanCircle(code ?? "");
    if (clean.length < 3 || clean === WORLD) return Response.json({ error: "Use a circle code of at least 3 letters, digits or dashes." }, { status: 400 });
    getDb().prepare("UPDATE users SET circle = ? WHERE id = ?").run(clean, user.id);
  } else if (action === "leave") {
    getDb().prepare("UPDATE users SET circle = NULL WHERE id = ?").run(user.id);
  } else if (action === "paint") {
    if (!circle) return Response.json({ error: "Join a circle first." }, { status: 409 });
    const today = worldCounts(utcDay(), circle);
    if (!today.themes.length) return Response.json({ error: `A theme needs ${MIN_DREAMERS} dreamers before it can be painted. ${today.dreamers} so far today.` }, { status: 409 });
    startWorld(utcDay(), circle);
  } else {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }
  return Response.json({ ok: true });
}
