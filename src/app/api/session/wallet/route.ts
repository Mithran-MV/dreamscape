import { sessionSetCookie, signInWithPrivy } from "@/lib/server/session";
import { walletSignIn } from "@/lib/server/wallet-signin";

// The live site's way in, while 0G's sign-in works only on localhost: the dreamer's wallet, through
// Dreamscape's own Privy app. The same wallet opens the same gallery as "Sign in with 0G"; a new dreamer
// sends a handle on the second call.
export async function POST(request: Request) {
  const { token, handle } = (await request.json().catch(() => ({}))) as { token?: string; handle?: string };
  if (!token) return Response.json({ error: "Sign in with your wallet first." }, { status: 400 });
  const signedIn = await walletSignIn(token);
  if ("error" in signedIn) return Response.json({ error: signedIn.error }, { status: 401 });
  const result = signInWithPrivy(signedIn.privyId, signedIn.wallet, handle);
  if ("needsHandle" in result) return Response.json({ needsHandle: true });
  if ("error" in result) return Response.json({ error: result.error }, { status: 409 });
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", sessionSetCookie(result.id));
  return res;
}
