// A visitor's view of someone's gallery. Inside a live visit it returns only the pass's slice; otherwise where they stand.
import { currentUser } from "@/lib/server/session";
import { checkVisit, visitorSlice } from "@/lib/server/visits";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, ctx: RouteContext<"/api/g/[handle]">) {
  const { handle } = await ctx.params;
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (user.handle === handle) return Response.json({ state: "own", handle });
  try {
    const access = await checkVisit(user.id, handle);
    if (!access.inside) return Response.json({ state: access.state, handle }, { headers: NO_STORE });
    return Response.json({ state: "inside", handle, scope: access.scope, endsAt: access.endsAt, visit: access.visit, now: Date.now(), ...visitorSlice(access) }, { headers: NO_STORE });
  } catch (error) {
    console.error(`[visit] ${handle}: ${(error as Error).message.slice(0, 200)}`);
    return Response.json({ error: "Couldn't check the visit just now. Try again." }, { status: 503 });
  }
}
