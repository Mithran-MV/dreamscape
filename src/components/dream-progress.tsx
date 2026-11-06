"use client";
// What happens to a dream after you tell it, step by step, read from what the dream's page already returns:
// its status, transcript, title, the 0G traces, storage, the chain record and its ENS name.
import { PAINTED, type DreamDetail, type DreamSummary } from "@/lib/api";
import { plainError } from "@/components/messages";

export type StepState = "done" | "running" | "waiting" | "skipped" | "failed";
export type Step = { key: string; label: string; state: StepState; note?: string };

const RUNNING_NOTE: Record<string, string> = {
  heard: "Listening to your voice note",
  read: "Finding its title, themes and feeling",
  painted: "Painting the portrait",
  stored: "Sealing a copy and storing it encrypted",
  chain: "Writing its record on 0G Chain",
  ens: "Giving the day its own name",
};

// expectEns: the dreamer's gallery has an ENS name, so each day's dream gets one under it.
export function dreamSteps(d: DreamDetail, expectEns: boolean): Step[] {
  const done = d.status === "done";
  const base: { key: string; label: string; done: boolean; skip?: string }[] = [
    { key: "heard", label: d.inputKind === "voice" ? "Heard" : "Written", done: d.inputKind === "text" || Boolean(d.transcript) },
    { key: "read", label: "Read", done: Boolean(d.title || d.tags) },
    { key: "painted", label: "Painted", done: PAINTED.has(d.status) },
    { key: "stored", label: "Sealed and stored", done: done || d.proof.storage.some((s) => s.what === "record") },
    // The chain record is written before a dream is marked done, so a done dream without one won't get one.
    { key: "chain", label: "Recorded on 0G Chain", done: Boolean(d.proof.registry), skip: done ? "Not recorded for this dream" : undefined },
    { key: "ens", label: "Named on ENS", done: Boolean(d.proof.ens), skip: done && !expectEns ? "Your gallery needs its ENS name first" : undefined },
  ];

  // The first unfinished step is the one running, or the one that stopped. Everything after it waits.
  let reached = false;
  return base.map(({ key, label, done: finished, skip }): Step => {
    if (finished) return { key, label, state: "done" };
    if (skip) return { key, label, state: "skipped", note: skip };
    if (reached) return { key, label, state: "waiting" };
    reached = true;
    if (d.status === "failed") return { key, label, state: "failed", note: plainError(d.error) ?? "This step didn’t finish." };
    if (d.error) return { key, label, state: "running", note: `Trying again. ${plainError(d.error)}` };
    return { key, label, state: "running", note: d.status === "queued" ? "Waiting its turn" : RUNNING_NOTE[key] };
  });
}

// Nothing left to wait for: every step finished or won't happen.
export const settled = (steps: Step[]) => steps.every((s) => s.state === "done" || s.state === "skipped");

function Mark({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span className="grid h-6 w-6 place-items-center rounded-full bg-gold text-gold-ink" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      </span>
    );
  }
  if (state === "running") {
    return (
      <span className="relative grid h-6 w-6 place-items-center" aria-hidden>
        <span className="absolute inset-0 rounded-full border-2 border-gold/25" />
        <span className="spin absolute inset-0 rounded-full border-2 border-transparent border-t-gold" />
        <span className="h-2 w-2 rounded-full bg-gold" />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-danger text-danger" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
          <path d="M7 7l10 10M17 7 7 17" />
        </svg>
      </span>
    );
  }
  if (state === "skipped") {
    return (
      <span className="grid h-6 w-6 place-items-center" aria-hidden>
        <span className="h-0.5 w-3 rounded-full bg-line" />
      </span>
    );
  }
  return <span className="h-6 w-6 rounded-full border-2 border-dashed border-line" aria-hidden />;
}

const STATE_WORD: Record<StepState, string> = { done: "done", running: "in progress", waiting: "waiting", skipped: "skipped", failed: "stopped" };

export function DreamProgress({ steps }: { steps: Step[] }) {
  const finished = steps.filter((s) => s.state === "done").length;
  const now = steps.find((s) => s.state === "running" || s.state === "failed");
  return (
    <div className="panel mt-6 p-5">
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-display text-title font-semibold">{now?.state === "failed" ? "It stopped partway" : "On its way to your wall"}</p>
        <p className="shrink-0 text-meta tabular-nums text-dim">
          {finished} of {steps.length}
        </p>
      </div>
      <p className="sr-only" aria-live="polite">
        {now ? `${now.label}: ${STATE_WORD[now.state]}. ${now.note ?? ""}` : ""}
      </p>
      <ol className="mt-4 space-y-3">
        {steps.map((s) => (
          <li key={s.key} className="flex gap-3">
            <Mark state={s.state} />
            <div className="min-w-0 pt-px">
              <p className={`text-ui font-semibold ${s.state === "waiting" || s.state === "skipped" ? "text-dim" : s.state === "failed" ? "text-danger" : "text-paper"}`}>
                {s.label}
                <span className="sr-only">, {STATE_WORD[s.state]}</span>
              </p>
              {s.note && s.state !== "done" && <p className={`text-meta ${s.state === "failed" ? "text-paper" : "text-dim"}`}>{s.note}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// The wall only has the dream's summary, so its badge counts the steps the summary can see.
const SUMMARY: Record<string, { done: number; label: string }> = {
  queued: { done: 0, label: "Waiting its turn" },
  transcribing: { done: 0, label: "Listening" },
  tagging: { done: 1, label: "Reading it" },
  painting: { done: 2, label: "Painting" },
  painted: { done: 3, label: "Sealing" },
  storing: { done: 3, label: "Sealing" },
};

export function ProgressBadge({ dream }: { dream: DreamSummary }) {
  const at = SUMMARY[dream.status];
  if (!at) return null;
  const done = at.done + (dream.stored ? 1 : 0);
  return (
    <span className="absolute inset-x-2 bottom-2 flex items-center gap-2 rounded-full bg-ground/85 px-3 py-1.5 text-meta font-semibold text-paper backdrop-blur-sm">
      <span className="flex gap-[3px]" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={`h-1.5 w-2.5 rounded-full ${i < done ? "bg-gold" : i === done ? "breathe bg-gold/60" : "bg-line"}`} />
        ))}
      </span>
      <span className="truncate">{at.label}</span>
      <span className="sr-only">, step {done + 1} of 6</span>
    </span>
  );
}
