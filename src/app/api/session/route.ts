import { getDb } from "@/lib/server/db";
import { hasOpenJob } from "@/lib/server/jobs";
import { cleanHandle, clearSessionCookie, currentUser, endSessions, sessionSetCookie, signInOrClaim } from "@/lib/server/session";

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ user: null });
  const row = getDb().prepare("SELECT wallet, ens_json FROM users WHERE id = ?").get(user.id) as { wallet: string | null; ens_json: string | null };
  const ensName = row.ens_json ? (JSON.parse(row.ens_json) as { name: string }).name : null;
  // A new dreamer's name takes a couple of minutes to write; the gallery says so meanwhile.
  const naming = Boolean(row.wallet && !ensName && hasOpenJob(user.id, ["ens.onboard"]));
  return Response.json({ user: { handle: user.handle, wallet: row.wallet, ensName, naming } });
}

// Name + passphrase sign-in is for local testing only. On the live site the only way in is 0G's sign-in,
// or anyone could make free accounts and spend Dreamscape's own 0G credit.
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PASSPHRASE_SIGNIN !== "1") {
    return Response.json({ error: "Sign in with 0G." }, { status: 404 });
  }
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
  await endSessions();
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", clearSessionCookie());
  return res;
}
