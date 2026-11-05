import { env } from "@/lib/server/env";
import { parseSubscription, removeSubscription, saveSubscription } from "@/lib/server/push";
import { currentUser } from "@/lib/server/session";

// The public key the browser needs to subscribe.
export async function GET() {
  try {
    return Response.json({ publicKey: env.vapidPublic() });
  } catch {
    return Response.json({ error: "Notifications aren't set up on this server." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const sub = parseSubscription(await request.json().catch(() => null));
  if (!sub) return Response.json({ error: "That isn't a push subscription this server accepts." }, { status: 400 });
  saveSubscription(user.id, sub);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: string };
  if (typeof endpoint === "string") removeSubscription(user.id, endpoint);
  return Response.json({ ok: true });
}
