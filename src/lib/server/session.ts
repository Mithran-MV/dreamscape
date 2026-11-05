// A signed session cookie. A stand-in for Privy sign-in until the Privy app is configured.
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";
import { getOrCreateUser } from "./dreams";

const COOKIE = "ds_session";

function sign(value: string) {
  return createHmac("sha256", Buffer.from(env.masterKey().replace(/^0x/, ""), "hex")).update(`session:${value}`).digest("base64url");
}

export function sessionCookie(handle: string) {
  return { name: COOKIE, value: `${handle}.${sign(handle)}`, httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 60 };
}

export async function currentUser(): Promise<{ id: string; handle: string } | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  const handle = raw.slice(0, dot);
  const given = Buffer.from(raw.slice(dot + 1));
  const expected = Buffer.from(sign(handle));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return { id: getOrCreateUser(handle), handle };
}

export const cleanHandle = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
