import { currentUser } from "@/lib/server/session";
import { grantPassTo, passesView } from "@/lib/server/visits";

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  return Response.json(passesView(user.id));
}

// Grant a pass to another dreamer by handle. Registering it on ENS runs in the worker.
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { handle, scope } = (await request.json().catch(() => ({}))) as { handle?: unknown; scope?: unknown };
  const result = grantPassTo(user.id, String(handle ?? ""), String(scope ?? ""));
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result, { status: 201 });
}
