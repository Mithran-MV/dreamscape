// The market's Arkiv side on a local Arkiv dev node in Docker: a listing is written by the server,
// handed to the dreamer, then found by theme, kind and price exactly as the market page searches.
// Run with: node --env-file-if-exists=.env.local --import tsx scripts/market-arkiv-test.ts
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { generatePrivateKey, mnemonicToAccount, privateKeyToAccount } from "viem/accounts";

const IMAGE = "ghcr.io/arkiv-network/arkiv-reth-dev:v1.0.1";
// The dev node's well-known funded test account. It exists only on this throwaway local chain.
const DEV_MNEMONIC = "test test test test test test test test test test test junk";
const docker = (...args: string[]) => execFileSync(process.env.DOCKER ?? "docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let failures = 0;
function report(ok: boolean, name: string, detail: string) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
}

async function startNode(name: string) {
  // 2-second blocks like Rabdi, so expiry times mean what they say.
  docker("run", "-d", "--rm", "--name", name, "-p", "127.0.0.1::8545", IMAGE, "node", "--dev", "--dev.block-time", "2s", "--http", "--http.addr", "0.0.0.0", "--http.api", "eth,net,web3,txpool", "--datadir", "/data");
  const url = `http://127.0.0.1:${docker("port", name, "8545/tcp").split("\n")[0].split(":").pop()}`;
  const client = createPublicClient({ transport: http(url) });
  for (let i = 0; i < 60; i++) {
    if ((await client.getBlockNumber().catch(() => BigInt(0))) > BigInt(0)) return url;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`the node at ${url} did not start`);
}

async function main() {
  const name = `dreamscape-market-arkiv-${process.pid}`;
  const url = await startNode(name);
  try {
    process.env.ARKIV_NETWORK = "local";
    process.env.ARKIV_RPC_URL = url;
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "dreamscape-market-arkiv-"));
    const { env } = await import("../src/lib/server/env");
    const { getDb, now, utcDay } = await import("../src/lib/server/db");
    const market = await import("../src/lib/server/market");
    const { arkiv } = await import("../src/lib/server/arkiv/client");
    const { getListing } = await import("../src/lib/server/arkiv/market");

    const server = privateKeyToAccount(env.serverKey()).address;
    const funder = createWalletClient({ account: mnemonicToAccount(DEV_MNEMONIC), transport: http(url), chain: arkiv().chain });
    await createPublicClient({ transport: http(url) }).waitForTransactionReceipt({ hash: await funder.sendTransaction({ to: server, value: parseEther("10") }) });

    const dreamer = privateKeyToAccount(generatePrivateKey()).address;
    const db = getDb();
    db.prepare("INSERT INTO users (id, handle, wallet, pass_hash, ens_json, created_at) VALUES ('u1', 'tidewalker', ?, 'x', ?, ?)").run(
      dreamer,
      JSON.stringify({ name: "tidewalker.dream-scape.eth", editions: "0x0000000000000000000000000000000000000001" }),
      now(),
    );
    db.prepare("INSERT INTO dreams (id, user_id, day, created_at, input_kind, status, title, tags_json) VALUES ('d1', 'u1', ?, ?, 'text', 'done', 'Low Tide', ?)").run(utcDay(), now(), JSON.stringify({ themes: ["water", "night"] }));
    const id = market.pieceIdFor("dream", "d1");
    // NightMarket's half is covered by the fork test, so this piece starts as already listed there.
    db.prepare("INSERT INTO pieces (id, user_id, kind, ref, title, label_prefix, price_usdc, editions, status, market_tx, created_at) VALUES (?, 'u1', 'dream', 'd1', 'Low Tide', 'low-tide', 2500000, 10, 'listed', 'already-listed', ?)").run(id, now());

    await market.arkivJob(id);
    const key = market.getPiece(id)?.arkiv_key;
    report(Boolean(key), "the server writes the listing and keeps its key", String(key));
    await market.arkivJob(id);
    report(market.getPiece(id)?.arkiv_key === key, "running the job again writes nothing new", "same key");

    const row = await getListing(key as `0x${string}`);
    report(
      row?.owner.toLowerCase() === dreamer.toLowerCase() && row?.creator.toLowerCase() === server.toLowerCase(),
      "the listing belongs to the dreamer and was created by the server",
      `owner ${row?.owner}, creator ${row?.creator}`,
    );

    const found = await market.findListings({ themes: ["water"], sort: "price-asc" });
    const hit = found.find((l) => l.pieceId === id);
    report(Boolean(hit && hit.priceUsdc === 2.5 && hit.sellerEns === "tidewalker.dream-scape.eth" && hit.preview === `/api/market/${id}/preview`), "found by the water theme", JSON.stringify(hit));
    report(!(await market.findListings({ themes: ["city"] })).some((l) => l.pieceId === id), "not found by a theme it doesn't have", "city");
    report(!(await market.findListings({ category: "comic" })).some((l) => l.pieceId === id), "not found among comics", "it's a portrait");
    report(!(await market.findListings({ maxPriceUsdc: BigInt(2_000_000) })).some((l) => l.pieceId === id), "not found under a 2 USDC cap", "it costs 2.5");
    report((await market.findListings({ maxPriceUsdc: BigInt(3_000_000) })).some((l) => l.pieceId === id), "found under a 3 USDC cap", "2.5 fits");
  } finally {
    docker("stop", name);
    console.log(`stopped ${name}`);
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.log(`FAIL setup: ${(error as Error).message.split("\n")[0]}`);
  process.exitCode = 1;
});
