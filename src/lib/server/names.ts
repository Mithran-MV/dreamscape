// The app's side of ENS: name a dreamer once they have a wallet, then record each kept day
// as YYYY-MM-DD.<handle>.dream-scape.eth. Records hold only the 0G Storage root, saga, date and scope.
import { getDb } from "./db";
import { getDream, updateDream } from "./dreams";
import { enqueue } from "./jobs";
import { ensClients, ensReader, dayName, galleryName } from "./ens/client";
import { readDayRecord, writeDayRecord } from "./ens/days";
import { onboardDreamer } from "./ens/onboard";

const DAY_MS = 86_400_000;
export const isoDate = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
export const ensLink = (name: string) => `https://sepolia.app.ens.domains/${name}`;
export const sepoliaTx = (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`;

type NamedUser = { handle: string; wallet: string | null; ens_json: string | null };
const userOf = (id: string) => getDb().prepare("SELECT handle, wallet, ens_json FROM users WHERE id = ?").get(id) as NamedUser | undefined;

// Job 'ens.onboard', ref = user id. The server pays; the dreamer signs nothing.
export async function onboardJob(userId: string) {
  const user = userOf(userId);
  if (!user?.wallet || user.ens_json) return;
  const done = await onboardDreamer(ensClients(), { handle: user.handle, dreamer: user.wallet as `0x${string}` });
  const saved = { name: done.name, resolver: done.resolver, editions: done.editions, passes: done.passes, txs: done.steps.map((s) => ({ step: s.step, hash: s.hash })) };
  getDb().prepare("UPDATE users SET ens_json = ? WHERE id = ?").run(JSON.stringify(saved), userId);
  // Days kept before the name existed get their records now.
  const waiting = getDb().prepare("SELECT id FROM dreams WHERE user_id = ? AND record_root IS NOT NULL AND ens_tx IS NULL").all(userId) as { id: string }[];
  for (const { id } of waiting) enqueue("dream.ens", id);
}

// Job 'dream.ens', ref = dream id. Written by the scribe, which may set only the four day keys.
export async function dayRecordJob(dreamId: string) {
  const dream = getDream(dreamId);
  if (!dream?.record_root || dream.ens_tx) return;
  const user = userOf(dream.user_id);
  if (!user?.ens_json) return; // onboarding queues it once the name exists
  const { step } = await writeDayRecord(ensClients(), user.handle, { root: dream.record_root, saga: dream.saga ?? "", date: isoDate(dream.day), scope: "gallery" });
  updateDream(dreamId, { ens_tx: step.hash });
}

// The day's name has no registry entry (the gallery's resolver answers for it by wildcard), so the ENS
// app can't open it. The proof reads its records live through the Universal Resolver instead, and
// links the gallery name, which the ENS app can open.
export async function dayRecordProof(handle: string, day: number, tx: string | null, root: string | null) {
  if (!tx) return null;
  const name = dayName(handle, isoDate(day));
  const records = await readDayRecord(ensReader(), handle, isoDate(day)).catch(() => null);
  return {
    name,
    gallery: galleryName(handle),
    galleryLink: ensLink(galleryName(handle)),
    tx,
    txLink: sepoliaTx(tx),
    records: records && { root: records.root, saga: records.saga, date: records.date, scope: records.scope },
    // One record per day: a later dream that day takes the name over.
    current: Boolean(records?.root && root && records.root.toLowerCase() === root.toLowerCase()),
  };
}
