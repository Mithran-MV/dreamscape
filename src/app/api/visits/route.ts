// The dreamer's door: knocks waiting and who is inside, and letting a knock in for 1 minute, 10 minutes, an hour,
// or any whole number of minutes up to a day.
import { currentUser } from "@/lib/server/session";
import { VISIT_LENGTHS, doorFor, letVisitorIn } from "@/lib/server/visits";

const MAX_MINUTES = 24 * 60;

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    return Response.json(await doorFor(user.id));
  } catch (error) {
    console.error(`[visits] door: ${(error as Error).message.slice(0, 200)}`);
    return Response.json({ error: "Couldn't reach Arkiv just now." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { knock, length, minutes } = (await request.json().catch(() => ({}))) as { knock?: unknown; length?: unknown; minutes?: unknown };
  const seconds =
    typeof minutes === "number" && Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_MINUTES
      ? minutes * 60
      : typeof length === "string" && Object.hasOwn(VISIT_LENGTHS, length)
        ? VISIT_LENGTHS[length as keyof typeof VISIT_LENGTHS]
        : undefined;
  if (typeof knock !== "string" || !seconds) return Response.json({ error: "Pick a knock and how long, from 1 minute to a day." }, { status: 400 });
  try {
    const result = await letVisitorIn(user.id, knock, seconds);
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error(`[visits] let in: ${(error as Error).message.slice(0, 200)}`);
    return Response.json({ error: "Couldn't open the door just now. Try again." }, { status: 503 });
  }
}
