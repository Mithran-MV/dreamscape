// A signed session cookie behind a name + passphrase. A stand-in for Privy sign-in until the Privy app is configured.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";
import { getDb, now } from "./db";
import { newId } from "./crypto";

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
  if (!user.pass_hash) {
    db.prepare("UPDATE users SET pass_hash = ? WHERE id = ?").run(hashPass(pass), user.id);
    return { id: user.id };
  }
  return passMatches(pass, user.pass_hash) ? { id: user.id } : { error: "That name is taken, or the passphrase is wrong." };
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
