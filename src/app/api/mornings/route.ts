// The morning star and the memories row. GET reads them; POST lights today's star with a feeling or
// "nothing this time" (telling a dream lights it on its own).
import { keepMorning, memoriesFor, morningState, startDueReveals } from "@/lib/server/memories";
import { currentUser } from "@/lib/server/session";

function read(userId: string) {
  startDueReveals(userId);
  return { ...morningState(userId), memories: memoriesFor(userId) };
}

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  return Response.json(read(user.id));
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { kind, feeling } = (await request.json().catch(() => ({}))) as { kind?: string; feeling?: string };
  if (kind !== "feeling" && kind !== "nothing") return Response.json({ error: "Pick a feeling, or nothing this time." }, { status: 400 });
  if (kind === "feeling" && !feeling) return Response.json({ error: "Pick a feeling." }, { status: 400 });
  keepMorning(user.id, kind, kind === "feeling" ? (feeling ?? null) : null);
  return Response.json(read(user.id));
}
