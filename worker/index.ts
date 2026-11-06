// Background worker: claims one job at a time from the SQLite queue and runs it.
import { claimNext, fail, finish, requeueStuck, retryLater, type Job } from "../src/lib/server/jobs";
import { notifyPainted, paintDream, storeDream } from "../src/lib/server/pipeline";
import { notifyEpisode, pollLivingPortrait, runNight, scheduleNights, startLivingPortrait } from "../src/lib/server/nightly";
import { paintWorld, publishWorldJob, scheduleWorld } from "../src/lib/server/world";
import { dayRecordJob, onboardJob } from "../src/lib/server/names";
import { dripJob } from "../src/lib/server/drip";
import { grantPassJob, knockNoticeJob } from "../src/lib/server/visits";
import { recordRequestJob } from "../src/lib/server/commissions";
import { claimJob, heartbeatJob, makeJob, notifyJob, scheduleHeartbeats } from "../src/lib/server/vendor";
import { arkivJob, listJob, openTonightsStalls, scheduleStalls } from "../src/lib/server/market";
import { makeReveal, paintTonight, scheduleMornings } from "../src/lib/server/memories";
import { getDream, updateDream } from "../src/lib/server/dreams";
import { asDreamer } from "../src/lib/server/zerog/account";
import { ZeroGError } from "../src/lib/server/zerog/router";

const handlers: Record<string, (ref: string) => Promise<void>> = {
  "dream.paint": paintDream,
  "dream.store": storeDream,
  "dream.notify": notifyPainted,
  "night.run": runNight,
  "episode.notify": notifyEpisode,
  "dream.video": pollLivingPortrait,
  "dream.animate": startLivingPortrait,
  "world.paint": paintWorld,
  "ens.onboard": onboardJob,
  "dream.ens": dayRecordJob,
  "wallet.drip": dripJob,
  "piece.list": listJob,
  "piece.arkiv": arkivJob,
  "market.stalls": openTonightsStalls,
  "world.arkiv": publishWorldJob,
  "pass.grant": grantPassJob,
  "knock.notify": knockNoticeJob,
  "commission.arkiv": recordRequestJob,
  "commission.claim": claimJob,
  "commission.make": makeJob,
  "commission.notify": notifyJob,
  "agent.heartbeat": heartbeatJob,
  "reveal.make": makeReveal,
  "night.poster": paintTonight,
};
// Jobs that spend 0G credit on one dreamer's behalf run on that dreamer's own 0G key, if they connected one.
const DREAMER: Record<string, (ref: string) => string | undefined> = {
  "dream.paint": (ref) => getDream(ref)?.user_id,
  "dream.video": (ref) => getDream(ref)?.user_id,
  "dream.animate": (ref) => ref,
  "night.run": (ref) => ref,
  "reveal.make": (ref) => ref.split(":")[0],
  "night.poster": (ref) => ref,
};
// Jobs whose failure means the dream itself is stuck. A failed notice leaves the dream alone.
const PIPELINE = new Set(["dream.paint", "dream.store"]);

async function run(job: Job) {
  const handler = handlers[job.kind];
  if (!handler) return fail(job.id, `No handler for ${job.kind}`);
  const started = Date.now();
  try {
    await asDreamer(DREAMER[job.kind]?.(job.ref), () => handler(job.ref));
    finish(job.id);
    console.log(`[worker] ${job.kind} ${job.ref} done in ${Math.round((Date.now() - started) / 1000)}s`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Bad keys and bad requests won't fix themselves; everything else (busy enclaves, gas, network) gets retried.
    if (error instanceof ZeroGError && !error.retryable) {
      fail(job.id, message);
      if (PIPELINE.has(job.kind)) updateDream(job.ref, { status: "failed", error: message });
    } else {
      // A sealed provider being down, or storage waiting on gas, is worth waiting out for hours; anything else gets a few tries.
      const gaveUp = retryLater(job, message, error instanceof ZeroGError || job.kind === "dream.store" ? 40 : 8);
      // A painting that can't be stored yet still hangs on the wall; only a failed paint marks the dream failed.
      if (PIPELINE.has(job.kind)) updateDream(job.ref, { error: message.slice(0, 300), ...(gaveUp && job.kind === "dream.paint" ? { status: "failed" } : {}) });
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
      scheduleStalls();
      scheduleHeartbeats();
      scheduleMornings().catch((e) => console.error(`[worker] morning notices: ${(e as Error).message}`));
      scheduled = Date.now();
    }
    const job = claimNext();
    if (job) await run(job);
    else await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

loop();
