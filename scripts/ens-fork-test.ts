// Proves the ENS base on a local anvil fork of Sepolia: bootstrap and mount, onboarding, a day record and the scribe's limits.
// Start a fork (anvil --fork-url https://ethereum-sepolia-rpc.publicnode.com --port 8547), then run
// node --env-file-if-exists=.env.local --import tsx scripts/ens-fork-test.ts http://127.0.0.1:8547
import { createTestClient, createWalletClient, formatEther, http, parseEther, parseGwei, zeroAddress, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { env } from "../src/lib/server/env";
import { bootstrapRegistry, checkMount, mountRegistry } from "../src/lib/server/ens/bootstrap";
import { DAY_KEYS, dns, ensClients, findParent, galleryName, same, type Step } from "../src/lib/server/ens/client";
import { ALL_ROLES, REG, RES, UNIVERSAL_HELPER, UNIVERSAL_RESOLVER, helperAbi, registryAbi } from "../src/lib/server/ens/contracts";
import { readDayRecord, scribeAttempt, writeDayRecord } from "../src/lib/server/ens/days";
import { onboardDreamer, resolverRoles, type Onboarded } from "../src/lib/server/ens/onboard";

type Payer = "server" | "owner" | "scribe";
const spent: Record<Payer, bigint> = { server: BigInt(0), owner: BigInt(0), scribe: BigInt(0) };
let failures = 0;

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const total = (steps: Step[]) => steps.reduce((sum, s) => sum + s.gasUsed, BigInt(0));
const fmt = (gas: bigint) => gas.toLocaleString("en-US");

type Outcome = { detail: string; notes?: string[]; paid?: [Payer, Step[]][] };

async function check(name: string, run: () => Promise<Outcome>) {
  try {
    const { detail, notes = [], paid = [] } = await run();
    const steps = paid.flatMap(([, s]) => s);
    console.log(`PASS ${name}: ${detail}${steps.length ? ` (gas ${fmt(total(steps))})` : ""}`);
    for (const [payer, s] of paid) {
      spent[payer] += total(s);
      for (const step of s) console.log(`       ${fmt(step.gasUsed).padStart(10)} gas  ${payer}: ${step.step}`);
    }
    for (const note of notes) console.log(`       ${note}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}: ${(error as Error).message.split("\n")[0]}`);
  }
}

async function main() {
  const rpc = process.argv[2] ?? env.ensForkRpc();
  if (!rpc) throw new Error("Pass the anvil fork's RPC URL, or set ENS_FORK_RPC_URL.");
  const ens = ensClients(rpc);
  // Never run against a live network: this script funds accounts and impersonates the owner.
  const node = String(await ens.client.request({ method: "web3_clientVersion" }));
  if (!node.toLowerCase().startsWith("anvil")) throw new Error(`${rpc} is ${node}, not an anvil fork.`);
  if ((await ens.client.getChainId()) !== sepolia.id) throw new Error(`${rpc} is not a fork of Sepolia.`);

  const test = createTestClient({ mode: "anvil", chain: sepolia, transport: http(rpc) });
  const server = ens.server.account.address;
  const scribe = ens.scribe.account.address;
  const parent = await findParent(ens.client);
  for (const address of [server, scribe, parent.owner]) await test.setBalance({ address, value: parseEther("10") });
  // Fresh accounts: anvil's well-known ones carry EIP-7702 code on Sepolia and can't receive name tokens.
  const fresh = () => privateKeyToAccount(generatePrivateKey()).address;
  const dreamer = fresh();
  const nightMarket = fresh(); // stands in for NightMarket until it's deployed
  const handle = `fork-${dreamer.slice(2, 8).toLowerCase()}`;
  const date = "2026-11-06";
  const roles = (registry: Address, account: Address) =>
    ens.client.readContract({ address: registry, abi: registryAbi, functionName: "roles", args: [BigInt(0), account] });
  const emancipated = (registry: Address) => ens.client.readContract({ address: registry, abi: registryAbi, functionName: "isEmancipated" });
  const canonical = (name: string) =>
    ens.client.readContract({ address: UNIVERSAL_HELPER, abi: helperAbi, functionName: "findCanonicalRegistry", args: [dns(name)] });
  console.log(`Fork of Sepolia at block ${await ens.client.getBlockNumber()}, dreamer ${dreamer}, handle ${handle}\n`);

  await check("bootstrap and mount", async () => {
    const boot = await bootstrapRegistry(ens);
    await test.impersonateAccount({ address: parent.owner });
    const owner = createWalletClient({ account: parent.owner, chain: sepolia, transport: http(rpc) });
    const mount = await mountRegistry(ens, owner).finally(() => test.stopImpersonatingAccount({ address: parent.owner }));
    const subregistry = await ens.client.readContract({ address: parent.registry, abi: registryAbi, functionName: "getSubregistry", args: [parent.label] });
    expect(same(subregistry, boot.registry), `${env.ensName()} points at ${subregistry}, not ${boot.registry}`);
    expect(await emancipated(boot.registry), "DreamscapeRegistry is not emancipated");
    const serverRoles = await roles(boot.registry, server);
    expect(serverRoles === (REG.REGISTRAR | REG.RENEW), `the server holds ${serverRoles.toString(16)} on DreamscapeRegistry, not just registrar and renew`);
    return {
      detail: `DreamscapeRegistry ${boot.registry}, emancipated, mounted under ${env.ensName()}`,
      notes: [`owner's mount tx: from ${boot.mount.from} to ${boot.mount.to} data ${boot.mount.data}`],
      paid: [["server", boot.steps], ["owner", mount ? [mount] : []]],
    };
  });

  await check("findCanonicalRegistry confirms the mount", async () => {
    const mount = await checkMount(ens.client);
    expect(mount.canonical, `findCanonicalRegistry(${env.ensName()}) is not ${mount.registry}`);
    return { detail: `findCanonicalRegistry(${env.ensName()}) = ${mount.registry}` };
  });

  let dreamerSetup: Onboarded | undefined;
  await check("onboarding", async () => {
    const result = await onboardDreamer(ens, { handle, dreamer, nightMarket, url: `https://dreamscape.hacklabs.in/${handle}` });
    dreamerSetup = result;
    const dreamscape = (await findParent(ens.client)).subregistry;
    const holder = await ens.client.readContract({ address: dreamscape, abi: registryAbi, functionName: "findOwner", args: [handle] });
    expect(same(holder, dreamer), `${result.name} is owned by ${holder}`);
    const address = await ens.client.getEnsAddress({ name: result.name, strict: true, universalResolverAddress: UNIVERSAL_RESOLVER });
    expect(address && same(address, dreamer), `${result.name} resolves to ${address}`);
    expect(same(await canonical(result.name), result.editions), "the editions registry is not canonical");
    expect(same(await canonical(`passes.${result.name}`), result.passes), "the passes registry is not canonical");
    expect(await emancipated(result.editions), "the editions registry is not emancipated");
    expect((await roles(result.editions, server)) === BigInt(0), "the server kept a role on the editions registry");
    expect((await roles(result.editions, nightMarket)) === REG.REGISTRAR, "NightMarket is not exactly a registrar on editions");
    expect((await roles(result.passes, server)) === REG.REGISTRAR, "the server holds more than registrar on passes");
    const scribeRoles = await resolverRoles(ens.client, result.resolver, scribe);
    expect(scribeRoles.root === BigInt(0) && scribeRoles.keys.every((k) => k.roles === RES.SET_TEXT), "the scribe doesn't hold exactly the four day keys");
    const dreamerRoles = await resolverRoles(ens.client, result.resolver, dreamer);
    expect(dreamerRoles.root === ALL_ROLES, "the dreamer doesn't hold every role on their resolver");
    return {
      detail: `${result.name} owned by the dreamer, who signed nothing`,
      notes: [
        `resolver ${result.resolver} (dreamer holds every role, scribe holds ${Object.values(DAY_KEYS).join(", ")})`,
        `editions ${result.editions} (emancipated, canonical; NightMarket stand-in is registrar)`,
        `passes   ${result.passes} (canonical at passes.${result.name}; server may register passes)`,
      ],
      paid: [["server", result.steps]],
    };
  });

  await check("a day record resolves through the Universal Resolver", async () => {
    expect(dreamerSetup, "onboarding failed");
    const record = { root: `0x${"ab".repeat(32)}`, saga: "the-sea-roof", date, scope: "gallery" };
    const written = await writeDayRecord(ens, handle, record);
    const entry = await ens.client.readContract({ address: dreamerSetup.editions, abi: registryAbi, functionName: "findOwner", args: [date] });
    expect(entry === zeroAddress, `${written.name} has a registry entry`);
    const read = await readDayRecord(ens.client, handle, date);
    for (const field of Object.keys(record) as (keyof typeof record)[]) {
      expect(read[field] === record[field], `${DAY_KEYS[field]} reads ${read[field]}, not ${record[field]}`);
    }
    return {
      detail: `${written.name} has no registry entry and serves all four keys from the dreamer's resolver`,
      paid: [["scribe", [written.step]]],
    };
  });

  await check("the scribe can't set avatar", async () => {
    const reason = await scribeAttempt(ens, handle, "avatar");
    expect(reason === "EACUnauthorizedAccountRoles", `expected EACUnauthorizedAccountRoles, got ${reason ?? "a successful write"}`);
    return { detail: `setText(${galleryName(handle)}, "avatar") from the scribe reverts with ${reason}` };
  });

  await check("the server holds no role on the dreamer's resolver", async () => {
    expect(dreamerSetup, "onboarding failed");
    const held = await resolverRoles(ens.client, dreamerSetup.resolver, server);
    expect(held.root === BigInt(0), `the server holds ${held.root.toString(16)} at the root`);
    for (const k of held.keys) expect(k.roles === BigInt(0), `the server holds ${k.roles.toString(16)} on ${k.key}`);
    return { detail: "no root role and no role on any day key" };
  });

  const gwei = parseGwei("1");
  console.log(`\nGas by payer: ${(Object.keys(spent) as Payer[]).map((p) => `${p} ${fmt(spent[p])} (${formatEther(spent[p] * gwei)} ETH at 1 gwei)`).join(", ")}`);
  console.log(failures ? `${failures} check(s) failed` : "All checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
