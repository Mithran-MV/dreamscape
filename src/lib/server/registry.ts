// DreamRegistry on 0G Galileo: one on-chain anchor per piece (root hash, model, request ID),
// because 0G request IDs appear on no public explorer.
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "./env";
import { tracesFor, type Dream } from "./dreams";

export const galileo = defineChain({
  id: 16602,
  name: "0G Galileo",
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  rpcUrls: { default: { http: ["https://evmrpc-testnet.0g.ai"] } },
  blockExplorers: { default: { name: "0G Chainscan", url: "https://chainscan-galileo.0g.ai" } },
});

const abi = parseAbi([
  "function anchor(address dreamer, uint64 day, uint8 kind, bytes32 storageRoot, string model, string requestId) returns (uint256)",
  "event Anchored(uint256 indexed id, address indexed dreamer, uint64 indexed day, uint8 kind, bytes32 storageRoot, string model, string requestId)",
]);

export const KIND = { portrait: 0, comic: 1, living: 2, narration: 3, world: 4 } as const;

// Returns undefined when no registry is configured yet, so the rest of the pipeline still runs.
export async function anchorDream(dream: Dream, kind: number = KIND.portrait) {
  const address = env.dreamRegistry();
  if (!address || !dream.portrait_root) return undefined;
  const account = privateKeyToAccount(env.serverKey());
  const transport = http(env.galileoRpc());
  const wallet = createWalletClient({ account, chain: galileo, transport });
  const reader = createPublicClient({ chain: galileo, transport });
  const portraitTrace = (tracesFor(dream.id) as { step: string; model: string; request_id: string | null }[]).find((t) => t.step === "portrait");
  const hash = await wallet.writeContract({
    address,
    abi,
    functionName: "anchor",
    // Dreamers have no wallet in this first cut, so the server's address stands in until sign-in lands.
    args: [account.address, BigInt(dream.day), kind, dream.portrait_root as `0x${string}`, portraitTrace?.model ?? "z-image-turbo", portraitTrace?.request_id ?? ""],
  });
  const receipt = await reader.waitForTransactionReceipt({ hash });
  const [event] = parseEventLogs({ abi, logs: receipt.logs, eventName: "Anchored" });
  return { tx: hash, id: Number(event?.args.id ?? 0) };
}

export const txLink = (hash: string) => `https://chainscan-galileo.0g.ai/tx/${hash}`;
