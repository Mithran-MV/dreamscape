// The morning star and the memories row. GET reads them (and notes the browser's time zone, for the
// morning notice); POST lights today's star with a feeling or "nothing this time" (telling a dream
// lights it on its own), or hides or shows the stars.
import { keepMorning, memoriesFor, morningState, setStarsHidden, setTimezone, startDueReveals } from "@/lib/server/memories";
import { currentUser } from "@/lib/server/session";
import { setSagaTonight } from "@/lib/server/ainote";

function read(userId: string) {
  startDueReveals(userId);
  return { ...morningState(userId), memories: memoriesFor(userId) };
}

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const tz = new URL(request.url).searchParams.get("tz");
  if (tz !== null) setTimezone(user.id, Number(tz));
  return Response.json(read(user.id));
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { kind, feeling, hide, saga } = (await request.json().catch(() => ({}))) as { kind?: string; feeling?: string; hide?: boolean; saga?: string };
  if (typeof saga === "string") {
    if (!setSagaTonight(user.id, saga)) return Response.json({ error: "Pick one of your dream's themes." }, { status: 400 });
    return Response.json({ sagaTonight: saga });
  }
  if (typeof hide === "boolean") {
    setStarsHidden(user.id, hide);
    return Response.json(read(user.id));
  }
  if (kind !== "feeling" && kind !== "nothing") return Response.json({ error: "Pick a feeling, or nothing this time." }, { status: 400 });
  if (kind === "feeling" && !feeling) return Response.json({ error: "Pick a feeling." }, { status: 400 });
  keepMorning(user.id, kind, kind === "feeling" ? (feeling ?? null) : null);
  return Response.json(read(user.id));
}
