import { listEpisodes } from "@/lib/server/nightly";
import { currentUser } from "@/lib/server/session";

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const episodes = listEpisodes(user.id)
    .filter((e) => e.status !== "discarded")
    .map((e) => ({ id: e.id, day: e.day, status: e.status, title: e.title, saga: e.saga, feeling: e.feeling, error: e.error }));
  return Response.json({ episodes });
}
