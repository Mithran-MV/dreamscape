// Last night's poster and moving portrait, waiting in Drafts beside the comic. POST hangs one or lets it go.
import { decideDraft, nightlyDrafts } from "@/lib/server/memories";
import { currentUser } from "@/lib/server/session";

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  return Response.json(nightlyDrafts(user.id));
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { piece, id, action } = (await request.json().catch(() => ({}))) as { piece?: string; id?: string; action?: string };
  if ((piece !== "poster" && piece !== "portrait") || typeof id !== "string" || (action !== "hang" && action !== "let-go")) return Response.json({ error: "Pick a piece and hang it or let it go." }, { status: 400 });
  if (!decideDraft(user.id, piece, id, action)) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(nightlyDrafts(user.id));
}
