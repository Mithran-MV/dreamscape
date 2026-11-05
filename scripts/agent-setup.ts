// Sets up the portraits vendor agent: its namespace under market.<ENS_NAME>, its NightMarket bindings,
// a little gas for its own key, and its stall on Arkiv. Reads only, unless --send, which has the server pay for each missing step.
// Needs AGENT_PRIVATE_KEY and VENDOR_OWNER_HANDLE (an onboarded dreamer).
// node --env-file-if-exists=.env.local --import tsx scripts/agent-setup.ts [--send] [sepolia rpc url, default SEPOLIA_RPC_URL]
import { formatEther } from "viem";

// Measured on a fork of Sepolia; the server pays all of it.
const GAS = {
  marketRegistry: 903_010 + 251_587,
  marketName: 603_049,
  resolver: 2_615_945,
  grants: 514_528,
  agentName: 608_688,
  bind: 130_334,
  fund: 204_600,
};

const mark = (done: boolean) => (done ? "done   " : "missing");

async function main() {
  const args = process.argv.slice(2);
  const rpc = args.find((arg) => !arg.startsWith("--"));
  if (rpc) process.env.SEPOLIA_RPC_URL = rpc;
  const { env } = await import("../src/lib/server/env");
  const { ensClients } = await import("../src/lib/server/ens/client");
  const { arkiv } = await import("../src/lib/server/arkiv/client");
  const vendor = await import("../src/lib/server/vendor");
  const ens = ensClients();
  const ctx = arkiv();

  if (args.includes("--send")) {
    const done = await vendor.setupVendor(ens, ctx);
    for (const step of done.sepolia) console.log(`Sepolia ${step.step}: ${step.hash} (${step.gasUsed.toLocaleString("en-US")} gas)`);
    for (const step of done.arkiv) console.log(`Arkiv   ${step.step}: ${step.hash}`);
    console.log(`\n${done.name}: resolver ${done.resolver}, market registry ${done.marketRegistry}, stall ${done.stall}`);
  }

  const plan = await vendor.planVendor(ens, ctx);
  const { namespace: ns, chain, balances } = plan;
  console.log(`${plan.name} on ${env.ensName()}, Arkiv ${ctx.network}`);
  console.log(`server ${plan.server}, agent ${plan.agent ?? "unknown"}, owner ${plan.owner ? `${plan.owner.gallery} (${plan.owner.wallet})` : "unknown"}`);
  for (const line of plan.missing) console.log(`  needs: ${line}`);
  if (!ns.serverIsRegistrar) console.log(`  needs: the server holds no registrar role on ${env.ensName()}'s registry`);
  if (!chain.serverIsOperator) console.log("  needs: the server isn't a NightMarket operator");
  if (plan.owner && !chain.marketMintsForOwner) console.log(`  needs: NightMarket isn't a registrar on ${plan.owner.gallery}'s editions registry`);

  const rows: [boolean, string, number][] = [
    [ns.marketRegistry.deployed, `market registry ${ns.marketRegistry.address}, deployed and pointed at its parent`, GAS.marketRegistry],
    [ns.marketName.registered, `${ns.marketName.name} registered to the server`, GAS.marketName],
    [ns.resolver.deployed, `the agent's own resolver ${ns.resolver.address}, with addr, agent-context, agent-endpoint[web] and prices`, GAS.resolver],
    [ns.resolver.granted, "the agent's key granted agent-context and prices, the server's admin role dropped", GAS.grants],
    [ns.agentName.registered && ns.agentName.ownerMatches, `${plan.name} registered to its owner`, GAS.agentName],
    [chain.agentBound, "bindAgent(agent, owner) on NightMarket", GAS.bind],
    [chain.registryBound, "bindRegistry(owner's editions, owner) on NightMarket", GAS.bind],
    [balances.agentEth !== null && balances.agentEth >= plan.targets.ETH_FLOOR, `the agent holds at least ${formatEther(plan.targets.ETH_FLOOR)} Sepolia ETH (tops up to ${formatEther(plan.targets.ETH_TARGET)})`, GAS.fund],
  ];
  console.log("\nSepolia, paid by the server:");
  let gas = 0;
  for (const [done, what, cost] of rows) {
    if (!done) gas += cost;
    console.log(`  ${mark(done)} ${what}${done ? "" : ` (about ${cost.toLocaleString("en-US")} gas)`}`);
  }
  console.log(`  still to send: about ${gas.toLocaleString("en-US")} gas, plus ${balances.agentEth !== null && balances.agentEth >= plan.targets.ETH_FLOOR ? "no" : formatEther(plan.targets.ETH_TARGET - (balances.agentEth ?? BigInt(0)))} ETH to the agent`);
  console.log("\nArkiv:");
  console.log(`  ${mark(balances.agentGlm !== null && balances.agentGlm >= plan.targets.GLM_FLOOR)} the agent holds at least ${formatEther(plan.targets.GLM_FLOOR)} GLM for claims and heartbeats (tops up to ${formatEther(plan.targets.GLM_TARGET)})`);
  console.log(`  ${mark(plan.stall === true)} the stall, created by the server and handed to the agent, then a heartbeat`);
  console.log("\nBalances:");
  console.log(`  server ${formatEther(balances.serverEth)} Sepolia ETH, ${balances.serverGlm === null ? "unknown" : formatEther(balances.serverGlm)} GLM`);
  console.log(`  agent  ${balances.agentEth === null ? "unknown" : formatEther(balances.agentEth)} Sepolia ETH, ${balances.agentGlm === null ? "unknown" : formatEther(balances.agentGlm)} GLM`);
  if (!args.includes("--send")) console.log("\nNothing was sent. Rerun with --send to have the server pay for the missing steps.");
}

main().catch((error) => {
  console.error((error as Error).message.split("\n")[0]);
  process.exit(1);
});
