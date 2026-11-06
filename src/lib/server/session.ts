// A signed session cookie, issued after Privy sign-in or a name + passphrase (kept for testing without email).
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";
import { getDb, now } from "./db";
import { newId } from "./crypto";
import { enqueue, hasOpenJob } from "./jobs";
import { checkHandle } from "./ens/client";

const COOKIE = "ds_session";
const MAX_AGE = 60 * 60 * 24 * 60;

function sign(value: string) {
  return createHmac("sha256", Buffer.from(env.masterKey().replace(/^0x/, ""), "hex")).update(`session:${value}`).digest("base64url");
}

function hashPass(pass: string, salt = randomBytes(16)) {
  return `${salt.toString("hex")}:${scryptSync(pass, salt, 32).toString("hex")}`;
}

function passMatches(pass: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const given = scryptSync(pass, Buffer.from(salt, "hex"), 32);
  return timingSafeEqual(given, Buffer.from(hash, "hex"));
}

// The first person to use a name claims it with their passphrase; later sign-ins must match it.
export function signInOrClaim(handle: string, pass: string): { id: string } | { error: string } {
  const db = getDb();
  const user = db.prepare("SELECT id, pass_hash FROM users WHERE handle = ?").get(handle) as { id: string; pass_hash: string | null } | undefined;
  if (!user) {
    const id = newId("user");
    db.prepare("INSERT INTO users (id, handle, pass_hash, created_at) VALUES (?, ?, ?, ?)").run(id, handle, hashPass(pass), now());
    return { id };
  }
  // A name with no passphrase can't be claimed by whoever asks first.
  if (!user.pass_hash) return { error: "That name is taken, or the passphrase is wrong." };
  return passMatches(pass, user.pass_hash) ? { id: user.id } : { error: "That name is taken, or the passphrase is wrong." };
}

// Privy sign-in. A known Privy user signs straight in; a new one picks a handle first, which becomes
// <handle>.dream-scape.eth. Either way, a dreamer with a wallet and no name yet gets one queued.
export function signInWithPrivy(privyId: string, wallet: string | null, handle?: string): { id: string } | { needsHandle: true } | { error: string } {
  const db = getDb();
  const found = db.prepare("SELECT id, wallet, ens_json FROM users WHERE privy_id = ?").get(privyId) as { id: string; wallet: string | null; ens_json: string | null } | undefined;
  if (found) {
    if (!found.wallet && wallet) db.prepare("UPDATE users SET wallet = ? WHERE id = ?").run(wallet, found.id);
    if ((found.wallet ?? wallet) && !found.ens_json && !hasOpenJob(found.id, ["ens.onboard"])) enqueue("ens.onboard", found.id);
    if ((found.wallet ?? wallet) && !hasOpenJob(found.id, ["wallet.drip"])) enqueue("wallet.drip", found.id);
    return { id: found.id };
  }
  if (!handle) return { needsHandle: true };
  const clean = cleanHandle(handle);
  if (clean.length < 3) return { error: "Pick a name of at least 3 letters or digits." };
  try {
    checkHandle(clean);
  } catch {
    return { error: "That name is reserved. Pick another." };
  }
  if (db.prepare("SELECT 1 FROM users WHERE handle = ?").get(clean)) return { error: "That name is taken. Pick another." };
  const id = newId("user");
  // Tonight's art is on from the start: it's made from the dreamer's own credit, which would otherwise expire.
  db.prepare("INSERT INTO users (id, handle, wallet, privy_id, nightly, created_at) VALUES (?, ?, ?, ?, 1, ?)").run(id, clean, wallet, privyId, now());
  if (wallet) {
    enqueue("ens.onboard", id);
    enqueue("wallet.drip", id);
  }
  return { id };
}

export function sessionSetCookie(userId: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${userId}.${sign(userId)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure}`;
}

export const clearSessionCookie = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;

export async function currentUser(): Promise<{ id: string; handle: string } | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  const userId = raw.slice(0, dot);
  const given = Buffer.from(raw.slice(dot + 1));
  const expected = Buffer.from(sign(userId));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const row = getDb().prepare("SELECT handle FROM users WHERE id = ?").get(userId) as { handle: string } | undefined;
  return row ? { id: userId, handle: row.handle } : null;
}

export const cleanHandle = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
