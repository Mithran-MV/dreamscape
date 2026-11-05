// Background worker: claims one job at a time from the SQLite queue and runs it.
import { claimNext, fail, finish, requeueStuck, retryLater, type Job } from "../src/lib/server/jobs";
import { notifyPainted, paintDream, storeDream } from "../src/lib/server/pipeline";
import { notifyEpisode, pollLivingPortrait, runNight, scheduleNights } from "../src/lib/server/nightly";
import { paintWorld, scheduleWorld } from "../src/lib/server/world";
import { dayRecordJob, onboardJob } from "../src/lib/server/names";
import { updateDream } from "../src/lib/server/dreams";
import { ZeroGError } from "../src/lib/server/zerog/router";

const handlers: Record<string, (ref: string) => Promise<void>> = {
  "dream.paint": paintDream,
  "dream.store": storeDream,
  "dream.notify": notifyPainted,
  "night.run": runNight,
  "episode.notify": notifyEpisode,
  "dream.video": pollLivingPortrait,
  "world.paint": paintWorld,
  "ens.onboard": onboardJob,
  "dream.ens": dayRecordJob,
};
// Jobs whose failure means the dream itself is stuck. A failed notice leaves the dream alone.
const PIPELINE = new Set(["dream.paint", "dream.store"]);

async function run(job: Job) {
  const handler = handlers[job.kind];
  if (!handler) return fail(job.id, `No handler for ${job.kind}`);
  const started = Date.now();
  try {
    await handler(job.ref);
    finish(job.id);
    console.log(`[worker] ${job.kind} ${job.ref} done in ${Math.round((Date.now() - started) / 1000)}s`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Bad keys and bad requests won't fix themselves; everything else (busy enclaves, gas, network) gets retried.
    if (error instanceof ZeroGError && !error.retryable) {
      fail(job.id, message);
      if (PIPELINE.has(job.kind)) updateDream(job.ref, { status: "failed", error: message });
    } else {
      const gaveUp = retryLater(job, message);
      if (PIPELINE.has(job.kind)) updateDream(job.ref, { error: message, ...(gaveUp ? { status: "failed" } : {}) });
    }
    console.error(`[worker] ${job.kind} ${job.ref} attempt ${job.attempts}: ${message.slice(0, 200)}`);
  }
}

async function loop() {
  requeueStuck();
  console.log("[worker] started");
  let scheduled = 0;
  for (;;) {
    if (Date.now() - scheduled > 60_000) {
      scheduleNights();
      scheduleWorld();
      scheduled = Date.now();
    }
    const job = claimNext();
    if (job) await run(job);
    else await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

loop();
