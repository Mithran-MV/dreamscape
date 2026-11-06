import { encodeFunctionData, type Hex } from "viem";
import { getDb } from "@/lib/server/db";
import { buyTxs, editionName, getPiece, holdsEdition, marketAddress, onChainPiece } from "@/lib/server/market";
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
    holds: user?.id === piece.user_id || (await holdsEdition(piece, wallet)),
    names: sales.map((s) => editionName(s.label, seller.handle)),
    // NightMarket mints each name at the sale; this is the one the next buyer would get.
    nextName: (chain?.sold ?? 0) < piece.editions ? editionName(`${piece.label_prefix}-${(chain?.sold ?? 0) + 1}`, seller.handle) : null,
    proof: {
      market: `https://sepolia.etherscan.io/address/${marketAddress()}`,
      listedTx: piece.market_tx?.startsWith("0x") ? `https://sepolia.etherscan.io/tx/${piece.market_tx}` : null,
      arkiv: piece.arkiv_key ? `https://rabdi.explorer.arkiv.network/entity/${piece.arkiv_key}` : null,
    },
    buy: chain ? buyTxs(piece.id, chain.priceUsdc).map((t) => ({ to: t.to, data: encodeFunctionData({ abi: t.abi, functionName: t.functionName, args: t.args as never }) as Hex })) : null,
  });
}
