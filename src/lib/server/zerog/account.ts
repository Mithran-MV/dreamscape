// A dreamer's own 0G account, so their iAI credit pays for their own dreams.
// "Sign in with 0G" (0G's Privy app) gives a token. 0G's router trades it for a session, as pc.0g.ai
// does, and the session creates a "Dreamscape" key on their account. That key, sealed under the
// dreamer's own key, is what the worker uses for their dreams, comics and moving portraits, so it
// keeps working at night while they're offline. A key pasted from pc.0g.ai works the same way.
import { AsyncLocalStorage } from "node:async_hooks";
import { dreamerKey, open, seal } from "../crypto";
import { getDb, now } from "../db";
import { env } from "../env";

type Payer = { userId: string; key: string };
const payer = new AsyncLocalStorage<Payer | null>();

export type ZeroGAccount = { connected: boolean; wallet: string | null; keyPreview: string | null; since: number | null; error: string | null };

type Row = { zg_key: string | null; zg_key_preview: string | null; zg_wallet: string | null; zg_connected_at: number | null; zg_error: string | null };

function row(userId: string) {
  return getDb().prepare("SELECT zg_key, zg_key_preview, zg_wallet, zg_connected_at, zg_error FROM users WHERE id = ?").get(userId) as Row | undefined;
}

export function zeroGAccount(userId: string): ZeroGAccount {
  const r = row(userId);
  return { connected: Boolean(r?.zg_key), wallet: r?.zg_wallet ?? null, keyPreview: r?.zg_key_preview ?? null, since: r?.zg_connected_at ?? null, error: r?.zg_error ?? null };
}

function dreamerZeroGKey(userId: string): string | null {
  const sealed = row(userId)?.zg_key;
  return sealed ? open(dreamerKey(userId), Buffer.from(sealed, "base64")).toString("utf8") : null;
}

function save(userId: string, key: string, preview: string, wallet: string | null) {
  getDb()
    .prepare("UPDATE users SET zg_key = ?, zg_key_preview = ?, zg_wallet = ?, zg_connected_at = ?, zg_error = NULL WHERE id = ?")
    .run(seal(dreamerKey(userId), Buffer.from(key, "utf8")).toString("base64"), preview, wallet, now(), userId);
}

export function disconnectZeroG(userId: string) {
  getDb().prepare("UPDATE users SET zg_key = NULL, zg_key_preview = NULL, zg_wallet = NULL, zg_connected_at = NULL, zg_error = NULL WHERE id = ?").run(userId);
}

// Runs a job's 0G calls on the dreamer's own key when they've connected one, and on Dreamscape's otherwise.
export function asDreamer<T>(userId: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  const key = userId ? dreamerZeroGKey(userId) : null;
  return payer.run(key && userId ? { userId, key } : null, fn);
}

// For work that must stay on Dreamscape's key, such as polling a clip Dreamscape's key started.
export const asDreamscape = <T>(fn: () => Promise<T>) => payer.run(null, fn);

export const currentPayer = () => payer.getStore() ?? null;

// 0G refused the dreamer's key (revoked, out of credit): say so on their 0G page, and let the caller
// finish the job on Dreamscape's key so the dream still paints.
export function keyRefused(userId: string, status: number, body: string) {
  const reason = status === 402 ? "your 0G credit ran out" : status === 401 ? "0G no longer accepts the key" : "0G refused the key";
  getDb().prepare("UPDATE users SET zg_error = ? WHERE id = ?").run(`${reason} (${status}${body ? `: ${body.slice(0, 120)}` : ""})`, userId);
}

const short = (text: string) => text.replace(/\s+/g, " ").slice(0, 200);

// "Connect your 0G account": the 0G sign-in token in, a key on their account out.
export async function connectWithZeroG(userId: string, privyToken: string): Promise<ZeroGAccount | { error: string }> {
  const base = env.zgRouter();
  const signIn = await fetch(`${base}/auth/privy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: privyToken }),
    signal: AbortSignal.timeout(30_000),
  });
  const signInText = await signIn.text();
  if (!signIn.ok) return { error: `0G didn't accept the sign-in (${signIn.status}: ${short(signInText)})` };
  const session = JSON.parse(signInText) as { token?: string; wallet_address?: string };
  const cookie = signIn.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

  // The same call pc.0g.ai's Keys page makes, signed in as the dreamer.
  const created = await fetch(`${base}/api-keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify({ name: "Dreamscape", reset_period: "daily", expiration: "no_expiration" }),
    signal: AbortSignal.timeout(30_000),
  });
  const createdText = await created.text();
  if (!created.ok) return { error: `Signed in to 0G, but 0G wouldn't create a key (${created.status}: ${short(createdText)}). Paste a key from pc.0g.ai instead.` };
  const key = JSON.parse(createdText) as { key?: string; key_preview?: string };
  if (!key.key?.startsWith("sk-")) return { error: "0G created a key but didn't hand it back. Paste a key from pc.0g.ai instead." };
  save(userId, key.key, key.key_preview ?? `${key.key.slice(0, 7)}…`, session.wallet_address ?? null);
  return zeroGAccount(userId);
}

// A key pasted from pc.0g.ai. One tiny sealed call checks that 0G takes it before it's kept.
export async function connectWithKey(userId: string, key: string): Promise<ZeroGAccount | { error: string }> {
  const k = key.trim();
  if (!/^sk-[A-Za-z0-9_-]{16,}$/.test(k)) return { error: "That doesn't look like a 0G key. They start with sk-." };
  const res = await fetch(`${env.zgRouter()}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json", "X-0G-Provider-Trust-Mode": "private" },
    body: JSON.stringify({ model: "0gm-1.0-35b-a3b", messages: [{ role: "user", content: "Say ok." }], max_tokens: 1, reasoning_effort: "minimal" }),
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 401 || res.status === 403) return { error: "0G didn't accept that key." };
  if (res.status === 402) return { error: "That key's account has no credit left today." };
  save(userId, k, `${k.slice(0, 7)}…${k.slice(-4)}`, null);
  return zeroGAccount(userId);
}
