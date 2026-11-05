// A tiny job queue in SQLite. The web app enqueues; the worker claims one job at a time.
import { getDb, now } from "./db";

export type Job = { id: number; kind: string; ref: string; attempts: number };

export function enqueue(kind: string, ref: string, delayMs = 0) {
  getDb()
    .prepare("INSERT INTO jobs (kind, ref, status, run_after, created_at) VALUES (?, ?, 'queued', ?, ?)")
    .run(kind, ref, now() + delayMs, now());
}

export function claimNext(): Job | undefined {
  const db = getDb();
  const job = db
    .prepare("SELECT id, kind, ref, attempts FROM jobs WHERE status = 'queued' AND run_after <= ? ORDER BY id LIMIT 1")
    .get(now()) as Job | undefined;
  if (!job) return undefined;
  const claimed = db.prepare("UPDATE jobs SET status = 'running', attempts = attempts + 1 WHERE id = ? AND status = 'queued'").run(job.id);
  return claimed.changes ? { ...job, attempts: job.attempts + 1 } : undefined;
}

export function finish(id: number) {
  getDb().prepare("UPDATE jobs SET status = 'done', last_error = NULL WHERE id = ?").run(id);
}

// Retry with a growing delay, up to maxAttempts; after that the job is marked failed.
export function retryLater(job: Job, error: string, maxAttempts = 8) {
  const failed = job.attempts >= maxAttempts;
  getDb()
    .prepare("UPDATE jobs SET status = ?, last_error = ?, run_after = ? WHERE id = ?")
    .run(failed ? "failed" : "queued", error.slice(0, 500), now() + Math.min(300_000, 15_000 * job.attempts), job.id);
  return failed;
}

export function fail(id: number, error: string) {
  getDb().prepare("UPDATE jobs SET status = 'failed', last_error = ? WHERE id = ?").run(error.slice(0, 500), id);
}

export function hasOpenJob(ref: string, kinds: string[]) {
  const marks = kinds.map(() => "?").join(", ");
  return !!getDb()
    .prepare(`SELECT 1 FROM jobs WHERE ref = ? AND kind IN (${marks}) AND status IN ('queued', 'running') LIMIT 1`)
    .get(ref, ...kinds);
}

// A crashed worker leaves jobs 'running'; put them back in the queue on start-up.
export function requeueStuck() {
  getDb().prepare("UPDATE jobs SET status = 'queued' WHERE status = 'running'").run();
}
