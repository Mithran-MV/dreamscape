import { agentDetails } from "@/lib/server/vendor";

// One vendor agent, read from its own resolver on ENS: who it pays, what it says, what it charges.
export async function GET(_request: Request, ctx: RouteContext<"/api/agents/[label]">) {
  const { label } = await ctx.params;
  if (!/^[a-z0-9-]{3,32}$/.test(label)) return Response.json({ error: "Not found." }, { status: 404 });
  try {
    const agent = await agentDetails(label);
    return agent ? Response.json(agent) : Response.json({ error: "Not found." }, { status: 404 });
  } catch {
    return Response.json({ error: "ENS can't be reached right now. Try again in a moment." }, { status: 503 });
  }
}
