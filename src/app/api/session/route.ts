import { cleanHandle, clearSessionCookie, currentUser, sessionSetCookie, signInOrClaim } from "@/lib/server/session";

export async function GET() {
  const user = await currentUser();
  return Response.json({ user: user ? { handle: user.handle } : null });
}

export async function POST(request: Request) {
  const { handle, passphrase } = (await request.json().catch(() => ({}))) as { handle?: string; passphrase?: string };
  const clean = cleanHandle(handle ?? "");
  const pass = String(passphrase ?? "");
  if (clean.length < 3) return Response.json({ error: "Pick a name of at least 3 letters or digits." }, { status: 400 });
  if (pass.length < 6) return Response.json({ error: "Use a passphrase of at least 6 characters." }, { status: 400 });
  const result = signInOrClaim(clean, pass);
  if ("error" in result) return Response.json({ error: result.error }, { status: 401 });
  const res = Response.json({ handle: clean });
  res.headers.append("Set-Cookie", sessionSetCookie(result.id));
  return res;
}

export async function DELETE() {
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", clearSessionCookie());
  return res;
}
