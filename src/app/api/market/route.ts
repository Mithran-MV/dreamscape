import { CATEGORIES, THEMES, type Category, type Theme } from "@/lib/server/arkiv/schemas";
import { findListings, startListing, type PieceKind } from "@/lib/server/market";
import { currentUser } from "@/lib/server/session";

// Market search, straight from Arkiv: themes (any of), category, price range and sort.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const themes = (q.get("themes") ?? "").split(",").filter((t): t is Theme => (THEMES as readonly string[]).includes(t));
  const category = (CATEGORIES as readonly string[]).includes(q.get("category") ?? "") ? (q.get("category") as Category) : undefined;
  const max = Number(q.get("max"));
  const sort = q.get("sort") === "price-asc" || q.get("sort") === "price-desc" ? (q.get("sort") as "price-asc" | "price-desc") : "newest";
  try {
    const listings = await findListings({
      themes: themes.length ? themes : undefined,
      category,
      maxPriceUsdc: max > 0 ? BigInt(Math.round(max * 1e6)) : undefined,
      sellerEns: q.get("seller") || undefined,
      sort,
    });
    return Response.json({ listings });
  } catch {
    return Response.json({ error: "The market can't be reached right now. Try again in a moment." }, { status: 503 });
  }
}

// List a hung comic or a painted dream for sale.
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { kind?: string; ref?: string; priceUsdc?: number; editions?: number };
  if ((body.kind !== "episode" && body.kind !== "dream") || typeof body.ref !== "string") return Response.json({ error: "Pick a piece to sell." }, { status: 400 });
  const result = await startListing(user.id, { kind: body.kind as PieceKind, ref: body.ref, priceUsdc: Number(body.priceUsdc), editions: Number(body.editions) });
  if ("error" in result) return Response.json(result, { status: 409 });
  return Response.json(result, { status: 201 });
}
