// Wallet sign-in on the live site, where 0G's Privy app isn't allowed: Dreamscape's own Privy app, which
// offers wallet login only. The token proves the Privy account, and Privy's /users/me, asked with that same
// token, names the wallet it signed in with. The wallet then finds the dreamer's gallery, however they first
// came in, and a 0G key they connected through 0G's sign-in keeps paying for their dreams.
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "./env";

type PrivyUser = { id?: string; linked_accounts?: { type?: string; address?: string; chain_type?: string }[] };

let keys: ReturnType<typeof createRemoteJWKSet> | undefined;
const walletKeys = (appId: string) => (keys ??= createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`)));

export async function walletSignIn(token: string): Promise<{ privyId: string; wallet: `0x${string}` } | { error: string }> {
  const appId = env.walletPrivyAppId();
  if (!appId) return { error: "Wallet sign-in isn't set up on this site." };
  let sub: string | undefined;
  try {
    ({ sub } = (await jwtVerify(token, walletKeys(appId), { issuer: "privy.io", audience: appId })).payload);
  } catch {
    return { error: "That wallet sign-in didn't check out. Try again." };
  }
  if (!sub) return { error: "The sign-in token had no account in it. Try again." };
  // Privy only answers this for an origin the app allows, so the server names the live site.
  const res = await fetch("https://auth.privy.io/api/v1/users/me", {
    headers: { "privy-app-id": appId, Authorization: `Bearer ${token}`, Origin: (process.env.APP_URL?.trim() || "https://dreamscape.hacklabs.in").replace(/\/+$/, "") },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { error: `Privy didn't say which wallet signed in (${res.status}). Try again.` };
  const body = (await res.json()) as { user?: PrivyUser } & PrivyUser;
  const user = body.user ?? body;
  if (user.id !== sub) return { error: "Privy answered for a different account. Try again." };
  const wallet = user.linked_accounts?.find((a) => a.type === "wallet" && (a.chain_type ?? "ethereum") === "ethereum" && /^0x[0-9a-fA-F]{40}$/.test(a.address ?? ""))?.address;
  if (!wallet) return { error: "Sign in with an Ethereum wallet, the one your 0G account uses." };
  return { privyId: `privy:${sub}`, wallet: wallet as `0x${string}` };
}
