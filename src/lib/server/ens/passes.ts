// Family passes: <random label>.passes.<handle>.dream-scape.eth in the dreamer's passes registry, owned by the visitor.
// Registered with no roles, so the holder can't transfer it, and a 30-day expiry. Only the dreamer holds UNREGISTER there.
import { randomBytes } from "node:crypto";
import { encodeFunctionData, labelhash, namehash, parseAbi, zeroAddress, type Address, type Hex } from "viem";
import { UNIVERSAL_HELPER, UNIVERSAL_RESOLVER, registryAbi, resolverAbi, universalResolverAbi } from "./contracts";
import { DAY_KEYS, dns, mined, same, type Ens, type Reader, type Step } from "./client";

export const PASS_SCOPES = ["gallery", "published"] as const;
export type PassScope = (typeof PASS_SCOPES)[number];
export const PASS_DAYS = 30;

export const isPassScope = (value: unknown): value is PassScope => (PASS_SCOPES as readonly unknown[]).includes(value);

// What a pass holder might try, and the errors that stop them.
export const passRegistryAbi = parseAbi([
  "function unregister(uint256 anyId)",
  "function findTokenId(string label) view returns (uint256)",
  "function unsafeTransfer(address to, uint256 tokenId, bytes data)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)",
  "error TransferDisallowed(uint256 tokenId, address from)",
  "error TransferUnsafeUntilRegistryIsEmancipated()",
  "error TransferUnsafeWithMultipleAssignees(uint256 tokenId, address from)",
  "error LabelExpired(uint256 tokenId)",
  "error EACUnauthorizedAccountRoles(uint256 resource, uint256 roleBitmap, address account)",
]);

const findOwnerAbi = parseAbi(["function findExactOwner(bytes name) view returns (address)"]);

// Random, so the name never says who holds it: "p7f3k", never "mom".
export function newPassLabel() {
  const digits = "abcdefghijklmnopqrstuvwxyz0123456789";
  return `p${Array.from(randomBytes(4), (b) => digits[b % digits.length]).join("")}`;
}

export const passName = (gallery: string, label: string) => `${label}.passes.${gallery}`;

function checkLabel(label: string) {
  if (!/^[a-z0-9]{3,16}$/.test(label)) throw new Error(`"${label}" can't be a pass label.`);
}

export type PassGrant = { name: string; label: string; node: Hex; expiry: bigint; steps: Step[] };

// The server registers the pass with the dreamer's resolver, then the scribe writes its scope there.
// Safe to rerun after a failure: finished steps are skipped. `onStep` hears each transaction as it lands.
export async function grantPass(
  ens: Ens,
  input: { gallery: string; passes: Address; resolver: Address; visitor: Address; scope: PassScope; label: string; days?: number; onStep?: (step: Step) => void },
): Promise<PassGrant> {
  const { gallery, passes, resolver, visitor, scope, label, days = PASS_DAYS, onStep } = input;
  checkLabel(label);
  if (!isPassScope(scope)) throw new Error(`A pass scope is "gallery" or "published", not "${scope}".`);
  if (visitor === zeroAddress) throw new Error("A pass needs a visitor's wallet.");
  const { client } = ens;
  const name = passName(gallery, label);
  const steps: Step[] = [];
  const record = (step: Step) => {
    steps.push(step);
    onStep?.(step);
  };

  const holder = await client.readContract({ address: passes, abi: registryAbi, functionName: "findOwner", args: [label] });
  let expiry: bigint;
  if (holder === zeroAddress) {
    // From the chain's clock, so a fork that has moved time still gets 30 days.
    expiry = (await client.getBlock()).timestamp + BigInt(days * 86_400);
    const hash = await ens.server.writeContract({
      address: passes,
      abi: registryAbi,
      functionName: "register",
      args: [label, visitor, zeroAddress, resolver, BigInt(0), expiry],
    });
    record(await mined(client, `register ${name}`, hash));
  } else if (same(holder, visitor)) {
    expiry = await client.readContract({ address: passes, abi: registryAbi, functionName: "findExpiry", args: [label] });
  } else {
    throw new Error(`${name} belongs to someone else.`);
  }

  if ((await passScope(client, name, resolver)) !== scope) {
    const hash = await ens.scribe.writeContract({ address: resolver, abi: resolverAbi, functionName: "setText", args: [dns(name), DAY_KEYS.scope, scope] });
    record(await mined(client, `scribe writes the scope of ${name}`, hash));
  }
  return { name, label, node: namehash(name), expiry, steps };
}

// Who holds the pass, found by name rather than token id, since token ids change. Zero once revoked or expired.
export function findPass(client: Reader, name: string): Promise<Address> {
  return client.readContract({ address: UNIVERSAL_HELPER, abi: findOwnerAbi, functionName: "findExactOwner", args: [dns(name)] });
}

// The pass's scope, only if the pass itself names a resolver (and it's `resolver`, when given). A gone pass
// falls back to the gallery's resolver by wildcard and would still show its old record, so that counts as none.
export async function passScope(client: Reader, name: string, resolver?: Address): Promise<PassScope | null> {
  const [found, , offset] = await client.readContract({ address: UNIVERSAL_RESOLVER, abi: universalResolverAbi, functionName: "findResolver", args: [dns(name)] });
  if (offset !== BigInt(0) || found === zeroAddress || (resolver && !same(found, resolver))) return null;
  const value = await client.getEnsText({ name, key: DAY_KEYS.scope, strict: true, universalResolverAddress: UNIVERSAL_RESOLVER });
  return isPassScope(value) ? value : null;
}

// The revoke, for the dreamer's own wallet to send: the server holds no UNREGISTER role.
export function revokePassTx(passes: Address, label: string): { to: Address; data: Hex } {
  checkLabel(label);
  return { to: passes, data: encodeFunctionData({ abi: passRegistryAbi, functionName: "unregister", args: [BigInt(labelhash(label))] }) };
}

export async function passGone(client: Reader, name: string) {
  return (await findPass(client, name)) === zeroAddress;
}
