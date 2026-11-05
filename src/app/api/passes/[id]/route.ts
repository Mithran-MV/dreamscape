// One pass the dreamer granted: try a failed grant again, get the revoke for their wallet to send, then confirm it on ENS.
import { currentUser } from "@/lib/server/session";
import { confirmRevoke, retryGrant, revokeTxFor } from "@/lib/server/visits";

export async function POST(request: Request, ctx: RouteContext<"/api/passes/[id]">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { action, hash } = (await request.json().catch(() => ({}))) as { action?: string; hash?: unknown };
  try {
    const result =
      action === "retry"
        ? retryGrant(user.id, id)
        : action === "revoke"
          ? await revokeTxFor(user.id, id)
          : action === "revoked"
            ? await confirmRevoke(user.id, id, typeof hash === "string" ? hash : undefined)
            : { error: "Unknown action.", status: 400 };
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result);
  } catch (error) {
    console.error(`[passes] ${action} ${id}: ${(error as Error).message.slice(0, 200)}`);
    return Response.json({ error: "Couldn't reach ENS just now. Try again." }, { status: 503 });
  }
}
