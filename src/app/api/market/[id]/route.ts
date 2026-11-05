import { encodeFunctionData, type Hex } from "viem";
import { getDb } from "@/lib/server/db";
import { buyTxs, editionName, getPiece, holdsEdition, onChainPiece } from "@/lib/server/market";
import { currentUser } from "@/lib/server/session";

// One piece: what it is, what NightMarket says is left, and the two transactions a buyer signs.
export async function GET(_request: Request, ctx: RouteContext<"/api/market/[id]">) {
  const { id } = await ctx.params;
  const piece = getPiece(id);
  if (!piece) return Response.json({ error: "Not found." }, { status: 404 });
  const seller = getDb().prepare("SELECT handle, ens_json FROM users WHERE id = ?").get(piece.user_id) as { handle: string; ens_json: string | null };
  const user = await currentUser();
  const wallet = user ? (getDb().prepare("SELECT wallet FROM users WHERE id = ?").get(user.id) as { wallet: string | null }).wallet : null;
  const chain = piece.status === "listed" ? await onChainPiece(piece.id) : null;
  const sales = getDb().prepare("SELECT edition_no, label FROM sales WHERE piece_id = ? ORDER BY edition_no").all(piece.id) as { edition_no: number; label: string }[];
  return Response.json({
    id: piece.id,
    kind: piece.kind,
    title: piece.title,
    status: piece.status,
    sellerEns: seller.ens_json ? (JSON.parse(seller.ens_json) as { name: string }).name : null,
    mine: user?.id === piece.user_id,
    priceUsdc: piece.price_usdc / 1e6,
    editions: piece.editions,
    sold: chain?.sold ?? 0,
    open: Boolean(chain?.active) && (chain?.sold ?? 0) < piece.editions,
    holds: await holdsEdition(piece, wallet),
    names: sales.map((s) => editionName(s.label, seller.handle)),
    buy: chain ? buyTxs(piece.id, chain.priceUsdc).map((t) => ({ to: t.to, data: encodeFunctionData({ abi: t.abi, functionName: t.functionName, args: t.args as never }) as Hex })) : null,
  });
}
