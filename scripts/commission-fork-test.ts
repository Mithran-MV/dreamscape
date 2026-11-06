// Proves one paid vendor-agent commission end to end on a local anvil fork of Sepolia, against the real ENS
// contracts, the deployed NightMarket and Circle's USDC. The agent's Arkiv side runs on a local Arkiv node
// in Docker, and 0G's router and storage are stubbed. Every key but the server's is made here; nothing reaches a live network.
// node --env-file-if-exists=.env.local --import tsx scripts/commission-fork-test.ts [anvil fork rpc]
// With no rpc it starts its own fork on port 8553, so it needs anvil and Docker.
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "@arkiv-network/sdk/query";
import { key as keyValue } from "@arkiv-network/sdk/schema";
import sharp from "sharp";
import { createPublicClient, createTestClient, createWalletClient, formatUnits, http, maxUint64, parseAbi, parseEther, parseUnits, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const PORT = 8553;
const ARKIV_IMAGE = "ghcr.io/arkiv-network/arkiv-reth-dev:v1.0.1";
// The Arkiv dev node's well-known funded test account. It exists only on that throwaway local chain.
const DEV_MNEMONIC = "test test test test test test test test test test test junk";
// Any Sepolia holder of Circle's USDC works on a fork; this one is the owner of dream-scape.eth.
const USDC_HOLDER = "0x748138563A7DE3CAf9c756343F0bEdF57842D111" as Address;
const ROUTER = "http://router.0g.test/v1";
const NOTE = "A lighthouse keeper with a red scarf, holding a lantern on the rocks at dusk";

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function transfer(address to, uint256 amount) returns (bool)", "function approve(address spender, uint256 amount) returns (bool)"]);
const owned = parseAbi(["function owner() view returns (address)", "function setOperator(address operator, bool allowed)"]);
const eac = parseAbi(["function grantRootRoles(uint256 roleBitmap, address account) returns (bool)"]);
const tokens = parseAbi([
  "function findTokenId(string label) view returns (uint256)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
]);

const docker = (...args: string[]) => execFileSync(process.env.DOCKER ?? "docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
async function check(name: string, run: () => Promise<string | string[]>) {
  try {
    const out = await run();
    const [detail, ...notes] = Array.isArray(out) ? out : [out];
    console.log(`PASS ${name}: ${detail}`);
    for (const note of notes) console.log(`       ${note}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}: ${(error as Error).message.split("\n")[0]}`);
  }
}
function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const fmtGas = (gas: bigint) => `${gas.toLocaleString("en-US").padStart(10)} gas`;

// The 0G Storage SDK talks a lot while it works.
async function quietly<T>(run: () => Promise<T>): Promise<T> {
  const saved = [console.log, console.warn, console.error];
  console.log = console.warn = console.error = () => undefined;
  try {
    return await run();
  } finally {
    [console.log, console.warn, console.error] = saved;
  }
}

async function waitFor(url: string, what: string) {
  const client = createPublicClient({ transport: http(url, { retryCount: 0 }) });
  for (let i = 0; i < 60; i++) {
    if ((await client.getBlockNumber().catch(() => BigInt(0))) > BigInt(0)) return;
    await sleep(1000);
  }
  throw new Error(`${what} at ${url} did not start`);
}

async function startFork(upstream: string) {
  const given = process.argv[2];
  if (given) return { rpc: given, stop: () => undefined };
  const rpc = `http://127.0.0.1:${PORT}`;
  const busy = await createPublicClient({ transport: http(rpc, { retryCount: 0 }) }).getChainId().then(() => true, () => false);
  if (busy) throw new Error(`port ${PORT} is already in use. Stop what runs there, or pass its RPC URL.`);
  const child = spawn(process.env.ANVIL ?? "anvil", ["--fork-url", upstream, "--port", String(PORT), "--silent"], { stdio: "ignore" });
  await waitFor(rpc, "anvil");
  return { rpc, stop: () => child.kill() };
}

async function startArkiv(name: string) {
  // 2-second blocks like Rabdi, so claim and stall lifetimes mean what they say.
  docker("run", "-d", "--rm", "--name", name, "-p", "127.0.0.1::8545", ARKIV_IMAGE, "node", "--dev", "--dev.block-time", "2s", "--http", "--http.addr", "0.0.0.0", "--http.api", "eth,net,web3,txpool", "--datadir", "/data");
  const url = `http://127.0.0.1:${docker("port", name, "8545/tcp").split("\n")[0].split(":").pop()}`;
  await waitFor(url, "the Arkiv node");
  return url;
}

// A stand-in for 0G Storage's indexer and one storage node. The real SDK computes the root of the encrypted
// file and asks the node about it; the node says it already holds it, so no Galileo transaction is needed.
function startStorage() {
  const state = { down: false, roots: [] as string[] };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const call = JSON.parse(body || "{}") as { id: number; method: string; params?: unknown[] };
      const reply = (result: unknown) => res.end(JSON.stringify({ jsonrpc: "2.0", id: call.id, result }));
      if (state.down) {
        res.statusCode = 503;
        return res.end("storage is down");
      }
      const self = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      if (call.method === "indexer_getShardedNodes") return reply({ trusted: [{ url: self, config: { numShard: 1, shardId: 0 }, latency: 1, since: 0 }], discovered: [] });
      if (call.method === "zgs_getStatus") return reply({ connectedPeers: 1, logSyncHeight: 1, nextTxSeq: 2, networkIdentity: { chainId: 16602, flowAddress: `0x${"11".repeat(20)}`, p2pProtocolVersion: { major: 0, minor: 4, build: 0 } } });
      if (call.method === "zgs_getFileInfo") {
        const root = String(call.params?.[0]);
        state.roots.push(root);
        return reply({ tx: { streamIds: [], data: "0x", dataMerkleRoot: root, merkleNodes: [], startEntryIndex: 0, size: 1, seq: 7 }, finalized: true, isCached: false, uploadedSegNum: 1, pruned: false });
      }
      res.end(JSON.stringify({ jsonrpc: "2.0", id: call.id, error: { code: -32601, message: `no ${call.method}` } }));
    });
  });
  return new Promise<{ url: string; state: typeof state; stop: () => void }>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, state, stop: () => server.close() })),
  );
}

// A stand-in for 0G's router: sealed paintings come back as a small test PNG, or a 503 while it's "down".
function stubRouter(png: Buffer) {
  const state = { down: 0, calls: [] as { model: string; prompt: string; trust: string | null }[] };
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(ROUTER)) return real(input, init);
    const body = JSON.parse(String(init?.body ?? "{}")) as { model: string; prompt: string };
    state.calls.push({ model: body.model, prompt: body.prompt, trust: new Headers(init?.headers).get("X-0G-Provider-Trust-Mode") });
    if (state.down > 0) {
      state.down--;
      return new Response(JSON.stringify({ error: { code: "no_provider_for_trust_mode" } }), { status: 503 });
    }
    const trace = { request_id: `req-${state.calls.length}`, provider: "0xstub", tee_verified: true, billing: { total_cost_usd_micro: 25200 } };
    return Response.json({ data: [{ b64_json: png.toString("base64") }], x_0g_trace: trace });
  }) as typeof fetch;
  return state;
}

async function main() {
  const upstream = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const fork = await startFork(upstream);
  const arkivName = `dreamscape-commission-arkiv-${process.pid}`;
  const storage = await startStorage();
  let arkivStarted = false;
  try {
    const arkivUrl = await startArkiv(arkivName);
    arkivStarted = true;
    // Everything below reads its networks and keys from the env, so point it all at throwaway ones.
    Object.assign(process.env, {
      SEPOLIA_RPC_URL: fork.rpc,
      DATA_DIR: mkdtempSync(join(tmpdir(), "dreamscape-commission-")),
      ARKIV_NETWORK: "local",
      ARKIV_RPC_URL: arkivUrl,
      // The live server already owns market.dream-scape.eth on Sepolia, so the fork keeps its key; the fork never
      // reaches a live network, so nothing it signs leaves this machine.
      SERVER_PRIVATE_KEY: process.env.SERVER_PRIVATE_KEY || generatePrivateKey(),
      SCRIBE_PRIVATE_KEY: generatePrivateKey(),
      AGENT_PRIVATE_KEY: generatePrivateKey(),
      // A fresh agent each run, since the live one already belongs to the real vendor.
      AGENT_LABEL: `portraits${randomBytes(3).toString("hex")}`,
      MASTER_KEY: randomBytes(32).toString("hex"),
      ZG_API_KEY: "sk-stub",
      ZG_ROUTER_URL: ROUTER,
      ZG_STORAGE_INDEXER: storage.url,
      GALILEO_RPC_URL: storage.url,
    });
    const painted = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#3662a0" } }).png().toBuffer();
    const router = stubRouter(painted);
    await run(fork.rpc, arkivUrl, storage.state, router, painted);
  } finally {
    if (arkivStarted) docker("stop", arkivName);
    storage.stop();
    fork.stop();
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exitCode = failures ? 1 : 0;
}

async function run(rpc: string, arkivUrl: string, storage: { down: boolean; roots: string[] }, router: ReturnType<typeof stubRouter>, painted: Buffer) {
  const { env } = await import("../src/lib/server/env");
  const { getDb, now } = await import("../src/lib/server/db");
  const { dns, ensClients, findParent, revertName, same } = await import("../src/lib/server/ens/client");
  const { ALL_ROLES, REG, RES, UNIVERSAL_HELPER, helperAbi, registryAbi } = await import("../src/lib/server/ens/contracts");
  const { onboardDreamer } = await import("../src/lib/server/ens/onboard");
  const agents = await import("../src/lib/server/ens/agents");
  const { arkiv } = await import("../src/lib/server/arkiv/client");
  const { activeClaim, getCommission: getRequest } = await import("../src/lib/server/arkiv/agents");
  const { Claim } = await import("../src/lib/server/arkiv/schemas");
  const { ZeroGError } = await import("../src/lib/server/zerog/router");
  const cm = await import("../src/lib/server/commissions");
  const vendor = await import("../src/lib/server/vendor");

  const ens = ensClients(rpc);
  // Never run against a live network: this script funds accounts and impersonates owners.
  const node = String(await ens.client.request({ method: "web3_clientVersion" }));
  if (!node.toLowerCase().startsWith("anvil")) throw new Error(`${rpc} is ${node}, not an anvil fork.`);
  if ((await ens.client.getChainId()) !== sepolia.id) throw new Error(`${rpc} is not a fork of Sepolia.`);
  if (arkiv().network !== "local") throw new Error("Arkiv is not the local node.");

  const test = createTestClient({ mode: "anvil", chain: sepolia, transport: http(rpc) });
  const market = env.nightMarket();
  if (!market) throw new Error("NIGHT_MARKET_ADDRESS is not set.");
  const usdc = env.usdc();
  const server = ens.server.account.address;
  const agentKey = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as Hex);
  const agent = agentKey.address;
  const wallet = (account: ReturnType<typeof privateKeyToAccount>) => createWalletClient({ account, chain: sepolia, transport: http(rpc) });
  const balance = (who: Address) => ens.client.readContract({ address: usdc, abi: erc20, functionName: "balanceOf", args: [who] });
  for (const address of [server, ens.scribe.account.address]) await test.setBalance({ address, value: parseEther("10") });

  // The live server is NightMarket's operator and DreamscapeRegistry's registrar. The fresh one here gets the same roles.
  const impersonated = (who: Address) => createWalletClient({ account: who, chain: sepolia, transport: http(rpc) });
  const as = async (who: Address, send: (w: ReturnType<typeof impersonated>) => Promise<Hex>) => {
    await test.impersonateAccount({ address: who });
    await test.setBalance({ address: who, value: parseEther("1") });
    try {
      const receipt = await ens.client.waitForTransactionReceipt({ hash: await send(impersonated(who)) });
      if (receipt.status !== "success") throw new Error(`a transaction from ${who} reverted`);
    } finally {
      await test.stopImpersonatingAccount({ address: who });
    }
  };
  const marketOwner = await ens.client.readContract({ address: market, abi: owned, functionName: "owner" });
  await as(marketOwner, (w) => w.writeContract({ address: market, abi: owned, functionName: "setOperator", args: [server, true] }));
  const parent = await findParent(ens.client);
  await as(parent.owner, (w) =>
    w.writeContract({ address: parent.subregistry, abi: eac, functionName: "grantRootRoles", args: [REG.REGISTRAR | REG.RENEW, server] }),
  );
  const arkivChain = createPublicClient({ transport: http(arkivUrl) });
  const arkivStart = await arkivChain.getBlockNumber();
  const devFunder = createWalletClient({ account: mnemonicToAccount(DEV_MNEMONIC), chain: arkiv().chain, transport: http(arkivUrl) });
  await arkiv().reader.waitForTransactionReceipt({ hash: await devFunder.sendTransaction({ to: arkiv().serverAddress, value: parseEther("10") }) });

  // Fresh accounts: anvil's well-known ones carry EIP-7702 code on Sepolia and can't receive name tokens.
  const fresh = () => privateKeyToAccount(generatePrivateKey());
  const owner = fresh();
  const buyer = fresh();
  const friend = fresh();
  const stranger = fresh();
  const tag = toHex(randomBytes(3)).slice(2);
  const ownerHandle = `vendor${tag}`;
  const buyerHandle = `sam${tag}`;
  process.env.VENDOR_OWNER_HANDLE = ownerHandle;
  const db = getDb();
  const addUser = (id: string, handle: string, address: Address, ensJson: string | null = null) =>
    db.prepare("INSERT INTO users (id, handle, wallet, pass_hash, ens_json, created_at) VALUES (?, ?, ?, 'x', ?, ?)").run(id, handle, address, ensJson, now());
  console.log(`Fork of Sepolia at block ${await ens.client.getBlockNumber()}, NightMarket ${market}, local Arkiv node, 0G stubbed\n`);

  const onboarded = await onboardDreamer(ens, { handle: ownerHandle, dreamer: owner.address, nightMarket: market });
  addUser("owner", ownerHandle, owner.address, JSON.stringify({ name: onboarded.name, resolver: onboarded.resolver, editions: onboarded.editions, passes: onboarded.passes }));
  addUser("buyer", buyerHandle, buyer.address);
  addUser("friend", `friend${tag}`, friend.address);
  addUser("stranger", `stranger${tag}`, stranger.address);
  const label = vendor.agentLabel();
  const gasNotes: string[] = [];

  let setup: Awaited<ReturnType<typeof vendor.setupVendor>> | undefined;
  await check("the agent namespace exists and its records resolve", async () => {
    setup = await vendor.setupVendor(ens, arkiv());
    const found = await agents.readAgent(ens.client, label);
    expect(found, `${agents.agentName(label)} has no resolver of its own`);
    expect(found.address && same(found.address, owner.address), `addr is ${found.address}, not the owner`);
    expect(found.context === vendor.AGENT_CONTEXT, `agent-context reads ${found.context}`);
    expect(found.web === vendor.agentEndpoint(label), `agent-endpoint[web] reads ${found.web}`);
    expect(found.prices?.portrait === 4, `prices reads ${found.rawPrices}`);
    expect(same(found.resolver, setup.resolver), "the name isn't served by the agent's own resolver");
    expect(!same(found.resolver, onboarded.resolver), "the agent shares the owner's gallery resolver");
    const canonical = await ens.client.readContract({ address: UNIVERSAL_HELPER, abi: helperAbi, functionName: "findCanonicalRegistry", args: [dns(agents.marketName())] });
    expect(same(canonical, setup.marketRegistry), `findCanonicalRegistry(${agents.marketName()}) is ${canonical}`);
    expect(same(await agents.agentHolder(ens.client, setup.marketRegistry, label), owner.address), "the owner doesn't hold the agent's name");
    gasNotes.push(...setup.sepolia.map((s) => `${fmtGas(s.gasUsed)}  server: ${s.step}`));
    return [
      `${found.name} -> addr ${found.address}, prices ${found.rawPrices}, held by the owner`,
      `market registry ${setup.marketRegistry} (canonical), agent resolver ${setup.resolver}`,
      `agent-context: ${found.context}`,
      `agent-endpoint[web]: ${found.web}`,
      ...setup.sepolia.map((s) => `${fmtGas(s.gasUsed)}  ${s.step}`),
    ];
  });

  await check("setup is safe to rerun", async () => {
    const again = await vendor.setupVendor(ens, arkiv());
    expect(again.sepolia.length === 0, `the rerun sent ${again.sepolia.map((s) => s.step).join(", ")}`);
    expect(again.stall === setup?.stall, "the rerun opened a second stall");
    return `no Sepolia transaction; on Arkiv only "${again.arkiv.map((s) => s.step).join(", ")}"`;
  });

  await check("the agent's stall is live on Arkiv, created by the server and owned by the agent", async () => {
    const stall = (await vendor.liveStalls()).find((s) => s.ens === agents.agentName(label));
    expect(stall, "no live stall for the agent");
    const row = await arkiv().reader.getEntity(setup!.stall);
    expect(same(row.$owner, agent) && same(row.$creator, server), `owner ${row.$owner}, creator ${row.$creator}`);
    const before = row.$expiresAt;
    await sleep(2500);
    await vendor.heartbeatJob(label);
    const after = (await arkiv().reader.getEntity(setup!.stall)).$expiresAt;
    expect(after > before, `the heartbeat left the stall's expiry at ${after}`);
    return `${stall.ens}, from ${stall.fromPriceUsdc} USDC; a heartbeat moved its expiry from block ${before} to ${after}`;
  });

  await check("the agent key is limited to its two keys", async () => {
    const resolver = setup!.resolver;
    const step = await agents.setAgentPrices(ens.client, wallet(agentKey), label, { portrait: 5 });
    const prices = (await agents.readAgent(ens.client, label))?.prices;
    expect(prices?.portrait === 5, `prices reads ${JSON.stringify(prices)} after the agent's write`);
    expect((await agents.agentAttempt(ens.client, agent, label, { kind: "text", key: agents.AGENT_KEYS.context })) === undefined, "the agent can't write agent-context");
    const refused: string[] = [];
    for (const attempt of [{ kind: "addr" }, { kind: "text", key: agents.AGENT_KEYS.web }, { kind: "text", key: "url" }, { kind: "text", key: "avatar" }] as const) {
      const reason = await agents.agentAttempt(ens.client, agent, label, attempt);
      const what = attempt.kind === "addr" ? "addr" : attempt.key;
      expect(reason === "EACUnauthorizedAccountRoles", `${what} from the agent gave ${reason ?? "a successful write"}`);
      refused.push(what);
    }
    const agentRoles = await agents.agentRoles(ens.client, resolver, agent);
    expect(agentRoles.root === BigInt(0), `the agent holds ${agentRoles.root.toString(16)} at the root`);
    for (const k of agentRoles.keys) {
      const want = (agents.AGENT_WRITABLE as readonly string[]).includes(k.key) ? RES.SET_TEXT : BigInt(0);
      expect(k.roles === want, `the agent holds ${k.roles.toString(16)} on ${k.key}`);
    }
    const serverRoles = await agents.agentRoles(ens.client, resolver, server);
    expect(serverRoles.root === BigInt(0) && serverRoles.keys.every((k) => k.roles === BigInt(0)), "the server kept a role on the agent's resolver");
    expect((await agents.agentRoles(ens.client, resolver, owner.address)).root === ALL_ROLES, "the owner doesn't hold every role");
    gasNotes.push(`${fmtGas(step.gasUsed)}  agent: set prices`);
    return [`the agent set prices to {"portrait":5}; ${refused.join(", ")} were refused with EACUnauthorizedAccountRoles`, "the owner holds every role, the server none", `${fmtGas(step.gasUsed)}  agent sets prices`];
  });

  // Test USDC for the buyer and the stranger, from a Sepolia holder.
  await as(USDC_HOLDER, (w) => w.writeContract({ address: usdc, abi: erc20, functionName: "transfer", args: [buyer.address, parseUnits("10", 6)] }));
  await as(USDC_HOLDER, (w) => w.writeContract({ address: usdc, abi: erc20, functionName: "transfer", args: [stranger.address, parseUnits("2", 6)] }));
  for (const who of [buyer.address, stranger.address, friend.address]) await test.setBalance({ address: who, value: parseEther("1") });
  const commonsFund = await ens.client.readContract({ address: market, abi: cm.commissionAbi, functionName: "commonsFund" });
  const commonsBps = await ens.client.readContract({ address: market, abi: cm.commissionAbi, functionName: "commonsBps" });
  const before = { owner: await balance(owner.address), commons: await balance(commonsFund), market: await balance(market), buyer: await balance(buyer.address) };

  let id: Hex = "0x";
  let price = BigInt(0);
  await check("the buyer pays into escrow", async () => {
    const made = await cm.createCommission("buyer", { agent: label, style: "watercolour", note: NOTE });
    expect(!("error" in made), "error" in made ? made.error : "");
    id = made.id;
    price = parseUnits(String(made.priceUsdc), 6);
    expect(price === parseUnits("5", 6), `the price is ${made.priceUsdc}, not the agent's new 5 USDC`);
    let last: Hex = "0x";
    const paidGas: string[] = [];
    // The same two transactions the browser sends from the buyer's Privy wallet.
    for (const [i, tx] of made.txs.entries()) {
      last = await wallet(buyer).sendTransaction({ to: tx.to, data: tx.data });
      const receipt = await ens.client.waitForTransactionReceipt({ hash: last });
      expect(receipt.status === "success", `transaction ${i + 1} reverted`);
      paidGas.push(`${fmtGas(receipt.gasUsed)}  buyer: ${i === 0 ? "approve USDC" : "requestCommission"}`);
    }
    const paid = await cm.recordPayment(id, last);
    expect(paid.ok && paid.status === "paid", `recordPayment gave ${JSON.stringify(paid)}`);
    const onChain = await cm.readOnChain(id);
    expect(onChain.status === cm.ON_CHAIN.open && same(onChain.buyer, buyer.address) && same(onChain.vendorAgent, agent), "NightMarket holds no open escrow for the buyer");
    expect((await balance(market)) - before.market === price, "NightMarket didn't take the price");
    expect(before.buyer - (await balance(buyer.address)) === price, "the buyer didn't pay the price");
    gasNotes.push(...paidGas);
    return [`5 USDC held by NightMarket for ${made.name}, deadline in 48 hours, checked from the CommissionRequested event`, ...paidGas];
  });

  await check("the request is on Arkiv, owned by the buyer, without the note", async () => {
    await cm.recordRequestJob(id);
    const key = cm.getCommission(id)?.arkiv_key;
    expect(key, "no Arkiv request");
    const request = await getRequest(key);
    expect(request, "the request isn't readable, or the server didn't create it");
    expect(same(request.buyer, buyer.address), `the request belongs to ${request.buyer}`);
    expect(!request.brief.toLowerCase().includes("lighthouse") && !request.brief.includes("scarf"), "the note leaked onto Arkiv");
    expect(cm.parseBrief(request.brief).commission === id, "the brief doesn't name the escrow");
    cm.updateCommission(id, { arkiv_key: null });
    await cm.recordRequestJob(id);
    expect(cm.getCommission(id)?.arkiv_key === key, "a rerun wrote a second request");
    return `${key.slice(0, 12)}…, brief ${request.brief}; a rerun found it instead of writing again`;
  });

  await check("the agent claims", async () => {
    await vendor.claimJob(id);
    const c = cm.getCommission(id)!;
    expect(c.status === "claimed" && c.claim_key, `status ${c.status}`);
    const claim = await activeClaim(c.arkiv_key!, agent);
    expect(claim?.key === c.claim_key, "no live claim by the agent's own wallet");
    return `claim ${c.claim_key!.slice(0, 12)}… by the agent, after it checked the request on Arkiv and the escrow on NightMarket`;
  });

  await check("while 0G is down the agent waits, then tries again", async () => {
    // Down for the default painter and every backup, as in a real outage; one busy model is covered by the backups.
    router.down = 1 + env.zgPaint().backups.length;
    const first = await vendor.makeJob(id).then(() => null, (e: unknown) => e);
    expect(first instanceof ZeroGError && first.retryable, `a router 503 gave ${String(first)}`);
    let c = cm.getCommission(id)!;
    expect(c.status === "making" && !c.storage_root && c.error?.includes("503"), `after the router failed: ${c.status}, ${c.error}`);
    storage.down = true;
    const second = await quietly(() => vendor.makeJob(id).then(() => null, (e: unknown) => e));
    storage.down = false;
    expect(second instanceof ZeroGError && second.retryable, `a storage outage gave ${String(second)}`);
    c = cm.getCommission(id)!;
    expect(!c.storage_root && c.status === "making", "a root was saved while storage was down");
    return "a router 503 and a storage outage both left it making, to be retried as the worker retries 0G";
  });

  await check("the agent delivers", async () => {
    const painting = router.calls.length;
    await quietly(() => vendor.makeJob(id));
    const c = cm.getCommission(id)!;
    expect(c.status === "delivered" && c.deliver_tx, `status ${c.status}, ${c.error}`);
    expect(router.calls.length === painting, "it painted again instead of using the piece it had");
    expect(c.storage_root && c.storage_root === storage.roots.at(-1), "the delivered root isn't the one 0G Storage computed");
    const receipt = await ens.client.waitForTransactionReceipt({ hash: c.deliver_tx });
    expect(same(receipt.from, agent), `delivered from ${receipt.from}, not the agent`);
    const onChain = await cm.readOnChain(id);
    expect(onChain.status === cm.ON_CHAIN.delivered, "NightMarket doesn't show it delivered");
    const sealed = router.calls.filter((call) => call.model === "z-image-turbo");
    expect(sealed.every((call) => call.trust === "private" && call.prompt.includes(NOTE) && call.prompt.includes("watercolour")), "the painting wasn't asked for sealed, from the note and style");
    const claims = await arkiv().reader.select("*").from(Claim).where(eq("commission", keyValue(c.arkiv_key!))).limit(10).fetch();
    expect(claims.entities.length === 1, `${claims.entities.length} claims on Arkiv for one commission`);
    await vendor.notifyJob(id);
    gasNotes.push(`${fmtGas(receipt.gasUsed)}  agent: deliver`);
    return [`root ${c.storage_root.slice(0, 14)}… from the real 0G Storage SDK, delivered by the agent's own key`, `${fmtGas(receipt.gasUsed)}  agent: deliver`];
  });

  const c = () => cm.getCommission(id)!;
  await check("the buyer owns the one-of-one name", async () => {
    const holder = await ens.client.readContract({ address: onboarded.editions, abi: registryAbi, functionName: "findOwner", args: [c().label] });
    expect(same(holder, buyer.address), `the name belongs to ${holder}`);
    const expiry = await ens.client.readContract({ address: onboarded.editions, abi: registryAbi, functionName: "findExpiry", args: [c().label] });
    expect(expiry === maxUint64, `it expires at ${expiry}`);
    const tokenId = await ens.client.readContract({ address: onboarded.editions, abi: tokens, functionName: "findTokenId", args: [c().label] });
    const roles = await ens.client.readContract({ address: onboarded.editions, abi: registryAbi, functionName: "roles", args: [tokenId, buyer.address] });
    expect(roles === REG.CAN_TRANSFER_ADMIN, `the buyer holds ${roles.toString(16)} on it`);
    const marketRoles = await ens.client.readContract({ address: onboarded.editions, abi: registryAbi, functionName: "roles", args: [tokenId, market] });
    expect(marketRoles === BigInt(0), "NightMarket holds a role on the buyer's name");
    return `${cm.commissionName(c().label, ownerHandle)}, forever, transferable, nobody else holds a role on it`;
  });

  await check("the split is exact", async () => {
    const commons = (price * BigInt(commonsBps)) / BigInt(10_000);
    const got = { owner: (await balance(owner.address)) - before.owner, commons: (await balance(commonsFund)) - before.commons, market: (await balance(market)) - before.market };
    expect(got.owner === price - commons, `the owner got ${formatUnits(got.owner, 6)}`);
    expect(got.commons === commons, `the commons got ${formatUnits(got.commons, 6)}`);
    expect(got.market === BigInt(0), `NightMarket kept ${formatUnits(got.market, 6)}`);
    expect((await balance(agent)) === BigInt(0), "the agent's own key was paid");
    return `owner ${formatUnits(got.owner, 6)} USDC, commons ${formatUnits(got.commons, 6)} (${commonsBps} bps), escrow back to zero, agent key nothing`;
  });

  await check("only the holder opens the piece", async () => {
    const opened = await cm.commissionFile(id, "buyer");
    expect(opened && opened.bytes.equals(painted), "the buyer can't open the piece");
    for (const who of ["stranger", "owner", "friend"]) expect(!(await cm.commissionFile(id, who)), `${who} can open it`);
    const tokenId = await ens.client.readContract({ address: onboarded.editions, abi: tokens, functionName: "findTokenId", args: [c().label] });
    const hash = await wallet(buyer).writeContract({ address: onboarded.editions, abi: tokens, functionName: "safeTransferFrom", args: [buyer.address, friend.address, tokenId, BigInt(1), "0x"] });
    expect((await ens.client.waitForTransactionReceipt({ hash })).status === "success", "the transfer reverted");
    expect(await cm.commissionFile(id, "friend"), "the friend can't open it after the name moved");
    expect(!(await cm.commissionFile(id, "buyer")), "the buyer still can after giving the name away");
    const view = await cm.commissionView(id, "friend");
    expect(view?.holds && view.note === null, "the friend sees the buyer's note");
    return "buyer yes; stranger, vendor owner and friend no; after a transfer the friend yes and the buyer no, without the note";
  });

  await check("a stranger's request for an unbound agent is refused", async () => {
    const refused = await cm.createCommission("stranger", { agent: "nobody", style: "oil", note: NOTE });
    expect("error" in refused, "the server handed out transactions for an unknown agent");
    const held = await balance(stranger.address);
    const approve = await wallet(stranger).writeContract({ address: usdc, abi: erc20, functionName: "approve", args: [market, parseUnits("1", 6)] });
    await ens.client.waitForTransactionReceipt({ hash: approve });
    const deadline = (await ens.client.getBlock()).timestamp + BigInt(3600);
    const attempts = [
      { why: "an unbound agent", agent: fresh().address, owner: owner.address },
      { why: "the real agent, paid to the stranger", agent, owner: stranger.address },
    ];
    const reasons: string[] = [];
    for (const a of attempts) {
      const reason = await ens.client
        .simulateContract({
          account: stranger,
          address: market,
          abi: cm.commissionAbi,
          functionName: "requestCommission",
          args: [toHex(randomBytes(32)), a.agent, a.owner, parseUnits("1", 6), deadline, onboarded.editions, `stray-${tag}`],
        })
        .then(() => undefined, (e: unknown) => revertName(e));
      expect(reason === "AgentNotBound", `${a.why} gave ${reason ?? "a successful request"}`);
      reasons.push(`${a.why}: ${reason}`);
    }
    expect((await balance(stranger.address)) === held, "the stranger's USDC moved");
    return `the server refused ("${refused.error}"); NightMarket refused ${reasons.join("; ")}`;
  });

  if (gasNotes.length) {
    console.log("\nGas on Sepolia, from the fork:");
    for (const line of gasNotes) console.log(`  ${line}`);
  }

  // Every Arkiv write the server and the agent made, for the gas they need on Rabdi.
  const who: Record<string, string> = { [server.toLowerCase()]: "server", [agent.toLowerCase()]: "agent" };
  const spent: Record<string, { txs: number; gas: bigint }> = {};
  const end = await arkivChain.getBlockNumber();
  for (let n = arkivStart; n <= end; n++) {
    const block = await arkivChain.getBlock({ blockNumber: n, includeTransactions: true });
    for (const tx of block.transactions) {
      const name = who[tx.from.toLowerCase()];
      if (!name) continue;
      const receipt = await arkivChain.getTransactionReceipt({ hash: tx.hash });
      spent[name] ??= { txs: 0, gas: BigInt(0) };
      spent[name].txs++;
      spent[name].gas += receipt.gasUsed;
    }
  }
  console.log("\nGas on Arkiv, from the local node:");
  for (const [name, s] of Object.entries(spent)) console.log(`  ${name}: ${s.txs} writes, ${s.gas.toLocaleString("en-US")} gas, about ${(s.gas / BigInt(s.txs)).toLocaleString("en-US")} each`);
}

main().catch((error) => {
  console.log(`FAIL setup: ${(error as Error).message.split("\n")[0]}`);
  process.exitCode = 1;
});
