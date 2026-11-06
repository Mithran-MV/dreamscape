import { connectSession, zeroGAccount, zeroGSignIn } from "@/lib/server/zerog/account";
import { sessionSetCookie, signInWithPrivy } from "@/lib/server/session";

// "Sign in with 0G", the only way in. 0G checks the token and names the account's wallet, which gets the
// dreamer's ENS name and pays in the market. A new dreamer sends a handle on the second call. On the way
// in, a key on their 0G account is made once, so their own iAI credit pays for their dreams.
export async function POST(request: Request) {
  const { token, handle } = (await request.json().catch(() => ({}))) as { token?: string; handle?: string };
  if (!token) return Response.json({ error: "Sign in with 0G first." }, { status: 400 });
  const session = await zeroGSignIn(token);
  if ("error" in session) return Response.json({ error: session.error }, { status: 401 });
  if (!session.wallet) return Response.json({ error: "Your 0G account has no wallet yet. Open pc.0g.ai once to make it, then sign in again." }, { status: 409 });

  const result = signInWithPrivy(session.privyId, session.wallet, handle);
  if ("needsHandle" in result) return Response.json({ needsHandle: true });
  if ("error" in result) return Response.json({ error: result.error }, { status: 409 });

  const linked = zeroGAccount(result.id);
  const connected = linked.connected && !linked.error ? linked : await connectSession(result.id, session);
  const res = Response.json({ ok: true, zeroG: "error" in connected ? { connected: false, error: connected.error } : connected });
  res.headers.append("Set-Cookie", sessionSetCookie(result.id));
  return res;
}
