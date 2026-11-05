// A pass holder knocks at a gallery. The dreamer's phone hears only that someone knocked.
import { currentUser } from "@/lib/server/session";
import { knockAt } from "@/lib/server/visits";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { handle } = (await request.json().catch(() => ({}))) as { handle?: unknown };
  if (typeof handle !== "string" || !handle) return Response.json({ error: "Whose gallery?" }, { status: 400 });
  try {
    const result = await knockAt(user.id, handle);
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error(`[visits] knock: ${(error as Error).message.slice(0, 200)}`);
    return Response.json({ error: "Couldn't knock just now. Try again." }, { status: 503 });
  }
}
