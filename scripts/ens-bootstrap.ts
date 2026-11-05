// Sets up DreamscapeRegistry, then prints the one transaction the owner of dream-scape.eth must send from their own wallet.
// Reads only, unless --send, which has the server deploy the registry and pay for it.
// node --env-file-if-exists=.env.local --import tsx scripts/ens-bootstrap.ts [--send] [rpc url, default SEPOLIA_RPC_URL]
import { formatEther, labelhash } from "viem";
import { env } from "../src/lib/server/env";
import { bootstrapRegistry, checkMount, planBootstrap } from "../src/lib/server/ens/bootstrap";
import { ensClients } from "../src/lib/server/ens/client";

async function main() {
  const args = process.argv.slice(2);
  const ens = ensClients(args.find((arg) => !arg.startsWith("--")) ?? env.sepoliaRpc());
  const server = ens.server.account.address;
  const plan = args.includes("--send") ? await bootstrapRegistry(ens) : { ...(await planBootstrap(ens.client, server)), steps: [] };
  for (const step of plan.steps) console.log(`${step.step}: ${step.hash} (${step.gasUsed.toLocaleString("en-US")} gas)`);
  console.log(`DreamscapeRegistry ${plan.registry}: ${plan.deployed ? "deployed" : "not deployed yet"}, ${plan.mounted ? "mounted" : "not mounted"}`);
  console.log(`Server ${server} holds ${formatEther(await ens.client.getBalance({ address: server }))} ETH`);
  if (plan.mounted) {
    const mount = await checkMount(ens.client);
    console.log(`findCanonicalRegistry(${env.ensName()}) matches: ${mount.canonical}; emancipated: ${mount.emancipated}`);
    return;
  }
  if (!plan.deployed) console.log("Deploy it first: rerun with --send, then send the transaction below.");
  console.log(`\nFrom ${plan.mount.from}, the owner of ${env.ensName()}, on chain ${plan.mount.chainId}:`);
  console.log(JSON.stringify({ to: plan.mount.to, value: plan.mount.value, data: plan.mount.data }, null, 2));
  console.log(`That is setSubregistry(${BigInt(labelhash(plan.parent.label))}, ${plan.registry}) on ${plan.parent.registry}.`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
