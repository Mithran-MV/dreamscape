// Privy sign-in: verify the access token, then read the dreamer's embedded wallet from Privy itself,
// so the server never takes a wallet address on the browser's word.
import { PrivyClient } from "@privy-io/node";
import { env } from "./env";

let client: PrivyClient | undefined;
const privy = () => (client ??= new PrivyClient({ appId: env.privyAppId(), appSecret: env.privyAppSecret() }));

export async function privyIdentity(accessToken: string): Promise<{ privyId: string; wallet: `0x${string}` | null }> {
  const { user_id } = await privy().utils().auth().verifyAccessToken(accessToken);
  const user = await privy().users()._get(user_id);
  const embedded = user.linked_accounts.find(
    (a) => a.type === "wallet" && a.chain_type === "ethereum" && "wallet_client_type" in a && a.wallet_client_type === "privy",
  );
  const address = embedded && "address" in embedded ? embedded.address : null;
  return { privyId: user_id, wallet: address && /^0x[0-9a-fA-F]{40}$/.test(address) ? (address as `0x${string}`) : null };
}
