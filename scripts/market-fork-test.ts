// Proves a whole Night Market sale on a local anvil fork of Sepolia, against the real ENS contracts,
// the deployed NightMarket and Circle's USDC: list, pay, the edition name, the split, and a transfer.
// Start a fork (anvil --fork-url https://ethereum-sepolia-rpc.publicnode.com --port 8547), then run
// node --env-file-if-exists=.env.local --import tsx scripts/market-fork-test.ts http://127.0.0.1:8547
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { createTestClient, createWalletClient, encodeFunctionData, formatUnits, http, parseAbi, parseEther, parseUnits, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const rpc = process.argv[2] ?? process.env.ENS_FORK_RPC_URL;
if (!rpc) throw new Error("Pass the anvil fork's RPC URL, or set ENS_FORK_RPC_URL.");
// Everything below reads its chain from the env, so point it at the fork and keep the database throwaway.
process.env.SEPOLIA_RPC_URL = rpc;
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "dreamscape-market-"));

// The account that funded the test buyer: any Sepolia holder of Circle's USDC works on a fork.
const USDC_HOLDER = "0x748138563A7DE3CAf9c756343F0bEdF57842D111" as Address;
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function transfer(address to, uint256 amount) returns (bool)"]);
const erc1155 = parseAbi(["function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)"]);

let failures = 0;
async function check(name: string, run: () => Promise<string>) {
  try {
    console.log(`PASS ${name}: ${await run()}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}: ${(error as Error).message.split("\n")[0]}`);
  }
}
function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const { env } = await import("../src/lib/server/env");
  const { ensClients } = await import("../src/lib/server/ens/client");
  const { onboardDreamer } = await import("../src/lib/server/ens/onboard");
  const { registryAbi } = await import("../src/lib/server/ens/contracts");
  const { getDb, now, utcDay } = await import("../src/lib/server/db");
  const { putBlob } = await import("../src/lib/server/dreams");
  const market = await import("../src/lib/server/market");

  const ens = ensClients(rpc);
  const node = String(await ens.client.request({ method: "web3_clientVersion" }));
  if (!node.toLowerCase().startsWith("anvil")) throw new Error(`${rpc} is ${node}, not an anvil fork.`);
  if ((await ens.client.getChainId()) !== sepolia.id) throw new Error(`${rpc} is not a fork of Sepolia.`);
  const test = createTestClient({ mode: "anvil", chain: sepolia, transport: http(rpc) });
  const server = ens.server.account.address;
  for (const address of [server, ens.scribe.account.address]) await test.setBalance({ address, value: parseEther("10") });

  // Fresh accounts: anvil's well-known ones carry EIP-7702 code on Sepolia and can't receive name tokens.
  const dreamer = privateKeyToAccount(generatePrivateKey()).address;
  const buyer = privateKeyToAccount(generatePrivateKey());
  const friend = privateKeyToAccount(generatePrivateKey()).address;
  const stranger = privateKeyToAccount(generatePrivateKey()).address;
  await test.setBalance({ address: buyer.address, value: parseEther("1") });
  const handle = `shop${dreamer.slice(2, 8).toLowerCase()}`;
  const usdc = env.usdc();
  const balance = (who: Address) => ens.client.readContract({ address: usdc, abi: erc20, functionName: "balanceOf", args: [who] });
  console.log(`Fork of Sepolia at block ${await ens.client.getBlockNumber()}, NightMarket ${env.nightMarket()}, dreamer ${handle}\n`);

  let pieceId: `0x${string}` = "0x";
  let editions: Address = "0x";
  await check("a dreamer is onboarded with NightMarket as their editions registrar", async () => {
    const done = await onboardDreamer(ens, { handle, dreamer, nightMarket: env.nightMarket() });
    editions = done.editions;
    getDb().prepare("INSERT INTO users (id, handle, wallet, pass_hash, ens_json, created_at) VALUES ('u1', ?, ?, 'x', ?, ?)").run(handle, dreamer, JSON.stringify({ name: done.name, resolver: done.resolver, editions: done.editions, passes: done.passes }), now());
    const roles = await ens.client.readContract({ address: editions, abi: registryAbi, functionName: "roles", args: [BigInt(0), env.nightMarket()!] });
    expect(roles > BigInt(0), "NightMarket holds no role on the editions registry");
    return `${done.name}, editions registry ${editions}`;
  });

  await check("a painted dream is listed as 3 editions at 2 USDC", async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#3662a0" } }).png().toBuffer();
    getDb()
      .prepare("INSERT INTO dreams (id, user_id, day, created_at, input_kind, feeling, status, title, tags_json) VALUES ('d1', 'u1', ?, ?, 'text', 'wonder', 'done', 'The Sea Roof', ?)")
      .run(utcDay(), now(), JSON.stringify({ themes: ["water", "home"] }));
    putBlob("u1", "dream/d1/portrait", "image/png", png);
    const started = await market.startListing("u1", { kind: "dream", ref: "d1", priceUsdc: 2, editions: 3 });
    expect("id" in started, "error" in started ? started.error : "no id");
    pieceId = started.id;
    await market.listJob(pieceId);
    const p = await market.onChainPiece(pieceId);
    expect(p.listed && p.active && p.max === 3 && p.priceUsdc === parseUnits("2", 6), `on-chain piece is ${JSON.stringify(p, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
    expect(market.getPreview(pieceId)?.mime === "image/jpeg", "no public preview");
    return `piece ${pieceId.slice(0, 10)}…, prefix "${market.getPiece(pieceId)!.label_prefix}", bound to the dreamer, with a public preview`;
  });

  let label = "";
  let tokenId = BigInt(0);
  await check("the buyer pays in USDC and gets the edition name", async () => {
    await test.impersonateAccount({ address: USDC_HOLDER });
    await test.setBalance({ address: USDC_HOLDER, value: parseEther("1") });
    const holder = createWalletClient({ account: USDC_HOLDER, chain: sepolia, transport: http(rpc) });
    await ens.client.waitForTransactionReceipt({ hash: await holder.writeContract({ address: usdc, abi: erc20, functionName: "transfer", args: [buyer.address, parseUnits("5", 6)] }) });
    await test.stopImpersonatingAccount({ address: USDC_HOLDER });
    const before = { seller: await balance(dreamer), commons: await balance(server) };
    const wallet = createWalletClient({ account: buyer, chain: sepolia, transport: http(rpc) });
    let last: `0x${string}` = "0x";
    // The same two transactions the browser sends from the buyer's Privy wallet.
    for (const tx of market.buyTxs(pieceId, parseUnits("2", 6))) {
      last = await wallet.sendTransaction({ to: tx.to, data: encodeFunctionData({ abi: tx.abi, functionName: tx.functionName, args: tx.args as never }) });
      const receipt = await ens.client.waitForTransactionReceipt({ hash: last });
      expect(receipt.status === "success", `${tx.functionName} reverted`);
    }
    const sold = await market.recordPurchase(pieceId, last);
    expect(sold.length === 1 && sold[0].editionNo === 1, `recorded ${JSON.stringify(sold)}`);
    label = sold[0].label;
    const owner = await ens.client.readContract({ address: editions, abi: registryAbi, functionName: "findOwner", args: [label] });
    expect(owner.toLowerCase() === buyer.address.toLowerCase(), `edition owner is ${owner}`);
    tokenId = BigInt((getDb().prepare("SELECT token_id FROM sales WHERE label = ?").get(label) as { token_id: string }).token_id);
    const got = { seller: (await balance(dreamer)) - before.seller, commons: (await balance(server)) - before.commons };
    expect(got.seller === parseUnits("1.9", 6) && got.commons === parseUnits("0.1", 6), `split was seller ${formatUnits(got.seller, 6)}, commons ${formatUnits(got.commons, 6)}`);
    return `${market.editionName(label, handle)} belongs to the buyer; the dreamer got 1.9 USDC and the commons 0.1`;
  });

  await check("only a holder opens the full piece", async () => {
    const piece = market.getPiece(pieceId)!;
    expect(await market.holdsEdition(piece, buyer.address), "the buyer can't open it");
    expect(await market.holdsEdition(piece, dreamer), "the dreamer can't open their own piece");
    expect(!(await market.holdsEdition(piece, stranger)), "a stranger can open it");
    return "buyer and dreamer yes, stranger no";
  });

  await check("the edition can be given away, and the full piece follows it", async () => {
    const wallet = createWalletClient({ account: buyer, chain: sepolia, transport: http(rpc) });
    const hash = await wallet.writeContract({ address: editions, abi: erc1155, functionName: "safeTransferFrom", args: [buyer.address, friend, tokenId, BigInt(1), "0x"] });
    expect((await ens.client.waitForTransactionReceipt({ hash })).status === "success", "transfer reverted");
    const piece = market.getPiece(pieceId)!;
    expect(await market.holdsEdition(piece, friend), "the friend can't open it");
    expect(!(await market.holdsEdition(piece, buyer.address)), "the buyer still can after giving it away");
    return `${label} now belongs to the friend`;
  });

  await check("NightMarket counts what's left", async () => {
    const p = await market.onChainPiece(pieceId);
    expect(p.sold === 1 && p.max === 3, `sold ${p.sold} of ${p.max}`);
    return "1 of 3 sold";
  });

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.log(`FAIL setup: ${(error as Error).message.split("\n")[0]}`);
  process.exitCode = 1;
});
