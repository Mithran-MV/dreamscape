import { cleanHandle, currentUser, sessionCookie } from "@/lib/server/session";

export async function GET() {
  return Response.json({ user: await currentUser() });
}

export async function POST(request: Request) {
  const { handle } = (await request.json().catch(() => ({}))) as { handle?: string };
  const clean = cleanHandle(handle ?? "");
  if (clean.length < 3) return Response.json({ error: "Pick a name of at least 3 letters or digits." }, { status: 400 });
  const res = Response.json({ handle: clean });
  const c = sessionCookie(clean);
  res.headers.append("Set-Cookie", `${c.name}=${c.value}; Path=${c.path}; Max-Age=${c.maxAge}; HttpOnly; SameSite=Lax`);
  return res;
}

export async function DELETE() {
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", "ds_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
  return res;
}
