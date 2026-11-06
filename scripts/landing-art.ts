// Makes the landing page's pictures with the real pipeline, so the page shows what Dreamscape makes:
// the sample dream is told, tagged and painted on 0G, turned into that night's comic, and a World Dream
// is painted from six sample dreamers' themes. Runs against a throwaway database, so nothing is stored,
// anchored or named. Writes public/landing/ and the 0G receipts for every step.
// Run with: node --env-file-if-exists=.env.local --import tsx scripts/landing-art.ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const DREAM = "I was flying over my old school, and the roof turned into the sea.";
const OUT = "public/landing";

// The World Dream counts each dreamer once per theme, and a theme needs five dreamers to be painted.
const OTHERS: { themes: string[]; feeling: string }[] = [
  { themes: ["water", "flight"], feeling: "wonder" },
  { themes: ["water", "school", "flight"], feeling: "wonder" },
  { themes: ["flight", "school", "water"], feeling: "calm" },
  { themes: ["water", "school"], feeling: "wonder" },
  { themes: ["flight", "water", "school"], feeling: "joy" },
  { themes: ["school", "flight"], feeling: "wonder" },
];

async function save(name: string, bytes: Buffer, width: number) {
  await sharp(bytes).resize(width, width, { fit: "inside" }).jpeg({ quality: 84, mozjpeg: true }).toFile(join(OUT, name));
  console.log(`wrote ${OUT}/${name}`);
}

async function main() {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "dreamscape-landing-"));
  mkdirSync(OUT, { recursive: true });
  const { getDb, now, utcDay } = await import("../src/lib/server/db");
  const { createDream, getBlob, getDream, tracesFor } = await import("../src/lib/server/dreams");
  const { paintDream } = await import("../src/lib/server/pipeline");
  const { getEpisode, panelKey, runNight } = await import("../src/lib/server/nightly");
  const { getWorldDream, paintWorld, worldImageKey, WORLD, WORLD_OWNER } = await import("../src/lib/server/world");

  const db = getDb();
  const addUser = db.prepare("INSERT INTO users (id, handle, wallet, pass_hash, created_at) VALUES (?, ?, NULL, 'x', ?)");
  addUser.run("u0", "sample", now());

  // The dream, exactly as the tell screen sends it.
  const dreamId = createDream("u0", "text", "wonder", DREAM);
  await paintDream(dreamId);
  const dream = getDream(dreamId)!;
  await save("dream.jpg", getBlob("u0", `dream/${dreamId}/portrait`)!.bytes, 1200);

  // That night's comic. The moving portrait it queues afterwards is never run here.
  await runNight("u0");
  const ep = db.prepare("SELECT id FROM episodes WHERE user_id = 'u0'").get() as { id: string };
  const episode = getEpisode(ep.id)!;
  for (let n = 0; n < 4; n++) await save(`comic-${n + 1}.jpg`, getBlob("u0", panelKey(ep.id, n))!.bytes, 800);

  // Six more dreamers, tagged as the pipeline would tag them, then the day's World Dream.
  const day = utcDay();
  const addDream = db.prepare("INSERT INTO dreams (id, user_id, day, created_at, input_kind, status, suggested_feeling, tags_json) VALUES (?, ?, ?, ?, 'text', 'done', ?, ?)");
  OTHERS.forEach((o, i) => {
    addUser.run(`u${i + 1}`, `sample${i + 1}`, now());
    addDream.run(`d${i + 1}`, `u${i + 1}`, day, now(), o.feeling, JSON.stringify({ themes: o.themes }));
  });
  await paintWorld(`${day}:${WORLD}`);
  const world = getWorldDream(day, WORLD)!;
  await save("world.jpg", getBlob(WORLD_OWNER, worldImageKey(world.id))!.bytes, 1200);

  writeFileSync(
    join(OUT, "made.json"),
    JSON.stringify(
      {
        note: "Made by scripts/landing-art.ts with the real Dreamscape pipeline on the 0G router.",
        dream: { words: DREAM, title: dream.title, feeling: dream.feeling, tags: JSON.parse(dream.tags_json ?? "{}"), traces: tracesFor(dreamId) },
        comic: { script: JSON.parse(episode.script_json ?? "{}"), feeling: episode.feeling, traces: tracesFor(ep.id) },
        world: { counts: JSON.parse(world.counts_json), traces: tracesFor(world.id) },
      },
      null,
      2,
    ),
  );
  console.log(`wrote ${OUT}/made.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
