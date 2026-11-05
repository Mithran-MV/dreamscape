// The full piece, for the dreamer and for whoever holds one of its editions right now.
import { getDb } from "./db";
import { getBlob } from "./dreams";
import { getPiece, holdsEdition } from "./market";
import { panelKey } from "./nightly";
import { currentUser } from "./session";

export async function fullFile(pieceId: string, part: "portrait" | number) {
  const piece = getPiece(pieceId);
  const user = await currentUser();
  if (!piece || !user) return null;
  const { wallet } = getDb().prepare("SELECT wallet FROM users WHERE id = ?").get(user.id) as { wallet: string | null };
  if (user.id !== piece.user_id && !(await holdsEdition(piece, wallet))) return null;
  if (part === "portrait") return piece.kind === "dream" ? getBlob(piece.user_id, `dream/${piece.ref}/portrait`) : undefined;
  return piece.kind === "episode" ? getBlob(piece.user_id, panelKey(piece.ref, part)) : undefined;
}

export function fileResponse(blob: { mime: string; bytes: Buffer } | null | undefined) {
  if (!blob) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(blob.bytes), {
    headers: { "Content-Type": blob.mime, "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" },
  });
}
