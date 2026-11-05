// Checks that ENS, Arkiv and 0G are reachable and haven't moved. Run with `pnpm check` at H0, H24 and before submitting.
import { createPublicClient, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";
import { createPublicClient as createArkivClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";

const UNIVERSAL_RESOLVER = "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe";
const EXPECTED_ROOT = "0xb458d6a3a77919449d03e7a6903c26827c1ec43f"; // ENSv2 Sepolia deployment of 2026-10-01
const ENS_NAME = "dream-scape.eth";

let failures = 0;
const report = (ok: boolean, name: string, detail: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${detail}`);
};

async function checkEns() {
  const client = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com") });
  const root = await client.readContract({
    address: UNIVERSAL_RESOLVER,
    abi: parseAbi(["function ROOT_REGISTRY() view returns (address)"]),
    functionName: "ROOT_REGISTRY",
  });
  report(root.toLowerCase() === EXPECTED_ROOT, "ENS deployment", root.toLowerCase() === EXPECTED_ROOT ? "unchanged" : `Sepolia was redeployed (root ${root})`);
  const owner = await client.getEnsAddress({ name: ENS_NAME });
  report(Boolean(owner), ENS_NAME, owner ? `resolves to ${owner}` : "does not resolve");
}

async function checkArkiv() {
  const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" });
  const client = createArkivClient({ chain, transport: http(undefined, { retryCount: 0, timeout: 15_000 }) });
  const timing = await client.getBlockTiming();
  report(chain.id === 7794095, "Arkiv Rabdi", `chain ${chain.id}, block ${timing.currentBlock}`);
}

async function checkZeroG() {
  const headers: Record<string, string> = {};
  if (process.env.ZG_API_KEY) headers.Authorization = `Bearer ${process.env.ZG_API_KEY}`;
  const res = await fetch("https://router-api.0g.ai/v1/models", { headers });
  const body = (await res.json()) as { data?: { id: string }[] };
  const ids = new Set((body.data ?? []).map((m) => m.id));
  const needed = ["whisper-large-v3", "0gm-1.0-35b-a3b", "z-image-turbo", "tencent/hy-image-3.5-preview", "bytedance/seedance-2.0"];
  const missing = needed.filter((id) => !ids.has(id));
  report(res.ok && missing.length === 0, "0G router", missing.length ? `missing ${missing.join(", ")}` : `${ids.size} models, all ${needed.length} we use are listed`);
}

async function main() {
  for (const [name, run] of [["ENS", checkEns], ["Arkiv", checkArkiv], ["0G", checkZeroG]] as const) {
    try {
      await run();
    } catch (error) {
      report(false, name, (error as Error).message.split("\n")[0]);
    }
  }
  process.exit(failures ? 1 : 0);
}

main();
