// Family passes and visits, the app's side. The ENS pass says who may knock; a live visit on Arkiv says who is inside.
// Every page or image a visitor sees is checked against both, then decrypted here. No key ever leaves the server.
import { isAddressEqual, namehash, type Address, type Hex } from "viem";
import { getDb, now } from "./db";
import { newId } from "./crypto";
import { enqueue, hasOpenJob } from "./jobs";
import { notify } from "./push";
import { getBlob, getDream, listDreams } from "./dreams";
import { getEpisode, listEpisodes, panelKey, type Script } from "./nightly";
import { ensClients, ensReader, same, type Reader } from "./ens/client";
import { findPass, grantPass, isPassScope, newPassLabel, passGone, passName, passScope, revokePassTx, type PassScope } from "./ens/passes";
import { waitVisible } from "./arkiv/client";
import { activeVisit, knock, letIn, liveVisits, openKnocks } from "./arkiv/visits";

const KNOCK_MS = 12 * 3600_000;
const PAINTED = new Set(["painted", "storing", "done"]);
export const VISIT_LENGTHS = { "10m": 600, "1h": 3600 } as const;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS passes (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES users(id),
  visitor_id TEXT NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,                  -- random, so the name never says who holds it
  name TEXT NOT NULL,                   -- <label>.passes.<handle>.dream-scape.eth
  node TEXT NOT NULL UNIQUE,            -- namehash(name), all a knock or visit on Arkiv carries
  wallet TEXT NOT NULL,                 -- the visitor's wallet, which owns the pass
  scope TEXT NOT NULL,                  -- gallery or published
  status TEXT NOT NULL,                 -- granting, active, revoked
  expires_at INTEGER,                   -- the pass's expiry on ENS, in ms
  grant_tx TEXT,
  scope_tx TEXT,
  revoke_tx TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS passes_by_host ON passes(host_id);
CREATE INDEX IF NOT EXISTS passes_by_visitor ON passes(visitor_id);
CREATE TABLE IF NOT EXISTS pass_knocks (
  key TEXT PRIMARY KEY,                 -- the knock's entity key on Arkiv, lowercase
  pass_id TEXT NOT NULL REFERENCES passes(id),
  created_at INTEGER NOT NULL,
  answered_at INTEGER                   -- Arkiv shows an answered knock again once its visit ends, so we remember
);
CREATE INDEX IF NOT EXISTS pass_knocks_by_pass ON pass_knocks(pass_id);
CREATE TABLE IF NOT EXISTS pass_visits (
  key TEXT PRIMARY KEY,                 -- the visit's entity key on Arkiv, lowercase
  pass_id TEXT NOT NULL REFERENCES passes(id),
  knock TEXT,
  ends_at INTEGER NOT NULL,             -- ms; only for the visitor's "ended" screen, never for access
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pass_visits_by_pass ON pass_visits(pass_id);
`;

let tables = false;
function db() {
  const d = getDb();
  if (!tables) {
    d.exec(SCHEMA);
    tables = true;
  }
  return d;
}

let reader: Reader | undefined;
const ens = () => (reader ??= ensReader());

type Failure = { error: string; status: number };
const fail = (error: string, status: number): Failure => ({ error, status });

// ---------------------------------------------------------------- people

type GalleryEns = { name: string; resolver: Address; editions: Address; passes: Address };
export type Member = { id: string; handle: string; wallet: Address | null; ens: GalleryEns | null };
type Named = Member & { wallet: Address; ens: GalleryEns };

type UserRow = { id: string; handle: string; wallet: string | null; ens_json: string | null };
const toMember = (row: UserRow | undefined): Member | undefined =>
  row && { id: row.id, handle: row.handle, wallet: (row.wallet as Address | null) ?? null, ens: row.ens_json ? (JSON.parse(row.ens_json) as GalleryEns) : null };

export const memberById = (id: string) => toMember(db().prepare("SELECT id, handle, wallet, ens_json FROM users WHERE id = ?").get(id) as UserRow | undefined);
export const memberByHandle = (handle: string) =>
  toMember(db().prepare("SELECT id, handle, wallet, ens_json FROM users WHERE handle = ?").get(handle.trim().toLowerCase()) as UserRow | undefined);

const named = (m: Member | undefined): m is Named => Boolean(m?.wallet && m.ens);

// ---------------------------------------------------------------- passes

export type Pass = {
  id: string;
  host_id: string;
  visitor_id: string;
  label: string;
  name: string;
  node: Hex;
  wallet: Address;
  scope: PassScope;
  status: "granting" | "active" | "revoked";
  expires_at: number | null;
  grant_tx: string | null;
  scope_tx: string | null;
  revoke_tx: string | null;
  created_at: number;
};

export type PassState = "granting" | "failed" | "active" | "expired" | "revoked";

export const getPass = (id: string) => db().prepare("SELECT * FROM passes WHERE id = ?").get(id) as Pass | undefined;

export function passState(p: Pass): PassState {
  if (p.status === "revoked") return "revoked";
  if (p.status === "granting") return hasOpenJob(p.id, ["pass.grant"]) ? "granting" : "failed";
  return p.expires_at !== null && p.expires_at <= now() ? "expired" : "active";
}

// The visitor's newest pass to this gallery that is granted or on its way.
function heldPass(hostId: string, visitorId: string) {
  const rows = db().prepare("SELECT * FROM passes WHERE host_id = ? AND visitor_id = ? AND status != 'revoked' ORDER BY created_at DESC").all(hostId, visitorId) as Pass[];
  return rows.find((p) => p.status === "active" && passState(p) === "active") ?? rows.find((p) => passState(p) === "granting");
}

// Granting is two Sepolia transactions, so it runs in the worker as 'pass.grant'.
export function grantPassTo(hostId: string, visitorHandle: string, scope: string): { pass: { id: string; name: string } } | Failure {
  if (!isPassScope(scope)) return fail("Pick what they may see: the whole gallery, or hung comics only.", 400);
  const host = memberById(hostId);
  if (!named(host)) return fail("Your gallery's ENS name isn't ready yet. It's made shortly after you sign in with 0G.", 409);
  const handle = visitorHandle.trim().toLowerCase();
  const visitor = handle ? memberByHandle(handle) : undefined;
  if (!visitor) return fail(`Nobody called ${handle || "that"} has a gallery here.`, 404);
  if (visitor.id === host.id) return fail("That's your own gallery.", 400);
  if (!visitor.wallet) return fail(`${handle} has no wallet yet. They get one by signing in with 0G.`, 409);
  if (heldPass(host.id, visitor.id)) return fail(`${handle} already holds a pass to your gallery.`, 409);
  const id = newId("pass");
  for (let attempt = 0; ; attempt++) {
    const label = newPassLabel();
    const name = passName(host.ens.name, label);
    try {
      db()
        .prepare("INSERT INTO passes (id, host_id, visitor_id, label, name, node, wallet, scope, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'granting', ?)")
        .run(id, host.id, visitor.id, label, name, namehash(name), visitor.wallet, scope, now());
      enqueue("pass.grant", id);
      return { pass: { id, name } };
    } catch (error) {
      if (attempt < 3 && String(error).includes("UNIQUE")) continue;
      throw error;
    }
  }
}

// Job 'pass.grant', ref = pass id. The server registers the pass; the scribe writes its scope.
export async function grantPassJob(passId: string) {
  const pass = getPass(passId);
  if (!pass || pass.status !== "granting") return;
  const host = memberById(pass.host_id);
  if (!named(host)) throw new Error("The dreamer has no ENS name yet.");
  const save = db().prepare("UPDATE passes SET grant_tx = COALESCE(grant_tx, ?), scope_tx = COALESCE(scope_tx, ?) WHERE id = ?");
  const done = await grantPass(ensClients(), {
    gallery: host.ens.name,
    passes: host.ens.passes,
    resolver: host.ens.resolver,
    visitor: pass.wallet,
    scope: pass.scope,
    label: pass.label,
    onStep: (s) => save.run(s.step.startsWith("register") ? s.hash : null, s.step.startsWith("scribe") ? s.hash : null, passId),
  });
  db().prepare("UPDATE passes SET status = 'active', expires_at = ? WHERE id = ? AND status = 'granting'").run(Number(done.expiry) * 1000, passId);
}

export function retryGrant(hostId: string, passId: string): { ok: true } | Failure {
  const pass = getPass(passId);
  if (!pass || pass.host_id !== hostId) return fail("Not found.", 404);
  if (passState(pass) !== "failed") return fail("Only a pass that couldn't be granted can be tried again.", 409);
  enqueue("pass.grant", pass.id);
  return { ok: true };
}

export type RevokeTx = { to: Address; data: Hex };

// Only the dreamer holds UNREGISTER on their passes registry, so their own wallet sends this.
export async function revokeTxFor(hostId: string, passId: string): Promise<{ tx: RevokeTx } | { revoked: true } | Failure> {
  const pass = getPass(passId);
  const host = memberById(hostId);
  if (!pass || pass.host_id !== hostId || !named(host)) return fail("Not found.", 404);
  if (pass.status === "revoked") return { revoked: true };
  if (passState(pass) === "granting") return fail("That pass is still being granted. Revoke it once it's ready.", 409);
  if (await passGone(ens(), pass.name)) {
    markRevoked(pass.id, null);
    return { revoked: true };
  }
  return { tx: revokePassTx(host.ens.passes, pass.label) };
}

// After the dreamer's wallet sends the revoke: believe it only once ENS no longer finds the pass.
export async function confirmRevoke(hostId: string, passId: string, hash?: string): Promise<{ revoked: true } | Failure> {
  const pass = getPass(passId);
  if (!pass || pass.host_id !== hostId) return fail("Not found.", 404);
  if (pass.status === "revoked") return { revoked: true };
  const tx = hash && /^0x[0-9a-fA-F]{64}$/.test(hash) ? (hash as Hex) : undefined;
  if (tx) await ens().waitForTransactionReceipt({ hash: tx, timeout: 60_000 }).catch(() => undefined);
  for (let i = 0; i < 5; i++) {
    if (await passGone(ens(), pass.name)) {
      markRevoked(pass.id, tx ?? null);
      return { revoked: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return fail("The pass is still on ENS. Try again in a moment.", 409);
}

function markRevoked(passId: string, tx: string | null) {
  db().prepare("UPDATE passes SET status = 'revoked', revoke_tx = COALESCE(?, revoke_tx) WHERE id = ?").run(tx, passId);
}

export const ensAppLink = (name: string) => `https://sepolia.app.ens.domains/${name}`;

// The dreamer's panel: passes they granted, and passes they hold to other galleries.
export function passesView(userId: string) {
  const me = memberById(userId);
  const granted = (db().prepare("SELECT p.*, u.handle AS visitor FROM passes p JOIN users u ON u.id = p.visitor_id WHERE p.host_id = ? ORDER BY p.created_at DESC").all(userId) as (Pass & { visitor: string })[])
    .map((p) => ({ p, state: passState(p) }))
    .filter(({ state }) => state !== "revoked")
    .map(({ p, state }) => ({ id: p.id, handle: p.visitor, scope: p.scope, state, name: p.name, link: ensAppLink(p.name), expiresAt: p.expires_at }));
  const held = (db().prepare("SELECT p.*, u.handle AS host FROM passes p JOIN users u ON u.id = p.host_id WHERE p.visitor_id = ? AND p.status = 'active' ORDER BY p.created_at DESC").all(userId) as (Pass & { host: string })[])
    .filter((p) => passState(p) === "active")
    .map((p) => ({ handle: p.host, scope: p.scope, expiresAt: p.expires_at }));
  return { ready: { wallet: Boolean(me?.wallet), name: Boolean(me?.ens) }, granted, held };
}

// ---------------------------------------------------------------- knocks and visits

type KnockRecord = { key: string; pass_id: string; created_at: number; answered_at: number | null };

const waitingKnock = (passId: string) =>
  db().prepare("SELECT * FROM pass_knocks WHERE pass_id = ? AND answered_at IS NULL AND created_at > ? ORDER BY created_at DESC LIMIT 1").get(passId, now() - KNOCK_MS) as
    | KnockRecord
    | undefined;

const lastVisit = (passId: string) =>
  db().prepare("SELECT * FROM pass_visits WHERE pass_id = ? ORDER BY created_at DESC LIMIT 1").get(passId) as { key: string; ends_at: number; created_at: number } | undefined;

// The visitor taps Visit. The server writes the knock, the visitor owns it, and it fades in 12 hours.
export async function knockAt(visitorId: string, handle: string): Promise<{ key: string } | Failure> {
  const visitor = memberById(visitorId);
  const host = memberByHandle(handle);
  if (!visitor?.wallet || !named(host) || host.id === visitor.id) return fail("Not found.", 404);
  const pass = heldPass(host.id, visitor.id);
  if (!pass) return fail("You need a pass from them to visit.", 403);
  if (pass.status !== "active") return fail("Your pass is still on its way.", 409);
  if (!same(await findPass(ens(), pass.name), visitor.wallet)) return fail("Your pass has ended.", 403);
  const waiting = waitingKnock(pass.id);
  if (waiting) return { key: waiting.key };
  const visit = lastVisit(pass.id);
  if (visit && visit.ends_at > now() && (await activeVisit(host.wallet, pass.node))) return fail("You're already inside.", 409);
  const written = await knock({ visitor: visitor.wallet, pass: pass.node, host: host.wallet, scope: pass.scope });
  const key = written.key.toLowerCase();
  db().prepare("INSERT OR IGNORE INTO pass_knocks (key, pass_id, created_at) VALUES (?, ?, ?)").run(key, pass.id, now());
  enqueue("knock.notify", key);
  // A read straight after a write can miss it, and letting in reads the knock.
  await waitVisible(written.key);
  return { key };
}

// Job 'knock.notify', ref = knock key. The notice never says who knocked or what they'd see.
export async function knockNoticeJob(knockKey: string) {
  const row = db().prepare("SELECT p.host_id FROM pass_knocks k JOIN passes p ON p.id = k.pass_id WHERE k.key = ? AND k.answered_at IS NULL").get(knockKey.toLowerCase()) as
    | { host_id: string }
    | undefined;
  if (!row) return;
  await notify(row.host_id, { title: "Someone wants to visit your gallery", body: "Let them in for 10 minutes or an hour.", url: "/#passes", tag: "knock" });
}

// The dreamer's door: knocks waiting, and who is inside now. Both read the Arkiv node.
export async function doorFor(hostId: string) {
  const host = memberById(hostId);
  if (!host?.wallet) return { knocks: [], inside: [] };
  const passes = db().prepare("SELECT p.*, u.handle AS visitor FROM passes p JOIN users u ON u.id = p.visitor_id WHERE p.host_id = ?").all(hostId) as (Pass & { visitor: string })[];
  const byNode = new Map(passes.map((p) => [p.node.toLowerCase(), p]));
  const records = db()
    .prepare("SELECT k.* FROM pass_knocks k JOIN passes p ON p.id = k.pass_id WHERE p.host_id = ? AND k.created_at > ?")
    .all(hostId, now() - KNOCK_MS) as KnockRecord[];
  const byKey = new Map(records.map((k) => [k.key, k]));
  const answered = records.filter((k) => k.answered_at !== null).map((k) => k.key as Hex);
  const [knocks, visits] = await Promise.all([openKnocks(host.wallet, { exclude: answered }), liveVisits(host.wallet)]);
  return {
    knocks: knocks.flatMap((k) => {
      const pass = byNode.get(k.pass.toLowerCase());
      // Only knocks from the wallet that holds a live pass of ours.
      if (!pass || passState(pass) !== "active" || !isAddressEqual(k.visitor, pass.wallet)) return [];
      return [{ key: k.key.toLowerCase(), handle: pass.visitor, scope: pass.scope, at: byKey.get(k.key.toLowerCase())?.created_at ?? null }];
    }),
    inside: visits.flatMap((v) => {
      const pass = byNode.get(v.pass.toLowerCase());
      return pass ? [{ key: v.key.toLowerCase(), handle: pass.visitor, scope: v.scope, endsAt: v.endsAt * 1000 }] : [];
    }),
  };
}

// The dreamer lets a knock in. The server writes the visit and the dreamer owns it; it expires when the visit ends.
export async function letVisitorIn(hostId: string, knockKey: string, seconds: number): Promise<{ key: string; endsAt: number } | Failure> {
  const host = memberById(hostId);
  const row = db()
    .prepare("SELECT k.key, k.answered_at, p.id AS pass_id FROM pass_knocks k JOIN passes p ON p.id = k.pass_id WHERE k.key = ? AND p.host_id = ?")
    .get(knockKey.toLowerCase(), hostId) as { key: string; answered_at: number | null; pass_id: string } | undefined;
  if (!Number.isFinite(seconds) || seconds < 5 || seconds > 24 * 3600) return fail("A visit lasts between a few seconds and a day.", 400);
  if (!row || !named(host)) return fail("That knock isn't at your door.", 404);
  if (row.answered_at) return fail("You already let them in.", 409);
  const pass = getPass(row.pass_id)!;
  const visitor = memberById(pass.visitor_id);
  if (passState(pass) !== "active" || !visitor?.wallet) return fail("That pass has ended.", 409);
  // The scope comes from ENS, not from the knock or our own table.
  const [owner, scope] = await Promise.all([findPass(ens(), pass.name), passScope(ens(), pass.name, host.ens.resolver)]);
  if (!same(owner, visitor.wallet) || !scope) return fail("That pass has ended.", 409);
  const endsAt = new Date(now() + seconds * 1000);
  const written = await letIn({ dreamer: host.wallet, pass: pass.node, scope, endsAt, knock: row.key as Hex });
  const key = written.key.toLowerCase();
  db().prepare("UPDATE pass_knocks SET answered_at = ? WHERE key = ?").run(now(), row.key);
  db().prepare("INSERT OR IGNORE INTO pass_visits (key, pass_id, knock, ends_at, created_at) VALUES (?, ?, ?, ?, ?)").run(key, pass.id, row.key, endsAt.getTime(), now());
  await waitVisible(written.key);
  return { key, endsAt: endsAt.getTime() };
}

// ---------------------------------------------------------------- the check before every page and image

export type Inside = { inside: true; host: Named; pass: Pass; scope: PassScope; endsAt: number; visit: Hex };
export type Outside = { inside: false; state: "no-pass" | "granting" | "outside" | "waiting" | "ended" };

// All three, every time:
// 1. the visitor's wallet owns the pass on ENS, found by name with findExactOwner;
// 2. a live visit for that pass exists on the Arkiv node, never the indexer;
// 3. that visit was created by the server and is owned by the dreamer.
export async function checkVisit(visitorId: string, handle: string): Promise<Inside | Outside> {
  const visitor = memberById(visitorId);
  const host = memberByHandle(handle);
  if (!visitor?.wallet || !named(host) || host.id === visitor.id) return { inside: false, state: "no-pass" };
  const pass = heldPass(host.id, visitor.id);
  if (!pass) return { inside: false, state: "no-pass" };
  if (pass.status !== "active") return { inside: false, state: "granting" };
  const [owner, scope, visit] = await Promise.all([
    findPass(ens(), pass.name),
    passScope(ens(), pass.name, host.ens.resolver),
    // The node query asks for visits created by the server and owned by the dreamer, and drops expired ones.
    activeVisit(host.wallet, pass.node),
  ]);
  if (!same(owner, visitor.wallet) || !scope) return { inside: false, state: "no-pass" };
  if (visit && isAddressEqual(visit.dreamer, host.wallet) && visit.scope === scope) return { inside: true, host, pass, scope, endsAt: visit.endsAt * 1000, visit: visit.key };
  if (waitingKnock(pass.id)) return { inside: false, state: "waiting" };
  return { inside: false, state: lastVisit(pass.id) ? "ended" : "outside" };
}

// ---------------------------------------------------------------- what a pass may see

type ComicScript = { title: string; panels: { dialogue: Script["panels"][number]["dialogue"]; caption: string | null }[] };

// "gallery": painted dreams with their words, and hung comics. "published": hung comics only.
// Never Morning Notes, drafts, voice notes, tags or proofs. Comic scenes stay out too: they were written from the dream.
export function visitorSlice(access: Inside) {
  const { host, scope } = access;
  const dreams =
    scope === "gallery"
      ? listDreams(host.id)
          .filter((d) => PAINTED.has(d.status))
          .map((d) => ({ id: d.id, day: d.day, title: d.title, feeling: d.feeling ?? d.suggested_feeling, saga: d.saga, words: d.transcript }))
      : [];
  const comics = listEpisodes(host.id)
    .filter((e) => e.status === "published" && e.script_json)
    .map((e) => {
      const script = JSON.parse(e.script_json!) as Script;
      const lettered: ComicScript = { title: script.title, panels: script.panels.map((p) => ({ dialogue: p.dialogue, caption: p.caption })) };
      return { id: e.id, day: e.day, title: e.title, saga: e.saga, feeling: e.feeling, script: lettered };
    });
  return { dreams, comics };
}

export function visitorPortrait(access: Inside, dreamId: string) {
  if (access.scope !== "gallery") return undefined;
  const dream = getDream(dreamId);
  if (!dream || dream.user_id !== access.host.id || !PAINTED.has(dream.status)) return undefined;
  return getBlob(access.host.id, `dream/${dreamId}/portrait`);
}

export function visitorPanel(access: Inside, episodeId: string, n: number) {
  const ep = getEpisode(episodeId);
  if (!Number.isInteger(n) || n < 0 || n > 3 || !ep || ep.user_id !== access.host.id || ep.status !== "published") return undefined;
  return getBlob(access.host.id, panelKey(episodeId, n));
}
