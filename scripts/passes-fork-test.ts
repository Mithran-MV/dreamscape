// Proves family passes on a local anvil fork of Sepolia: grant, scope, found by name, no transfer, revoked by the host, expiry.
// With --arkiv it also runs visits on a throwaway Arkiv dev node in Docker, through src/lib/server/visits.ts and a
// throwaway SQLite file: knock, let in, active, expired, the three-part check, both scopes, and a revoke mid-visit.
// Start a fork (anvil --fork-url https://ethereum-sepolia-rpc.publicnode.com --port 8547), then run
// node --env-file-if-exists=.env.local --import tsx scripts/passes-fork-test.ts http://127.0.0.1:8547 [--arkiv]
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExpirationTime, NoEntityFoundError } from "@arkiv-network/sdk";
import { addr, key, u64 } from "@arkiv-network/sdk/schema";
import { createTestClient, createWalletClient, http, isAddressEqual, labelhash, parseEther, zeroAddress, type Address, type Hex } from "viem";
import { generatePrivateKey, mnemonicToAccount, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { env } from "../src/lib/server/env";
import { getDb } from "../src/lib/server/db";
import { createDream, putBlob, updateDream } from "../src/lib/server/dreams";
import { panelKey } from "../src/lib/server/nightly";
import { bootstrapRegistry, mountRegistry } from "../src/lib/server/ens/bootstrap";
import { DAY_KEYS, ensClients, ensReader, findParent, mined, revertName, same, type Ens, type Step } from "../src/lib/server/ens/client";
import { UNIVERSAL_RESOLVER, registryAbi } from "../src/lib/server/ens/contracts";
import { onboardDreamer, type Onboarded } from "../src/lib/server/ens/onboard";
import { findPass, grantPass, newPassLabel, passGone, passName, passRegistryAbi, passScope, revokePassTx } from "../src/lib/server/ens/passes";
import { activeVisit, arkiv, Visit } from "../src/lib/server/arkiv";
import * as visits from "../src/lib/server/visits";

let failures = 0;

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const fmt = (gas: bigint) => gas.toLocaleString("en-US");
const total = (steps: Step[]) => steps.reduce((sum, s) => sum + s.gasUsed, BigInt(0));
const short = (hex: string) => `${hex.slice(0, 10)}…`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Outcome = { detail: string; notes?: string[]; steps?: Step[] };

async function check(name: string, run: () => Promise<Outcome>) {
  try {
    const { detail, notes = [], steps = [] } = await run();
    console.log(`PASS ${name}: ${detail}${steps.length ? ` (gas ${fmt(total(steps))})` : ""}`);
    for (const step of steps) console.log(`       ${fmt(step.gasUsed).padStart(10)} gas  ${step.step}`);
    for (const note of notes) console.log(`       ${note}`);
    return true;
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}: ${(error as Error).message.split("\n")[0]}`);
    return false;
  }
}

// The error a call from `account` would revert with, or undefined if it would go through.
async function attempt(ens: Ens, account: PrivateKeyAccount | Address, address: Address, functionName: "unregister" | "unsafeTransfer" | "safeTransferFrom", args: readonly unknown[]) {
  try {
    await ens.client.simulateContract({ account, address, abi: passRegistryAbi, functionName, args } as Parameters<typeof ens.client.simulateContract>[0]);
    return undefined;
  } catch (error) {
    return revertName(error) ?? (error as Error).message.split("\n")[0];
  }
}

type Person = { account: PrivateKeyAccount; handle: string; setup?: Onboarded };

async function main() {
  const args = new Set(process.argv.slice(2));
  const rpc = process.argv.slice(2).find((a) => a.startsWith("http")) ?? env.ensForkRpc();
  if (!rpc) throw new Error("Pass the anvil fork's RPC URL, or set ENS_FORK_RPC_URL.");
  // From here on the app's own code, which reads SEPOLIA_RPC_URL, talks to the fork too.
  process.env.SEPOLIA_RPC_URL = rpc;
  const ens = ensClients(rpc);
  // Never run against a live network: this script funds accounts, impersonates the owner and moves time.
  const node = String(await ens.client.request({ method: "web3_clientVersion" }));
  if (!node.toLowerCase().startsWith("anvil")) throw new Error(`${rpc} is ${node}, not an anvil fork.`);
  if ((await ens.client.getChainId()) !== sepolia.id) throw new Error(`${rpc} is not a fork of Sepolia.`);
  expect(env.sepoliaRpc() === rpc, "SEPOLIA_RPC_URL did not take");

  const test = createTestClient({ mode: "anvil", chain: sepolia, transport: http(rpc) });
  const parent = await findParent(ens.client);
  // Fresh accounts: anvil's well-known ones carry EIP-7702 code on Sepolia and can't receive name tokens.
  const person = (prefix: string): Person => {
    const account = privateKeyToAccount(generatePrivateKey());
    return { account, handle: `${prefix}-${account.address.slice(2, 8).toLowerCase()}` };
  };
  const host = person("host");
  const visitor = person("guest");
  const stranger = person("stranger");
  for (const address of [ens.server.account.address, ens.scribe.account.address, parent.owner, host.account.address, visitor.account.address, stranger.account.address]) {
    await test.setBalance({ address, value: parseEther("10") });
  }
  const hostWallet = createWalletClient({ account: host.account, chain: sepolia, transport: http(rpc) });
  console.log(`Fork of Sepolia at block ${await ens.client.getBlockNumber()}, host ${host.handle}, visitor ${visitor.handle}\n`);

  await check("bootstrap and mount", async () => {
    const boot = await bootstrapRegistry(ens);
    await test.impersonateAccount({ address: parent.owner });
    const owner = createWalletClient({ account: parent.owner, chain: sepolia, transport: http(rpc) });
    const mount = await mountRegistry(ens, owner).finally(() => test.stopImpersonatingAccount({ address: parent.owner }));
    const subregistry = await ens.client.readContract({ address: parent.registry, abi: registryAbi, functionName: "getSubregistry", args: [parent.label] });
    expect(same(subregistry, boot.registry), `${env.ensName()} points at ${subregistry}, not ${boot.registry}`);
    return { detail: `DreamscapeRegistry ${boot.registry} mounted under ${env.ensName()}`, steps: [...boot.steps, ...(mount ? [mount] : [])] };
  });

  await check("onboarding a host and a visitor", async () => {
    for (const p of [host, visitor]) {
      p.setup = await onboardDreamer(ens, { handle: p.handle, dreamer: p.account.address, nightMarket: privateKeyToAccount(generatePrivateKey()).address });
    }
    const roles = await ens.client.readContract({ address: host.setup!.passes, abi: registryAbi, functionName: "roles", args: [BigInt(0), ens.server.account.address] });
    expect(roles === BigInt(1), `the server holds ${roles.toString(16)} on the host's passes registry, not just registrar`);
    return {
      detail: `${host.setup!.name} and ${visitor.setup!.name}, both owned by their dreamers`,
      notes: [`host passes registry ${host.setup!.passes}, resolver ${host.setup!.resolver}`],
      steps: [...host.setup!.steps, ...visitor.setup!.steps],
    };
  });

  const h = host.setup;
  if (!h) return finish();
  const label = newPassLabel();
  const name = passName(h.name, label);
  const grantInput = { gallery: h.name, passes: h.passes, resolver: h.resolver, visitor: visitor.account.address, scope: "published" as const, label };

  const granted = await check("grant a pass", async () => {
    const grant = await grantPass(ens, grantInput);
    const owner = await ens.client.readContract({ address: h.passes, abi: registryAbi, functionName: "findOwner", args: [label] });
    expect(same(owner, visitor.account.address), `${name} is owned by ${owner}`);
    const tokenId = await ens.client.readContract({ address: h.passes, abi: passRegistryAbi, functionName: "findTokenId", args: [label] });
    const held = await ens.client.readContract({ address: h.passes, abi: registryAbi, functionName: "roles", args: [tokenId, visitor.account.address] });
    expect(held === BigInt(0), `the visitor holds roles ${held.toString(16)} on the pass`);
    const days = Number(grant.expiry - (await ens.client.getBlock()).timestamp) / 86_400;
    expect(days > 29.9 && days <= 30, `the pass expires in ${days.toFixed(2)} days`);
    const again = await grantPass(ens, grantInput);
    expect(again.steps.length === 0, `a rerun sent ${again.steps.length} transactions`);
    return { detail: `${name} owned by the visitor with no roles, expiring in ${days.toFixed(2)} days; a rerun sends nothing`, steps: grant.steps };
  });

  await check("the scope record resolves", async () => {
    expect(granted, "the grant failed");
    const scope = await passScope(ens.client, name, h.resolver);
    expect(scope === "published", `passScope reads ${scope}`);
    const raw = await ens.client.getEnsText({ name, key: DAY_KEYS.scope, strict: true, universalResolverAddress: UNIVERSAL_RESOLVER });
    expect(raw === "published", `the Universal Resolver reads ${raw}`);
    return { detail: `${DAY_KEYS.scope} = "published", served by the host's own resolver` };
  });

  await check("findExactOwner gives the visitor", async () => {
    expect(granted, "the grant failed");
    const owner = await findPass(ens.client, name);
    expect(same(owner, visitor.account.address), `findExactOwner(${name}) = ${owner}`);
    expect(!(await passGone(ens.client, name)), "passGone says it's gone");
    return { detail: `UniversalHelper.findExactOwner(${name}) = ${owner}` };
  });

  await check("the visitor can't transfer it", async () => {
    expect(granted, "the grant failed");
    const tokenId = await ens.client.readContract({ address: h.passes, abi: passRegistryAbi, functionName: "findTokenId", args: [label] });
    const to = stranger.account.address;
    const unsafe = await attempt(ens, visitor.account, h.passes, "unsafeTransfer", [to, tokenId, "0x"]);
    const safe = await attempt(ens, visitor.account, h.passes, "safeTransferFrom", [visitor.account.address, to, tokenId, BigInt(1), "0x"]);
    expect(unsafe === "TransferDisallowed", `unsafeTransfer: expected TransferDisallowed, got ${unsafe ?? "a transfer"}`);
    expect(safe === "TransferUnsafeUntilRegistryIsEmancipated", `safeTransferFrom: expected TransferUnsafeUntilRegistryIsEmancipated, got ${safe ?? "a transfer"}`);
    return { detail: `unsafeTransfer reverts with ${unsafe}, safeTransferFrom with ${safe}` };
  });

  await check("only the host can revoke it", async () => {
    expect(granted, "the grant failed");
    const tx = revokePassTx(h.passes, label);
    expect(same(tx.to, h.passes), `the revoke goes to ${tx.to}`);
    const id = BigInt(labelhash(label));
    const byServer = await attempt(ens, ens.server.account, h.passes, "unregister", [id]);
    const byVisitor = await attempt(ens, visitor.account, h.passes, "unregister", [id]);
    expect(byServer === "EACUnauthorizedAccountRoles", `the server's unregister: expected EACUnauthorizedAccountRoles, got ${byServer ?? "success"}`);
    expect(byVisitor === "EACUnauthorizedAccountRoles", `the visitor's unregister: expected EACUnauthorizedAccountRoles, got ${byVisitor ?? "success"}`);
    return { detail: `unregister from the server and from the visitor both revert with ${byServer}` };
  });

  await check("the host's unregister clears it", async () => {
    expect(granted, "the grant failed");
    const tx = revokePassTx(h.passes, label);
    const step = await mined(ens.client, `host unregisters ${label}`, await hostWallet.sendTransaction({ to: tx.to, data: tx.data }));
    expect(await passGone(ens.client, name), "passGone says it's still there");
    const owner = await findPass(ens.client, name);
    expect(owner === zeroAddress, `findExactOwner still gives ${owner}`);
    const scope = await passScope(ens.client, name, h.resolver);
    expect(scope === null, `passScope still reads ${scope}`);
    const wildcard = await ens.client.getEnsText({ name, key: DAY_KEYS.scope, strict: true, universalResolverAddress: UNIVERSAL_RESOLVER });
    return {
      detail: "passGone is true and findExactOwner gives the zero address",
      notes: [`the old record still resolves by wildcard (${JSON.stringify(wildcard)}); passScope ignores it, since the pass names no resolver now`],
      steps: [step],
    };
  });

  if (args.has("--arkiv")) await visitChecks(ens, hostWallet, { host, visitor, stranger });

  // Last, because it moves the fork's clock.
  await check("an unrevoked pass expires by itself", async () => {
    const second = newPassLabel();
    const secondName = passName(h.name, second);
    const grant = await grantPass(ens, { ...grantInput, label: second, scope: "gallery" });
    expect(same(await findPass(ens.client, secondName), visitor.account.address), "the second pass isn't the visitor's");
    await test.increaseTime({ seconds: 31 * 86_400 });
    await test.mine({ blocks: 1 });
    expect(await passGone(ens.client, secondName), "still owned 31 days later");
    expect((await passScope(ens.client, secondName, h.resolver)) === null, "its scope still counts");
    return { detail: `${secondName} is gone 31 days later, with nobody revoking it`, steps: grant.steps };
  });

  finish();
}

function finish() {
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

// ---------------------------------------------------------------- visits on a local Arkiv node

const IMAGE = "ghcr.io/arkiv-network/arkiv-reth-dev:v1.0.1";
const DOCKER = process.env.DOCKER ?? "docker";
// The dev node prefunds the accounts of the standard test mnemonic. They exist only on that throwaway chain.
const DEV_MNEMONIC = "test test test test test test test test test test test junk";

function docker(...argv: string[]) {
  return execFileSync(DOCKER, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function startNode(name: string) {
  // 2-second blocks like Rabdi, so expiry times match.
  docker("run", "-d", "--rm", "--name", name, "-p", "127.0.0.1::8545", IMAGE, "node", "--dev", "--dev.block-time", "2s", "--http", "--http.addr", "0.0.0.0", "--http.api", "eth,net,web3,txpool", "--datadir", "/data");
  const port = docker("port", name, "8545/tcp").split("\n")[0].split(":").pop();
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }) });
      const body = (await res.json()) as { result?: Hex };
      if (body.result && BigInt(body.result) > BigInt(0)) return url;
    } catch {
      // not up yet
    }
    await sleep(1000);
  }
  throw new Error(`the node at ${url} did not start`);
}

type HostWallet = ReturnType<typeof createWalletClient<ReturnType<typeof http>, typeof sepolia, PrivateKeyAccount>>;

async function visitChecks(ens: Ens, hostWallet: HostWallet, people: { host: Person; visitor: Person; stranger: Person }) {
  console.log(`\nVisits on a local Arkiv dev node (${IMAGE}) and a throwaway SQLite file`);
  const dir = mkdtempSync(join(tmpdir(), "dreamscape-visits-"));
  const name = `dreamscape-visits-test-${process.pid}`;
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
  // Point the app's database and Arkiv client at throwaways before anything opens them.
  process.env.DATA_DIR = dir;
  if (!process.env.MASTER_KEY) process.env.MASTER_KEY = randomBytes(32).toString("hex");
  let url: string;
  try {
    url = await startNode(name);
  } catch (error) {
    failures++;
    console.log(`FAIL local Arkiv node: ${(error as Error).message.split("\n")[0]}`);
    stop();
    rmSync(dir, { recursive: true, force: true });
    return;
  }
  process.env.ARKIV_NETWORK = "local";
  process.env.ARKIV_RPC_URL = url;
  try {
    await visitFlow(ens, hostWallet, people, url, dir);
  } finally {
    stop();
    rmSync(dir, { recursive: true, force: true });
    console.log(`stopped ${name}, removed ${dir}`);
  }
}

async function visitFlow(ens: Ens, hostWallet: HostWallet, { host, visitor, stranger }: { host: Person; visitor: Person; stranger: Person }, url: string, dir: string) {
  const ctx = arkiv();
  const db = getDb();
  const ok = await check("throwaway stores", async () => {
    expect(ctx.network === "local" && ctx.chain.rpcUrls.default.http[0] === url, `the app's Arkiv client points at ${ctx.chain.rpcUrls.default.http[0]}`);
    expect(env.dataDir() === dir, `the app's database is in ${env.dataDir()}`);
    const sepoliaNode = String(await ensReader().request({ method: "web3_clientVersion" }));
    expect(sepoliaNode.toLowerCase().startsWith("anvil"), `the app's Sepolia client reaches ${sepoliaNode}`);
    const funder = createWalletClient({ account: mnemonicToAccount(DEV_MNEMONIC), chain: ctx.chain, transport: http(url) });
    for (const to of [ctx.serverAddress, host.account.address]) {
      await ctx.reader.waitForTransactionReceipt({ hash: await funder.sendTransaction({ to, value: parseEther("10") }) });
    }
    return { detail: `Arkiv ${url} (chain ${await ctx.reader.getChainId()}), SQLite in ${dir}, ENS on the anvil fork` };
  });
  if (!ok) return;

  // Three members and the host's gallery: a painted dream, one still painting, a hung comic and a draft.
  const user = (p: Person, setup?: Onboarded) => {
    const id = `user_${p.handle}`;
    const ensJson = setup ? JSON.stringify({ name: setup.name, resolver: setup.resolver, editions: setup.editions, passes: setup.passes }) : null;
    db.prepare("INSERT INTO users (id, handle, wallet, ens_json, created_at) VALUES (?, ?, ?, ?, ?)").run(id, p.handle, p.account.address, ensJson, Date.now());
    return id;
  };
  const hostId = user(host, host.setup);
  const visitorId = user(visitor, visitor.setup);
  const strangerId = user(stranger);
  const portrait = randomBytes(64);
  const panel = randomBytes(48);
  const painted = createDream(hostId, "text", "wonder", "I walked across a roof made of sea");
  updateDream(painted, { status: "done", title: "The sea roof", saga: "sea-roof" });
  putBlob(hostId, `dream/${painted}/portrait`, "image/png", portrait);
  const painting = createDream(hostId, "text", null, "Still being painted");
  const script = { title: "Sea roof", panels: Array.from({ length: 4 }, (_, i) => ({ scene: `secret scene ${i}`, dialogue: [{ who: "Dreamer", text: `line ${i}` }], caption: null })) };
  const episode = (status: string) => {
    const id = `ep_${status}_${randomBytes(3).toString("hex")}`;
    db.prepare("INSERT INTO episodes (id, user_id, day, status, saga, title, feeling, script_json, dream_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      id, hostId, 20398, status, "sea-roof", `Sea roof ${status}`, "wonder", JSON.stringify(script), JSON.stringify([painted]), Date.now(),
    );
    for (let n = 0; n < 4; n++) putBlob(hostId, panelKey(id, n), "image/png", panel);
    return id;
  };
  const hung = episode("published");
  const draft = episode("draft");
  const jobsFor = (kind: string, ref: string) => (db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE kind = ? AND ref = ?").get(kind, ref) as { n: number }).n;

  let passId = "";
  await check("app grant: the pass.grant job registers and scopes it", async () => {
    const result = visits.grantPassTo(hostId, visitor.handle, "published");
    expect(!("error" in result), "error" in result ? result.error : "");
    passId = result.pass.id;
    expect(jobsFor("pass.grant", passId) === 1, "no pass.grant job was queued");
    expect(visits.passState(visits.getPass(passId)!) === "granting", "the pass isn't granting");
    const twice = visits.grantPassTo(hostId, visitor.handle, "gallery");
    expect("error" in twice, "a second pass to the same visitor was allowed");
    const noWallet = visits.grantPassTo(hostId, "nobody-here", "gallery");
    expect("error" in noWallet && noWallet.status === 404, "a pass to an unknown handle was allowed");
    await visits.grantPassJob(passId);
    const pass = visits.getPass(passId)!;
    expect(pass.status === "active" && pass.grant_tx && pass.scope_tx, `status ${pass.status}, grant ${pass.grant_tx}, scope ${pass.scope_tx}`);
    expect(/^p[a-z0-9]{4}$/.test(pass.label), `label ${pass.label} isn't random-looking`);
    expect(same(await findPass(ens.client, pass.name), visitor.account.address), "the visitor doesn't own it on ENS");
    expect((await passScope(ens.client, pass.name, host.setup!.resolver)) === "published", "its scope isn't published");
    return { detail: `${pass.name}, status active, register ${short(pass.grant_tx!)} and scope ${short(pass.scope_tx!)}` };
  });
  if (!passId) return;
  const pass = visits.getPass(passId)!;

  await check("before knocking, the visitor is outside", async () => {
    const access = await visits.checkVisit(visitorId, host.handle);
    expect(!access.inside && access.state === "outside", `got ${JSON.stringify(access.inside ? "inside" : access.state)}`);
    return { detail: `checkVisit says "outside"` };
  });

  await check("a stranger can't knock or get in", async () => {
    const knocked = await visits.knockAt(strangerId, host.handle);
    expect("error" in knocked && knocked.status === 403, "the stranger's knock went through");
    const access = await visits.checkVisit(strangerId, host.handle);
    expect(!access.inside && access.state === "no-pass", "the stranger has a way in");
    return { detail: `knock refused (${knocked.error}); checkVisit says "no-pass"` };
  });

  let knockKey = "";
  await check("knock: owned by the visitor, at the host's door, fading in 12 hours", async () => {
    const knocked = await visits.knockAt(visitorId, host.handle);
    expect(!("error" in knocked), "error" in knocked ? knocked.error : "");
    knockKey = knocked.key;
    const entity = await ctx.reader.getEntity(knockKey as Hex);
    expect(isAddressEqual(entity.$owner, visitor.account.address), `owned by ${entity.$owner}`);
    expect(isAddressEqual(entity.$creator, ctx.serverAddress), `created by ${entity.$creator}`);
    const blocks = Number(entity.$expiresAt - (await ctx.reader.getBlockNumber()));
    expect(Math.abs(blocks - 21_600) < 30, `expires in ${blocks} blocks, not about 21,600`);
    const door = await visits.doorFor(hostId);
    expect(door.knocks.length === 1 && door.knocks[0].key === knockKey && door.knocks[0].handle === visitor.handle, `the door shows ${JSON.stringify(door.knocks)}`);
    const access = await visits.checkVisit(visitorId, host.handle);
    expect(!access.inside && access.state === "waiting", "checkVisit doesn't say waiting");
    const again = await visits.knockAt(visitorId, host.handle);
    expect(!("error" in again) && again.key === knockKey, "a second tap wrote a second knock");
    expect(jobsFor("knock.notify", knockKey) === 1, "no knock.notify job was queued");
    await visits.knockNoticeJob(knockKey);
    return { detail: `knock ${short(knockKey)}, owner the visitor, creator the server, ${blocks} blocks to live; a second tap reuses it; knock.notify queued once` };
  });

  await check("a visit the host writes themselves doesn't open the door", async () => {
    const own = await ctx.wallet(host.account).createEntity(
      Visit,
      { pass: key(pass.node), host: addr(host.account.address), scope: "published", endsAt: u64(Math.floor(Date.now() / 1000) + 600) },
      { expiration: ExpirationTime.fromMinutes(10) },
    );
    const access = await visits.checkVisit(visitorId, host.handle);
    expect(!access.inside, "a visit not created by the server let the visitor in");
    return { detail: `self-written visit ${short(own.entityKey)} is ignored; still "${access.inside ? "inside" : access.state}"` };
  });

  let visitKey = "";
  let endsAt = 0;
  await check("let in: the visit is the host's, and the visitor sees only hung comics", async () => {
    const result = await visits.letVisitorIn(hostId, knockKey, 16);
    expect(!("error" in result), "error" in result ? result.error : "");
    visitKey = result.key;
    endsAt = result.endsAt;
    const entity = await ctx.reader.getEntity(visitKey as Hex);
    expect(isAddressEqual(entity.$owner, host.account.address) && isAddressEqual(entity.$creator, ctx.serverAddress), `owner ${entity.$owner}, creator ${entity.$creator}`);
    const access = await visits.checkVisit(visitorId, host.handle);
    expect(access.inside && access.scope === "published", "checkVisit doesn't let the visitor in");
    const slice = visits.visitorSlice(access);
    expect(slice.dreams.length === 0, `published scope shows ${slice.dreams.length} dreams`);
    expect(slice.comics.length === 1 && slice.comics[0].id === hung, `shows comics ${slice.comics.map((c) => c.id).join(", ")}`);
    expect(!JSON.stringify(slice).includes("secret scene"), "a panel's scene reached the visitor");
    expect(Buffer.from(visits.visitorPanel(access, hung, 0)!.bytes).equals(panel), "the hung panel didn't decrypt to the original");
    expect(visits.visitorPanel(access, draft, 0) === undefined, "a draft panel was served");
    expect(visits.visitorPortrait(access, painted) === undefined, "a portrait was served to a comics-only pass");
    const door = await visits.doorFor(hostId);
    expect(door.knocks.length === 0, "the answered knock is still at the door");
    expect(door.inside.length === 1 && door.inside[0].handle === visitor.handle, "the door doesn't show the visitor inside");
    const twice = await visits.letVisitorIn(hostId, knockKey, 16);
    expect("error" in twice, "the same knock was let in twice");
    const strangerAccess = await visits.checkVisit(strangerId, host.handle);
    expect(!strangerAccess.inside, "the stranger got in during the visit");
    return { detail: `visit ${short(visitKey)} owned by the host; 1 hung comic, no draft, no portrait, no scenes; the stranger stays out` };
  });

  await check("expired: the door closes and the node stops returning the visit", async () => {
    expect(visitKey, "no visit");
    let closedAt = 0;
    while (Date.now() < endsAt + 20_000) {
      const access = await visits.checkVisit(visitorId, host.handle);
      if (!access.inside) {
        closedAt = Date.now();
        expect(access.state === "ended", `after the visit checkVisit says "${access.state}", not "ended"`);
        break;
      }
      await sleep(500);
    }
    expect(closedAt, "the visitor was still inside 20 seconds after the end");
    expect((await activeVisit(host.account.address, pass.node)) === null, "activeVisit still finds it");
    let goneAt = 0;
    while (Date.now() < endsAt + 30_000) {
      try {
        await ctx.reader.getEntity(visitKey as Hex);
        await sleep(1000);
      } catch (error) {
        if (!(error instanceof NoEntityFoundError)) throw error;
        goneAt = Date.now();
        break;
      }
    }
    expect(goneAt, "the node still returns the visit 30 seconds after it ended");
    const door = await visits.doorFor(hostId);
    expect(door.knocks.length === 0 && door.inside.length === 0, `the door shows ${door.knocks.length} knocks and ${door.inside.length} inside`);
    const when = (ms: number) => `${Math.abs(ms / 1000).toFixed(1)}s ${ms < 0 ? "before" : "after"} the end`;
    return {
      detail: `closed ${when(closedAt - endsAt)} ("The visit has ended"); the node stopped returning it ${when(goneAt - endsAt)}; the answered knock stays answered`,
    };
  });

  await check("a whole-gallery pass sees paintings with their words, and hung comics", async () => {
    const granted = visits.grantPassTo(hostId, stranger.handle, "gallery");
    expect(!("error" in granted), "error" in granted ? granted.error : "");
    await visits.grantPassJob(granted.pass.id);
    const knocked = await visits.knockAt(strangerId, host.handle);
    expect(!("error" in knocked), "error" in knocked ? knocked.error : "");
    const opened = await visits.letVisitorIn(hostId, knocked.key, 600);
    expect(!("error" in opened), "error" in opened ? opened.error : "");
    const access = await visits.checkVisit(strangerId, host.handle);
    expect(access.inside && access.scope === "gallery", "the gallery pass didn't get in");
    const slice = visits.visitorSlice(access);
    expect(slice.dreams.length === 1 && slice.dreams[0].id === painted && slice.dreams[0].words?.includes("sea"), `shows dreams ${slice.dreams.map((d) => d.id).join(", ")}`);
    expect(!slice.dreams.some((d) => d.id === painting), "an unpainted dream was shown");
    expect(slice.comics.length === 1, `shows ${slice.comics.length} comics`);
    expect(Buffer.from(visits.visitorPortrait(access, painted)!.bytes).equals(portrait), "the portrait didn't decrypt to the original");
    const other = await visits.checkVisit(visitorId, host.handle);
    expect(!other.inside, "one pass's visit let another pass in");
    return { detail: "1 painted dream with its words (not the one still painting), 1 hung comic; the portrait decrypts on the server; the first visitor stays out" };
  });

  await check("revoking closes the door at once, even inside a live visit", async () => {
    const knocked = await visits.knockAt(visitorId, host.handle);
    expect(!("error" in knocked), "error" in knocked ? knocked.error : "");
    const opened = await visits.letVisitorIn(hostId, knocked.key, 600);
    expect(!("error" in opened), "error" in opened ? opened.error : "");
    expect((await visits.checkVisit(visitorId, host.handle)).inside, "the visitor didn't get back in");
    const revoke = await visits.revokeTxFor(hostId, passId);
    expect("tx" in revoke, `revokeTxFor gave ${JSON.stringify(revoke)}`);
    expect(same(revoke.tx.to, host.setup!.passes), `the revoke goes to ${revoke.tx.to}`);
    const hash = await hostWallet.sendTransaction({ to: revoke.tx.to, data: revoke.tx.data });
    const confirmed = await visits.confirmRevoke(hostId, passId, hash);
    expect(!("error" in confirmed), "error" in confirmed ? confirmed.error : "");
    expect(visits.getPass(passId)!.status === "revoked", "the pass isn't marked revoked");
    expect(await activeVisit(host.account.address, pass.node), "the visit itself should still be live on Arkiv");
    const access = await visits.checkVisit(visitorId, host.handle);
    expect(!access.inside && access.state === "no-pass", `after the revoke checkVisit says ${access.inside ? "inside" : access.state}`);
    const knockedAgain = await visits.knockAt(visitorId, host.handle);
    expect("error" in knockedAgain, "a revoked pass could knock");
    return { detail: `the host's wallet sent unregister (${short(hash)}); the visit is still live on Arkiv, but findExactOwner gives no one, so the door is shut` };
  });
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
