// Starter funds for each new wallet on Sepolia: a little ETH for gas, and a few of Circle's test USDC
// from the server's own balance, so a dreamer can buy, revoke a pass or end a visit without a faucet.
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { getDb, now } from "./db";
import { env } from "./env";

const GAS_ETH = "0.003";
const USDC = parseUnits("5", 6);
// At most this many new wallets a day, so throwaway accounts can't empty the server's Sepolia funds.
const DRIPS_PER_DAY = 25;
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function transfer(address to, uint256 amount) returns (bool)"]);

// Job 'wallet.drip', ref = user id. Sent once per account. If the server is out of USDC, the
// dreamer still gets gas, and can top up at faucet.circle.com.
export async function dripJob(userId: string) {
  const user = getDb().prepare("SELECT wallet, dripped_at FROM users WHERE id = ?").get(userId) as { wallet: string | null; dripped_at: number | null } | undefined;
  if (!user?.wallet || user.dripped_at) return;
  const { n } = getDb().prepare("SELECT count(*) AS n FROM users WHERE dripped_at >= ?").get(now() - 86_400_000) as { n: number };
  // Skipped, not failed: the next sign-in queues the drip again.
  if (n >= DRIPS_PER_DAY) return console.warn(`[drip] ${n} wallets funded in the last day, so ${user.wallet} waits`);
  const to = user.wallet as `0x${string}`;
  const transport = http(env.sepoliaRpc());
  const reader = createPublicClient({ chain: sepolia, transport });
  const server = createWalletClient({ account: privateKeyToAccount(env.serverKey()), chain: sepolia, transport });
  await reader.waitForTransactionReceipt({ hash: await server.sendTransaction({ to, value: parseEther(GAS_ETH) }) });
  const held = await reader.readContract({ address: env.usdc(), abi: erc20, functionName: "balanceOf", args: [server.account.address] });
  if (held >= USDC) {
    const hash = await server.writeContract({ address: env.usdc(), abi: erc20, functionName: "transfer", args: [to, USDC] });
    await reader.waitForTransactionReceipt({ hash });
  } else {
    console.warn(`[drip] server holds ${held} USDC units, so ${to} gets gas only`);
  }
  getDb().prepare("UPDATE users SET dripped_at = ? WHERE id = ?").run(now(), userId);
}
