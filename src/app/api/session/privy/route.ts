import { privyIdentity } from "@/lib/server/privy";
import { sessionSetCookie, signInWithPrivy } from "@/lib/server/session";

// Swap a Privy access token for our session cookie. A new dreamer sends a handle on the second call.
export async function POST(request: Request) {
  const { token, handle } = (await request.json().catch(() => ({}))) as { token?: string; handle?: string };
  if (!token) return Response.json({ error: "Sign in first." }, { status: 400 });
  let identity;
  try {
    identity = await privyIdentity(token);
  } catch {
    return Response.json({ error: "That sign-in didn't check out. Sign in again." }, { status: 401 });
  }
  const result = signInWithPrivy(identity.privyId, identity.wallet, handle);
  if ("needsHandle" in result) return Response.json({ needsHandle: true, hasWallet: Boolean(identity.wallet) });
  if ("error" in result) return Response.json({ error: result.error }, { status: 409 });
  const res = Response.json({ ok: true, hasWallet: Boolean(identity.wallet) });
  res.headers.append("Set-Cookie", sessionSetCookie(result.id));
  return res;
}
