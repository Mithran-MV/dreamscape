// The dreamer's own 0G account. POST { token } connects it through "Sign in with 0G"; POST { key }
// connects a key pasted from pc.0g.ai; DELETE forgets the key. Either way, their iAI credit pays for their dreams.
import { connectWithKey, connectWithZeroG, disconnectZeroG, noteConnectFailure, zeroGAccount } from "@/lib/server/zerog/account";
import { currentUser } from "@/lib/server/session";

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  return Response.json(zeroGAccount(user.id));
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { token, key } = (await request.json().catch(() => ({}))) as { token?: string; key?: string };
  const result = token ? await connectWithZeroG(user.id, token) : key ? await connectWithKey(user.id, key) : { error: "Sign in with 0G, or paste a key." };
  // A connected account carries "connected"; a failure is only { error }.
  if (!("connected" in result)) {
    if (token) {
      console.warn(`[zerog] connect failed for ${user.id}: ${result.error}`);
      noteConnectFailure(user.id, result.error);
    }
    return Response.json(result, { status: 400 });
  }
  return Response.json(result);
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  disconnectZeroG(user.id);
  return Response.json(zeroGAccount(user.id));
}
