import { getDb } from "@/lib/server/db";
import { cleanHandle, clearSessionCookie, currentUser, sessionSetCookie, signInOrClaim } from "@/lib/server/session";

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ user: null });
  const row = getDb().prepare("SELECT wallet, ens_json FROM users WHERE id = ?").get(user.id) as { wallet: string | null; ens_json: string | null };
  const ensName = row.ens_json ? (JSON.parse(row.ens_json) as { name: string }).name : null;
  return Response.json({ user: { handle: user.handle, wallet: row.wallet, ensName } });
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
