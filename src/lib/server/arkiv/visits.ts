// Knocks and time-limited visits. The ENS pass says who may knock; a live visit on Arkiv says who is inside, and until when.
// Access checks read the node, never the indexer: the indexer keeps every visit after it ends, and the node doesn't.
import { ExpirationTime, type FullRow } from "@arkiv-network/sdk";
import { and, desc, eq } from "@arkiv-network/sdk/query";
import { addr, key, u64 } from "@arkiv-network/sdk/schema";
import { isAddressEqual, type Address, type Hex } from "viem";
import { arkiv, createFor, nowSeconds, type Arkiv, type ArkivWallet, type Written } from "./client";
import { Knock, Visit } from "./schemas";

const KNOCK_LIFETIME = () => ExpirationTime.fromHours(12);
const MAX_VISIT_SECONDS = 24 * 3600;

// What a pass may see. A saga is named by its id, never its title.
export type Scope = "gallery" | "published" | `saga:${string}`;
const SCOPE = /^(gallery|published|saga:[A-Za-z0-9_-]{1,64})$/;

function checkScope(scope: string): asserts scope is Scope {
  if (!SCOPE.test(scope)) throw new Error(`Scope must be "gallery", "published" or "saga:<id>", got "${scope}".`);
}

export type KnockRow = { key: Hex; visitor: Address; pass: Hex; scope: string; expiresAt: bigint };
export type VisitRow = { key: Hex; dreamer: Address; pass: Hex; scope: Scope; knock?: Hex; endsAt: number; expiresAt: bigint };

const toKnock = (row: FullRow<typeof Knock>): KnockRow => ({ key: row.$key, visitor: row.$owner, pass: row.pass.value, scope: row.scope.value, expiresAt: row.$expiresAt });

const toVisit = (row: FullRow<typeof Visit>): VisitRow => ({
  key: row.$key,
  dreamer: row.$owner,
  pass: row.pass.value,
  scope: row.scope.value as Scope,
  knock: row.knock?.value,
  endsAt: Number(row.endsAt.value),
  expiresAt: row.$expiresAt,
});

// A visitor asks to come in. The server writes it and the visitor owns it; ignored, it fades in 12 hours.
export function knock(input: { visitor: Address; pass: Hex; host: Address; scope: Scope }, ctx: Arkiv = arkiv()): Promise<Written> {
  checkScope(input.scope);
  return createFor(ctx, Knock, { pass: key(input.pass), host: addr(input.host), scope: input.scope }, input.visitor, { expiration: KNOCK_LIFETIME() });
}

// Live visits to a dreamer's gallery that the server created and the dreamer still owns.
export async function liveVisits(dreamer: Address, ctx: Arkiv = arkiv()): Promise<VisitRow[]> {
  const page = await ctx.reader.select("*").from(Visit).where(eq("host", addr(dreamer))).ownedBy(dreamer).createdBy(ctx.serverAddress).limit(100).fetch();
  const now = nowSeconds();
  return page.entities.filter((row) => row.$expiresAt > page.blockNumber && Number(row.endsAt.value) > now).map(toVisit);
}

// Knocks waiting at a gallery, newest first, one per pass. A knock a live visit answers, or one in `exclude`, isn't waiting.
// Only the visitor can delete a knock, so after a visit ends its knock shows again until it fades; pass answered keys in `exclude`.
export async function openKnocks(host: Address, options: { exclude?: Hex[] } = {}, ctx: Arkiv = arkiv()): Promise<KnockRow[]> {
  const [page, visits] = await Promise.all([
    ctx.reader.select("*").from(Knock).where(eq("host", addr(host))).createdBy(ctx.serverAddress).orderBy(desc("$expiresAt")).limit(100).fetch(),
    liveVisits(host, ctx),
  ]);
  const answered = new Set([...(options.exclude ?? []), ...visits.flatMap((v) => (v.knock ? [v.knock] : []))].map((k) => k.toLowerCase()));
  const passes = new Set(visits.map((v) => v.pass.toLowerCase()));
  const open: KnockRow[] = [];
  for (const row of page.entities) {
    const pass = row.pass.value.toLowerCase();
    if (answered.has(row.$key.toLowerCase()) || passes.has(pass)) continue;
    passes.add(pass);
    open.push(toKnock(row));
  }
  return open;
}

// The dreamer lets a pass in until `endsAt`. The server writes the visit and the dreamer owns it, so only the dreamer can end it early.
export async function letIn(input: { dreamer: Address; pass: Hex; scope: Scope; endsAt: Date; knock?: Hex }, ctx: Arkiv = arkiv()): Promise<Written> {
  checkScope(input.scope);
  const seconds = (input.endsAt.getTime() - Date.now()) / 1000;
  if (seconds < 4 || seconds > MAX_VISIT_SECONDS) throw new Error("A visit must end between a few seconds and 24 hours from now.");
  if (input.knock) {
    const knocked = await ctx.reader.getEntity(input.knock, Knock);
    const fits = isAddressEqual(knocked.$creator, ctx.serverAddress) && isAddressEqual(knocked.host.value, input.dreamer) && knocked.pass.value.toLowerCase() === input.pass.toLowerCase();
    if (!fits) throw new Error("That knock is for another pass or another gallery.");
  }
  return createFor(
    ctx,
    Visit,
    { pass: key(input.pass), host: addr(input.dreamer), scope: input.scope, knock: input.knock ? key(input.knock) : undefined, endsAt: u64(Math.ceil(input.endsAt.getTime() / 1000)) },
    input.dreamer,
    { expiration: ExpirationTime.atDate(input.endsAt) },
  );
}

// Signed by the dreamer's wallet.
export function endVisit(dreamer: ArkivWallet, visitKey: Hex) {
  return dreamer.deleteEntity({ entityKey: visitKey });
}

// The check before every page a visitor sees: a live visit for this pass, created by the server and owned by the dreamer.
// It asks the node, which stops returning an entity once it expires, and also refuses one at or past its expiry block or endsAt.
// The caller must separately check that the visitor owns the pass on ENS.
export async function activeVisit(dreamer: Address, pass: Hex, ctx: Arkiv = arkiv()): Promise<VisitRow | null> {
  const page = await ctx.reader
    .select("*")
    .from(Visit)
    .where(and(eq("pass", key(pass)), eq("host", addr(dreamer))))
    .ownedBy(dreamer)
    .createdBy(ctx.serverAddress)
    .orderBy(desc("$expiresAt"))
    .limit(1)
    .fetch();
  const row = page.entities[0];
  if (!row || row.$expiresAt <= page.blockNumber || Number(row.endsAt.value) <= nowSeconds()) return null;
  // The dreamer may patch their own visit, so a scope the app doesn't know grants nothing.
  return SCOPE.test(row.scope.value) ? toVisit(row) : null;
}
