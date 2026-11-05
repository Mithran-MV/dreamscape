// Day records on YYYY-MM-DD.<handle>.dream-scape.eth, a name with no registry entry. The Universal Resolver
// serves it from the dreamer's resolver (wildcard), and only the scribe may write the four day keys there.
import { encodeFunctionData, type Address } from "viem";
import { UNIVERSAL_RESOLVER, resolverAbi, universalResolverAbi } from "./contracts";
import { DAY_KEYS, checkDate, checkHandle, dayName, dns, galleryName, mined, revertName, type Ens, type Reader } from "./client";

// root: the 0G Storage root hash. scope: which passes may see the day ("gallery", "published" or "saga:<name>").
export type DayRecord = { root: string; saga: string; date: string; scope: string };

// The resolver the Universal Resolver would use for `name`. It must be the one set on the gallery name itself.
async function resolverFor(client: Reader, name: string, handle: string) {
  const [resolver, , offset] = await client.readContract({ address: UNIVERSAL_RESOLVER, abi: universalResolverAbi, functionName: "findResolver", args: [dns(name)] });
  const expected = BigInt(dns(name).length - dns(galleryName(handle)).length) / BigInt(2);
  if (offset !== expected) throw new Error(`${galleryName(handle)} has no resolver of its own.`);
  return resolver as Address;
}

export async function writeDayRecord(ens: Ens, handle: string, record: DayRecord) {
  checkHandle(handle);
  checkDate(record.date);
  const name = dayName(handle, record.date);
  const resolver = await resolverFor(ens.client, name, handle);
  const calls = (Object.keys(DAY_KEYS) as (keyof DayRecord)[]).map((field) =>
    encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [dns(name), DAY_KEYS[field], record[field]] }),
  );
  const hash = await ens.scribe.writeContract({ address: resolver, abi: resolverAbi, functionName: "multicall", args: [calls] });
  return { name, resolver, step: await mined(ens.client, `scribe writes ${name}`, hash) };
}

// Reads through the Universal Resolver, as any ENS client would. Missing keys come back null.
export async function readDayRecord(client: Reader, handle: string, date: string) {
  checkDate(date);
  const name = dayName(handle, date);
  const fields = Object.keys(DAY_KEYS) as (keyof DayRecord)[];
  const values = await Promise.all(
    fields.map((field) => client.getEnsText({ name, key: DAY_KEYS[field], strict: true, universalResolverAddress: UNIVERSAL_RESOLVER })),
  );
  return { name, ...(Object.fromEntries(fields.map((field, i) => [field, values[i]])) as Record<keyof DayRecord, string | null>) };
}

// For the proof panel: simulates the scribe setting a key it was never granted, on the gallery name.
// Returns the revert's error name (EACUnauthorizedAccountRoles), or undefined if the write would go through.
export async function scribeAttempt(ens: Ens, handle: string, key = "avatar") {
  const name = galleryName(handle);
  const resolver = await resolverFor(ens.client, name, handle);
  try {
    await ens.client.simulateContract({ account: ens.scribe.account, address: resolver, abi: resolverAbi, functionName: "setText", args: [dns(name), key, "scribe"] });
    return undefined;
  } catch (error) {
    const reason = revertName(error);
    if (!reason) throw error;
    return reason;
  }
}
