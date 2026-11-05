// Tests the Arkiv data layer. Writes run on a throwaway dev node in Docker; Rabdi only gets reads and dry runs that send nothing.
// node --env-file-if-exists=.env.local --import tsx scripts/arkiv-test.ts [--local-only | --rabdi-only]
import { execFileSync } from "node:child_process";
import { createPublicClient, createWalletClient as createArkivWallet, ENTITY_EVENTS_ABI, ExpirationTime, NoEntityFoundError } from "@arkiv-network/sdk";
import { addr, key, u64 } from "@arkiv-network/sdk/schema";
import { createWalletClient, decodeEventLog, formatEther, formatGwei, http, isAddressEqual, keccak256, namehash, parseEther, stringToHex, type Hex, type Transport } from "viem";
import { generatePrivateKey, mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { getGasPrice } from "viem/actions";
import {
  activeClaim,
  activeVisit,
  awardCommission,
  bidsFor,
  claimCommission,
  createArkiv,
  delist,
  endVisit,
  extendSale,
  getListing,
  heartbeat,
  knock,
  letIn,
  Listing,
  listingForPiece,
  listPiece,
  openCommissions,
  openKnocks,
  openStalls,
  placeBid,
  publishVendor,
  publishWorldDream,
  RABDI_RPC,
  recordSale,
  renewClaim,
  requestCommission,
  revertName,
  searchMarket,
  setPrice,
  tonightsStalls,
  Visit,
  waitVisible,
  worldDream,
  WorldDream,
  type Arkiv,
  type NewListing,
} from "../src/lib/server/arkiv";

const IMAGE = "ghcr.io/arkiv-network/arkiv-reth-dev:v1.0.1";
const DOCKER = process.env.DOCKER ?? "docker";
// The dev node prefunds the accounts of the standard test mnemonic. They exist only on that throwaway chain.
const DEV_MNEMONIC = "test test test test test test test test test test test junk";
const USDC = (n: number) => BigInt(Math.round(n * 1_000_000));
const ZERO = BigInt(0);

let failures = 0;
const report = (ok: boolean, name: string, detail: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${detail}`);
};

async function check(name: string, run: () => Promise<string>) {
  try {
    report(true, name, await run());
  } catch (error) {
    report(false, name, (error as Error).message.split("\n")[0]);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let lastMessage = "";

async function rejects(run: () => Promise<unknown>, expected: string) {
  try {
    await run();
  } catch (error) {
    const name = revertName(error) ?? (error as Error).message;
    assert(name.includes(expected), `expected ${expected}, got: ${name.split("\n")[0]}`);
    lastMessage = (error as Error).message.split("\n")[0];
    return name;
  }
  throw new Error(`expected ${expected}, but it went through`);
}

const short = (hex: string) => `${hex.slice(0, 10)}…`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const randomLabel = () => Math.random().toString(36).slice(2, 8);

const gasRows: { op: string; gas: bigint; network: string }[] = [];

async function gasOf(ctx: Arkiv, op: string, hash: Hex) {
  const receipt = await ctx.reader.getTransactionReceipt({ hash });
  gasRows.push({ op, gas: receipt.gasUsed, network: "local" });
  return receipt;
}

function eventsIn(logs: { topics: [Hex, ...Hex[]] | []; data: Hex }[]) {
  return logs.flatMap((log) => {
    try {
      return [decodeEventLog({ abi: ENTITY_EVENTS_ABI, topics: log.topics, data: log.data }).eventName];
    } catch {
      return [];
    }
  });
}

function sampleListing(dreamer: Hex, overrides: Partial<NewListing> = {}): NewListing {
  return {
    pieceId: keccak256(stringToHex(`piece-${randomLabel()}`)),
    dreamer,
    sellerEns: "tester.dream-scape.eth",
    title: "The Sea Roof, episode 3",
    category: "comic",
    style: "ink",
    priceUsdc: USDC(8),
    editionsTotal: 10,
    themes: ["water", "flight"],
    sealed: true,
    model: "z-image-turbo",
    sagaLength: 3,
    ...overrides,
  };
}

// ---------------------------------------------------------------- Rabdi: reads and dry runs only

const READ_METHODS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_call",
  "eth_estimateGas",
  "eth_getTransactionCount",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_getBlockByNumber",
  "eth_getBalance",
  "arkiv_query",
  "arkiv_getEntity",
  "arkiv_getBlockTiming",
]);
const DRY_RUN = "dry run: refused to send";

// A transport that answers reads and refuses anything else, so a write is encoded, estimated by the node, signed, and dropped.
function readOnly(url: string, accessKey: string, estimates: bigint[]): Transport {
  const inner = http(url, { retryCount: 0, timeout: 15_000, fetchOptions: accessKey ? { headers: { "X-API-KEY": accessKey } } : undefined });
  return (params) => {
    const transport = inner(params);
    const request = (async (args: { method: string; params?: unknown }) => {
      if (!READ_METHODS.has(args.method)) throw new Error(`${DRY_RUN} ${args.method}`);
      const result = await transport.request(args as Parameters<typeof transport.request>[0]);
      if (args.method === "eth_estimateGas") estimates.push(BigInt(result as Hex));
      return result;
    }) as typeof transport.request;
    return { ...transport, request };
  };
}

function stoppedByDryRun(error: unknown): boolean {
  for (let e: unknown = error; e; e = (e as { cause?: unknown }).cause) {
    if (String((e as Error).message ?? e).includes(DRY_RUN)) return true;
  }
  return false;
}

async function dryRun(ctx: Arkiv, op: string, estimates: bigint[], write: () => Promise<unknown>) {
  const before = estimates.length;
  try {
    await write();
  } catch (error) {
    if (!stoppedByDryRun(error)) throw error;
    const gas = estimates[estimates.length - 1];
    assert(estimates.length > before && gas !== undefined, "the node gave no gas estimate");
    gasRows.push({ op, gas, network: "rabdi" });
    return gas;
  }
  throw new Error("the write was not stopped before sending");
}

async function rabdiChecks() {
  console.log("\nRabdi (reads and dry runs; nothing is sent)");
  const accessKey = process.env.ARKIV_ACCESS_KEY?.trim() ?? "";
  const serverKey = (process.env.SERVER_PRIVATE_KEY?.trim() as Hex | undefined) || generatePrivateKey();
  const ctx = createArkiv({ network: "rabdi", rpcUrl: RABDI_RPC, serverKey });
  report(true, "Rabdi access key", accessKey ? "set, sent as a header" : "not set, so the public rate-limited endpoint");

  await check("Rabdi chain and head", async () => {
    const [chainId, timing] = await Promise.all([ctx.reader.getChainId(), ctx.reader.getBlockTiming()]);
    assert(chainId === 7794095, `chain ${chainId}`);
    assert(timing.blockDuration === 2, `block time ${timing.blockDuration}s`);
    return `chain ${chainId}, block ${timing.currentBlock}, ${timing.blockDuration}s blocks`;
  });

  await check("Rabdi market search runs", async () => {
    const result = await searchMarket({ themes: ["water", "flight"], minPriceUsdc: USDC(1), maxPriceUsdc: USDC(20), sort: "price-asc" }, ctx);
    return `${result.total} listings created by ${short(ctx.serverAddress)} at block ${result.block}`;
  });

  await check("Rabdi knock, visit and World Dream queries run", async () => {
    const someone = privateKeyToAccount(generatePrivateKey()).address;
    const [knocks, visit, counts] = await Promise.all([openKnocks(someone, {}, ctx), activeVisit(someone, namehash("x.passes.dream-scape.eth"), ctx), worldDream("2026-11-05", "world", ctx)]);
    assert(knocks.length === 0 && visit === null, "found entities for a random address");
    return `0 knocks, no visit, ${counts.length} World Dream rows`;
  });

  await check("Rabdi server wallet", async () => {
    const [balance, nonce] = await Promise.all([ctx.reader.getBalance({ address: ctx.serverAddress }), ctx.reader.getEntityNonce(ctx.serverAddress)]);
    return `${ctx.serverAddress} holds ${formatEther(balance)} tGLM and has created ${nonce} entities`;
  });

  const estimates: bigint[] = [];
  const transport = readOnly(RABDI_RPC, accessKey, estimates);
  const dry: Arkiv = {
    ...ctx,
    reader: createPublicClient({ chain: ctx.chain, transport }),
    server: createArkivWallet({ account: privateKeyToAccount(serverKey), chain: ctx.chain, transport }),
  };
  const dreamer = privateKeyToAccount(generatePrivateKey()).address;
  const pass = namehash(`p${randomLabel()}.passes.tester.dream-scape.eth`);

  await check("Rabdi accepts create + hand-over in one batch (estimate only)", async () => {
    const gas = await dryRun(dry, "listing: create + hand-over", estimates, () => listPiece(sampleListing(dreamer), dry));
    return `the node estimated ${gas} gas for a listing created by the server and handed to ${short(dreamer)}`;
  });

  await check("Rabdi accepts the other server writes (estimates only)", async () => {
    const knockGas = await dryRun(dry, "knock: create + hand-over", estimates, () => knock({ visitor: dreamer, pass, host: privateKeyToAccount(generatePrivateKey()).address, scope: "published" }, dry));
    const visitGas = await dryRun(dry, "visit: create + hand-over", estimates, () => letIn({ dreamer, pass, scope: "published", endsAt: new Date(Date.now() + 600_000) }, dry));
    const vendorGas = await dryRun(dry, "vendor stall: create + hand-over", estimates, () =>
      publishVendor({ agent: dreamer, ens: "ink.agents.dream-scape.eth", style: "ink", fromPriceUsdc: USDC(3), services: ["comic"], menu: { comic: 3 } }, dry),
    );
    const worldGas = await dryRun(dry, "World Dream: 5 counts in one batch", estimates, () =>
      publishWorldDream({ date: "2026-11-05", circle: `dry-${randomLabel()}`, themes: (["water", "flight", "chase", "home", "night"] as const).map((theme, i) => ({ theme, feeling: "wonder", count: 5 + i })) }, dry),
    );
    return `knock ${knockGas}, visit ${visitGas}, vendor ${vendorGas}, World Dream x5 ${worldGas}`;
  });
}

// ---------------------------------------------------------------- local dev node: real writes

function docker(...args: string[]) {
  return execFileSync(DOCKER, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function startNode(name: string) {
  // 2-second blocks like Rabdi. The image defaults to 250 ms, which makes every ExpirationTime eight times shorter.
  docker("run", "-d", "--rm", "--name", name, "-p", "127.0.0.1::8545", IMAGE, "node", "--dev", "--dev.block-time", "2s", "--http", "--http.addr", "0.0.0.0", "--http.api", "eth,net,web3,txpool", "--datadir", "/data");
  const port = docker("port", name, "8545/tcp").split("\n")[0].split(":").pop();
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }) });
      const body = (await res.json()) as { result?: Hex };
      if (body.result && BigInt(body.result) > ZERO) return url;
    } catch {
      // not up yet
    }
    await sleep(1000);
  }
  throw new Error(`the node at ${url} did not start`);
}

async function localChecks() {
  console.log(`\nLocal dev node (${IMAGE}, real writes)`);
  const name = `dreamscape-arkiv-test-${process.pid}`;
  const stop = () => {
    try {
      docker("stop", name);
    } catch {
      // already gone
    }
  };
  process.once("SIGINT", () => {
    stop();
    process.exit(130);
  });
  let url: string;
  try {
    url = await startNode(name);
  } catch (error) {
    stop();
    report(false, "local node", (error as Error).message.split("\n")[0]);
    return;
  }
  try {
    await localFlows(url);
  } finally {
    stop();
    console.log(`stopped ${name}`);
  }
}

async function localFlows(url: string) {
  const serverKey = (process.env.SERVER_PRIVATE_KEY?.trim() as Hex | undefined) || generatePrivateKey();
  const ctx = createArkiv({ network: "local", rpcUrl: url, serverKey });
  const [dreamer, visitor, agent, buyer] = Array.from({ length: 4 }, () => privateKeyToAccount(generatePrivateKey()));
  const dreamerWallet = ctx.wallet(dreamer);
  const agentWallet = ctx.wallet(agent);
  const buyerWallet = ctx.wallet(buyer);

  await check("local node", async () => {
    const funder = createWalletClient({ account: mnemonicToAccount(DEV_MNEMONIC), chain: ctx.chain, transport: http(url) });
    for (const to of [ctx.serverAddress, dreamer.address, visitor.address, agent.address, buyer.address]) {
      const hash = await funder.sendTransaction({ to, value: parseEther("10") });
      await ctx.reader.waitForTransactionReceipt({ hash });
    }
    const [chainId, timing, gasPrice] = await Promise.all([ctx.reader.getChainId(), ctx.reader.getBlockTiming(), getGasPrice(ctx.reader)]);
    return `chain ${chainId} at ${url}, ${timing.blockDuration}s blocks, gas price ${formatGwei(gasPrice)} gwei; funded server ${short(ctx.serverAddress)} and 4 test wallets`;
  });

  // Market
  let listingKey: Hex | undefined;
  let cheapKey: Hex | undefined;
  await check("listing: create + hand-over in one batch", async () => {
    const written = await listPiece(sampleListing(dreamer.address), ctx);
    listingKey = written.key;
    assert(await waitVisible(written.key, ctx), "not visible after the write");
    const entity = await ctx.reader.getEntity(written.key);
    const receipt = await gasOf(ctx, "listing: create + hand-over", written.txHash);
    const events = eventsIn(receipt.logs);
    assert(events.includes("EntityCreated") && events.includes("OwnershipTransferred"), `events ${events.join(", ")}`);
    assert(isAddressEqual(entity.$creator, ctx.serverAddress), `$creator ${entity.$creator}`);
    assert(isAddressEqual(entity.$owner, dreamer.address), `$owner ${entity.$owner}`);
    return `tx ${short(written.txHash)} carries ${events.join(" + ")}; $creator is the server, $owner the dreamer`;
  });

  await check("listing: a copy the dreamer writes is not the server's", async () => {
    const second = await listPiece(sampleListing(dreamer.address, { themes: ["chase"], priceUsdc: USDC(3), category: "portrait" }), ctx);
    cheapKey = second.key;
    await gasOf(ctx, "listing: create + hand-over", second.txHash);
    const spam = await dreamerWallet.createEntity(
      Listing,
      { pieceId: key(keccak256(stringToHex("spam"))), category: "comic", priceUsdc: u64(USDC(1)), editionsTotal: 1, editionsSold: 0, soldOut: false, sellerEns: "spam.eth", style: "ink", sealed: true, listedAt: u64(Math.floor(Date.now() / 1000)), saleEndsAt: u64(Math.floor(Date.now() / 1000) + 86_400), title: "spam", model: "x", th_water: true },
      { expiration: ExpirationTime.fromHours(1) },
    );
    assert(await waitVisible(spam.entityKey, ctx), "spam not visible");
    assert((await getListing(spam.entityKey, ctx)) === null, "getListing returned the dreamer's own copy");
    return `second listing ${short(second.key)}; self-written copy ${short(spam.entityKey)} is ignored`;
  });

  await check("market search: theme and price range, server-created only", async () => {
    const found = await searchMarket({ themes: ["water"], minPriceUsdc: USDC(1), maxPriceUsdc: USDC(10) }, ctx);
    assert(found.total === BigInt(1) && found.listings[0]?.key === listingKey, `got ${found.listings.map((l) => short(l.key)).join(", ")} (total ${found.total})`);
    const listing = found.listings[0];
    assert(listing.themes.join(",") === "water,flight" && listing.priceUsdc === USDC(8) && listing.editionsTotal === 10, "columns read back wrong");
    const none = await searchMarket({ themes: ["water"], maxPriceUsdc: USDC(5) }, ctx);
    assert(none.total === ZERO, `price cap let ${none.total} through`);
    return `water in the price range finds only ${short(listing.key)} ("${listing.title}"); the in-range spam copy is filtered by createdBy`;
  });

  await check("market search: sort by price and newest", async () => {
    const order = async (sort: "price-asc" | "price-desc" | "newest") => (await searchMarket({ sort }, ctx)).listings.map((l) => l.key);
    const [asc, descending, newest] = await Promise.all([order("price-asc"), order("price-desc"), order("newest")]);
    assert(asc.join() === [cheapKey, listingKey].join(), "price-asc wrong");
    assert(descending.join() === [listingKey, cheapKey].join(), "price-desc wrong");
    assert(newest.join() === [cheapKey, listingKey].join(), "newest wrong");
    return "price-asc puts the cheaper listing first, price-desc the dearer, newest the later one";
  });

  await check("listing: the dreamer patches editions sold", async () => {
    assert(listingKey, "no listing");
    const patched = await recordSale(dreamerWallet, listingKey, 3, ctx);
    await gasOf(ctx, "listing: patch editionsSold (owner)", patched.txHash);
    const after = await getListing(listingKey, ctx);
    assert(after?.editionsSold === 3 && !after.soldOut, `editionsSold ${after?.editionsSold}`);
    const last = await recordSale(dreamerWallet, listingKey, 10, ctx);
    await gasOf(ctx, "listing: patch editionsSold (owner)", last.txHash);
    const available = await searchMarket({ availableOnly: true }, ctx);
    assert(!available.listings.some((l) => l.key === listingKey), "a sold-out listing is still in availableOnly");
    return "3 of 10 sold, then 10 of 10 marks it sold out and availableOnly drops it";
  });

  await check("listing: the dreamer reprices, extends and delists", async () => {
    assert(cheapKey, "no listing");
    const listing = await getListing(cheapKey, ctx);
    assert(listing, "listing gone");
    const repriced = await setPrice(dreamerWallet, cheapKey, USDC(4));
    await gasOf(ctx, "listing: patch price (owner)", repriced.txHash);
    assert((await listingForPiece(listing.pieceId, ctx))?.priceUsdc === USDC(4), "listingForPiece did not see the new price");
    const until = new Date(Date.now() + 40 * 86_400_000);
    const extended = await extendSale(dreamerWallet, cheapKey, until);
    await gasOf(ctx, "listing: patch + extend sale (owner)", extended.txHash);
    const after = await getListing(cheapKey, ctx);
    assert(after && after.expiresAt > listing.expiresAt && after.saleEndsAt === Math.ceil(until.getTime() / 1000), "the sale was not extended");
    const removed = await delist(dreamerWallet, cheapKey);
    await gasOf(ctx, "listing: delete (owner)", removed.txHash);
    assert((await getListing(cheapKey, ctx)) === null, "still listed after delist");
    return `price patched and found by pieceId, expiry moved from block ${listing.expiresAt} to ${after.expiresAt}, then delisted`;
  });

  await check("listing: the server can't patch it after the hand-over", async () => {
    assert(listingKey, "no listing");
    const key = listingKey;
    const name = await rejects(() => ctx.server.patchEntity(Listing, key, { set: { title: "changed by server" } }), "NotOwner");
    return `refused with ${name}, before anything was sent`;
  });

  await check("stalls: tonight's picks, readonly until dawn", async () => {
    assert(listingKey && cheapKey, "no listings");
    const written = await openStalls([listingKey, cheapKey], ctx);
    await gasOf(ctx, "stalls: 2 in one batch (server)", written[0].txHash);
    const stalls = await tonightsStalls(ctx);
    assert(stalls.map((s) => s.key).join() === [listingKey].join(), `got ${stalls.map((s) => short(s.key)).join()}`);
    return `2 stalls in tx ${short(written[0].txHash)}; the one whose listing was delisted drops out`;
  });

  await check("a stale key prediction is refused whole", async () => {
    const [stale] = await ctx.reader.predictEntityKeys({ owner: ctx.serverAddress, count: 1 });
    await openStalls([listingKey as Hex], ctx); // takes the nonce the prediction was made from
    const nonce = await ctx.reader.getEntityNonce(ctx.serverAddress);
    const name = await rejects(
      () =>
        ctx.server.executeBatch({
          creates: [{ schema: Visit, values: { pass: key(namehash("stale.passes.dream-scape.eth")), host: addr(dreamer.address), scope: "gallery", endsAt: u64(0) }, expiration: ExpirationTime.fromMinutes(10), salt: stale.salt }],
          ownershipChanges: [{ entityKey: stale.key, newOwner: dreamer.address }],
        }),
      "EntityNotFound",
    );
    assert((await ctx.reader.getEntityNonce(ctx.serverAddress)) === nonce, "an entity was created anyway");
    return `refused with ${name} ("${lastMessage}"); nothing was created, so createFor can predict again`;
  });

  // Knocks and visits
  const pass = namehash(`p${randomLabel()}.passes.tester.dream-scape.eth`);
  let knockKey: Hex | undefined;
  await check("knock: found by the dreamer's query", async () => {
    const written = await knock({ visitor: visitor.address, pass, host: dreamer.address, scope: "published" }, ctx);
    knockKey = written.key;
    await gasOf(ctx, "knock: create + hand-over", written.txHash);
    assert(await waitVisible(written.key, ctx), "not visible");
    const knocks = await openKnocks(dreamer.address, {}, ctx);
    assert(knocks.length === 1 && knocks[0].key === written.key, `got ${knocks.length} knocks`);
    assert(isAddressEqual(knocks[0].visitor, visitor.address), `owned by ${knocks[0].visitor}`);
    assert((await openKnocks(visitor.address, {}, ctx)).length === 0, "the knock showed at the wrong gallery");
    return `knock ${short(written.key)} owned by the visitor, asking for "published"`;
  });

  await check("visit: active, then gone when it ends", async () => {
    const endsAt = new Date(Date.now() + 10_000);
    const written = await letIn({ dreamer: dreamer.address, pass, scope: "published", endsAt, knock: knockKey }, ctx);
    await gasOf(ctx, "visit: create + hand-over", written.txHash);
    assert(await waitVisible(written.key, ctx), "not visible");
    const visit = await activeVisit(dreamer.address, pass, ctx);
    assert(visit?.key === written.key && visit.scope === "published", "activeVisit did not return it");
    assert(isAddressEqual((await ctx.reader.getEntity(written.key)).$owner, dreamer.address), "not owned by the dreamer");
    assert((await activeVisit(dreamer.address, namehash("other.passes.dream-scape.eth"), ctx)) === null, "another pass got in");
    assert((await openKnocks(dreamer.address, {}, ctx)).length === 0, "the answered knock is still waiting");
    let closedAt = 0;
    for (let i = 0; i < 40 && !closedAt; i++) {
      if ((await activeVisit(dreamer.address, pass, ctx)) === null) closedAt = Date.now();
      else await sleep(1000);
    }
    assert(closedAt, "still active 40 s later");
    const lateBy = ((closedAt - endsAt.getTime()) / 1000).toFixed(1);
    let gone = false;
    for (let i = 0; i < 10 && !gone; i++) {
      try {
        await ctx.reader.getEntity(written.key);
        await sleep(1000);
      } catch (error) {
        gone = error instanceof NoEntityFoundError;
        if (!gone) throw error;
      }
    }
    assert(gone, "the node still returns the expired visit");
    return `active with scope "published"; null ${lateBy}s after endsAt, and getEntity says it no longer exists`;
  });

  await check("visit: one the dreamer writes alone grants nothing", async () => {
    const own = namehash(`self${randomLabel()}.passes.tester.dream-scape.eth`);
    const self = await dreamerWallet.createEntity(Visit, { pass: key(own), host: addr(dreamer.address), scope: "gallery", endsAt: u64(Math.floor(Date.now() / 1000) + 600) }, { expiration: ExpirationTime.fromMinutes(10) });
    assert(await waitVisible(self.entityKey, ctx), "not visible");
    assert((await activeVisit(dreamer.address, own, ctx)) === null, "a visit not created by the server was accepted");
    return `self-written visit ${short(self.entityKey)} is ignored by activeVisit`;
  });

  await check("visit: the dreamer ends one early", async () => {
    const early = namehash(`e${randomLabel()}.passes.tester.dream-scape.eth`);
    const written = await letIn({ dreamer: dreamer.address, pass: early, scope: "gallery", endsAt: new Date(Date.now() + 3_600_000) }, ctx);
    assert(await waitVisible(written.key, ctx), "not visible");
    assert(await activeVisit(dreamer.address, early, ctx), "not active");
    await rejects(() => endVisit(ctx.wallet(visitor), written.key), "NotOwner");
    const ended = await endVisit(dreamerWallet, written.key);
    await gasOf(ctx, "visit: delete (owner)", ended.txHash);
    assert((await activeVisit(dreamer.address, early, ctx)) === null, "still active after delete");
    return "the visitor can't delete it; the dreamer can, and the door closes at once";
  });

  // World Dream
  await check("World Dream: counts published readonly, read back by count", async () => {
    const circle = `test-${randomLabel()}`;
    await rejects(() => publishWorldDream({ date: "2026-11-05", circle, themes: [{ theme: "water", feeling: "calm", count: 4 }] }, ctx), "at least 5");
    const written = await publishWorldDream(
      { date: "2026-11-05", circle, themes: [{ theme: "flight", feeling: "joy", count: 6 }, { theme: "water", feeling: "wonder", count: 9 }] },
      ctx,
    );
    await gasOf(ctx, "World Dream: 2 counts in one batch (server)", written[0].txHash);
    const rows = await worldDream("2026-11-05", circle, ctx);
    assert(rows.map((r) => `${r.theme}:${r.count}`).join() === "water:9,flight:6", `got ${rows.map((r) => r.theme).join()}`);
    await rejects(() => publishWorldDream({ date: "2026-11-05", circle, themes: [{ theme: "home", feeling: "calm", count: 5 }] }, ctx), "already published");
    await rejects(() => ctx.server.patchEntity(WorldDream, written[0].key, { set: { count: 100 } }), "ReadOnlyEntity");
    return "a count of 4 is refused, water 9 then flight 6, a second publish is refused, and the rows are readonly";
  });

  // Vendor agents and commissions
  await check("vendor stall, commission, bid and claim", async () => {
    const vendor = await publishVendor({ agent: agent.address, ens: "ink.agents.dream-scape.eth", style: "ink", fromPriceUsdc: USDC(3), services: ["comic", "portrait"], menu: { comic: 3, portrait: 2 } }, ctx);
    await gasOf(ctx, "vendor stall: create + hand-over", vendor.txHash);
    assert(await waitVisible(vendor.key, ctx), "vendor not visible");
    const before = (await ctx.reader.getEntity(vendor.key)).$expiresAt;
    await sleep(2500);
    const beat = await heartbeat(agentWallet, vendor.key);
    await gasOf(ctx, "vendor heartbeat: patch + extend (agent)", beat.txHash);
    const after = (await ctx.reader.getEntity(vendor.key)).$expiresAt;
    assert(after > before, "heartbeat did not push the lease out");

    const commission = await requestCommission({ buyer: buyer.address, kind: "comic", budgetUsdc: USDC(5), deadline: new Date(Date.now() + 86_400_000), brief: "A four-panel comic about a cat who runs a lighthouse." }, ctx);
    await gasOf(ctx, "commission: create + hand-over", commission.txHash);
    assert(await waitVisible(commission.key, ctx), "commission not visible");
    const bid = await placeBid(agentWallet, { commission: commission.key, vendorEns: "ink.agents.dream-scape.eth", priceUsdc: USDC(4), etaHours: 2 }, ctx);
    await gasOf(ctx, "bid: create (agent)", bid.txHash);
    const stray = await placeBid(buyerWallet, { commission: commission.key, vendorEns: "nobody.eth", priceUsdc: USDC(1), etaHours: 1 }, ctx);
    assert(await waitVisible(stray.entityKey, ctx), "stray bid not visible");
    const bids = await bidsFor(commission.key, ctx);
    assert(bids.length === 1 && bids[0].key === bid.entityKey, `got ${bids.length} bids`);

    assert((await openCommissions("comic", ctx)).some((c) => c.key === commission.key), "not on the open board");
    const awarded = await awardCommission(buyerWallet, commission.key, bid.entityKey);
    await gasOf(ctx, "commission: award patch (buyer)", awarded.txHash);
    await rejects(() => awardCommission(agentWallet, commission.key, bid.entityKey), "NotOwner");
    const claim = await claimCommission(agentWallet, { commission: commission.key, vendorEns: "ink.agents.dream-scape.eth" });
    await gasOf(ctx, "claim: create (agent)", claim.txHash);
    assert(await waitVisible(claim.entityKey, ctx), "claim not visible");
    assert(!(await openCommissions("comic", ctx)).some((c) => c.key === commission.key), "still on the open board after the award");
    const claimed = await activeClaim(commission.key, agent.address, ctx);
    assert(claimed?.key === claim.entityKey, "claim not found");
    await sleep(2500);
    const renewed = await renewClaim(agentWallet, claim.entityKey);
    await gasOf(ctx, "claim: extend 2 hours (agent)", renewed.txHash);
    assert(renewed.expiresAt > claimed.expiresAt, "renewClaim did not push the claim out");
    return `heartbeat moved the lease from block ${before} to ${after}; 1 bid listed (the non-vendor's is dropped); the award takes it off the open board; the claim renews`;
  });
}

// ---------------------------------------------------------------- run

function printGas() {
  if (!gasRows.length) return;
  console.log("\nGas (local: used by the receipt; rabdi: the node's estimate, before the SDK's 25% headroom)");
  const seen = new Set<string>();
  for (const row of gasRows) {
    const id = `${row.network} ${row.op}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const cost = Number(row.gas) / 1e9; // tGLM at 1 gwei
    console.log(`  ${row.network.padEnd(5)} ${row.op.padEnd(44)} ${String(row.gas).padStart(9)} gas  ${cost.toFixed(6)} tGLM at 1 gwei`);
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (!args.has("--local-only")) await rabdiChecks();
  if (!args.has("--rabdi-only")) await localChecks();
  printGas();
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error((error as Error).message.split("\n")[0]);
  process.exit(1);
});
