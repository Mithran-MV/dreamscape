"use client";
// The day view: the portrait, your words and voice, its tags, and the proof of how it was made.
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { api, PAINTED, portraitUrl, videoUrl, voiceUrl, type DreamDetail } from "@/lib/api";
import { dayLabel, FEELINGS, feelingColor, Frame } from "@/components/ui";
import { NotifyButton } from "@/components/notify-button";

const STEPS: Record<string, string> = {
  queued: "Waiting for the painter",
  transcribing: "Listening to your voice",
  tagging: "Reading the dream",
  painting: "Painting it",
  painted: "Painted. Sealing a copy on 0G Storage",
  done: "Kept",
  failed: "Something went wrong",
};
const SEALED_STEPS = new Set(["transcribe", "tag", "portrait"]);

// useParams() is request data, so Cache Components needs it inside a Suspense boundary.
export default function DreamPage() {
  return (
    <Suspense fallback={<main className="flex-1" />}>
      <DreamView />
    </Suspense>
  );
}

function DreamView() {
  const { id } = useParams<{ id: string }>();
  const [dream, setDream] = useState<DreamDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api.dream(id).then(setDream, (e) => setError(e.message)), [id]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!dream || (dream.status === "done" && dream.proof.registry) || dream.status === "failed") return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [dream, load]);

  if (error) return <main className="p-8 text-center text-mist">{error} <Link href="/" className="text-gold">Back to the gallery</Link></main>;
  if (!dream) return <main className="flex-1" />;

  const feeling = dream.feeling ?? dream.suggestedFeeling;
  const feelingLabel = FEELINGS.find((f) => f.key === feeling)?.label;
  const painted = PAINTED.has(dream.status);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-16 pt-6">
      <Link href="/" className="text-sm text-dim">← Gallery</Link>

      <div className="mt-6 grid gap-8 md:grid-cols-[1.1fr_1fr]">
        <Frame src={painted ? portraitUrl(dream.id) : null} video={dream.video === "done" ? videoUrl(dream.id) : null} failed={dream.status === "failed"} glow={feeling} alt={dream.title ?? "Your dream"} />

        <section>
          <p className="text-xs uppercase tracking-[0.22em] text-gold">{dayLabel(dream.day)}</p>
          <h1 className="mt-1 font-display text-3xl leading-tight">{dream.title ?? "Untitled dream"}</h1>
          {feelingLabel && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm" style={{ borderColor: feelingColor(feeling) }}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: feelingColor(feeling) }} aria-hidden />
              {feelingLabel}
              {!dream.feeling && <span className="text-dim">(suggested)</span>}
            </p>
          )}

          <p className={`mt-4 text-sm ${dream.status === "failed" ? "text-danger" : "text-mist"}`}>
            {STEPS[dream.status] ?? dream.status}
            {dream.status === "failed" && dream.error ? `: ${dream.error.slice(0, 160)}` : ""}
          </p>
          {dream.status !== "failed" && dream.status !== "done" && dream.error && (
            <p className="mt-1 text-xs text-dim">Retrying: {dream.error.slice(0, 140)}</p>
          )}
          {!painted && dream.status !== "failed" && <NotifyButton />}
          {dream.status === "failed" && (
            <button
              onClick={() => api.retry(dream.id).then(load, (e) => setError(e.message))}
              className="mt-3 rounded-full border border-line px-3.5 py-1.5 text-xs text-mist hover:border-gold"
            >
              Try again
            </button>
          )}

          {dream.video === "rendering" && <p className="mt-2 text-xs text-dim">The portrait is learning to move. This takes a few minutes.</p>}
          {dream.saga && <p className="mt-2 text-sm text-mist">Part of <span className="font-display italic text-paper">{dream.saga}</span></p>}
          {dream.notes.map((n) => (
            <p key={n.kind} className="mt-2 font-display italic text-paper">{n.text}</p>
          ))}

          {dream.transcript && <blockquote className="mt-5 border-l-2 border-gold pl-4 font-display text-lg italic leading-relaxed">&ldquo;{dream.transcript}&rdquo;</blockquote>}
          {dream.inputKind === "voice" && <audio controls src={voiceUrl(dream.id)} className="mt-4 w-full" />}
          {dream.note && (
            <div className="mt-4">
              <p className="text-xs text-dim">You also wrote</p>
              <p className="mt-1 whitespace-pre-line text-mist">{dream.note}</p>
            </div>
          )}

          {dream.tags && dream.tags.themes.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {dream.tags.themes.map((t) => (
                <span key={t} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-mist">{t}</span>
              ))}
            </div>
          )}
        </section>
      </div>

      <Proof dream={dream} />
    </main>
  );
}

function Proof({ dream }: { dream: DreamDetail }) {
  const { traces, storage, registry, ens } = dream.proof;
  if (!traces.length && !storage.length) return null;
  return (
    <section className="mt-12 rounded-2xl border border-edge bg-card/70 p-5">
      <h2 className="font-display text-xl">How it was made</h2>
      <p className="mt-1 text-sm text-dim">Every step ran on 0G. Sealed steps ran inside an enclave that keeps nothing.</p>
      <ul className="mt-4 space-y-3">
        {traces.map((t, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span className="w-20 text-mist capitalize">{t.step}</span>
            <span className="font-mono text-xs text-paper">{t.model}</span>
            {SEALED_STEPS.has(t.step) && (
              <span className="rounded border border-ok/50 px-1.5 text-[11px] text-ok">{t.tee_verified === 1 ? "Sealed · Verified" : "Sealed"}</span>
            )}
            <span className="font-mono text-[11px] text-dim">request {t.request_id ?? "n/a"}</span>
            {t.cost_usd != null && <span className="text-[11px] text-dim">${t.cost_usd.toFixed(4)}</span>}
          </li>
        ))}
      </ul>
      {storage.length > 0 && (
        <div className="mt-5 border-t border-edge pt-4 text-sm">
          <p className="text-mist">Encrypted on 0G Storage</p>
          {storage.map((s) => (
            <a key={s.what} href={s.link} target="_blank" rel="noreferrer" className="mt-1 block truncate font-mono text-xs text-gold">
              {s.what}: {s.root}
            </a>
          ))}
        </div>
      )}
      {registry && (
        <a href={registry.link} target="_blank" rel="noreferrer" className="mt-4 block text-sm text-gold">
          Anchored on 0G Chain as record #{registry.id} ↗
        </a>
      )}
      {ens && (
        <p className="mt-2 text-sm text-mist">
          Named on ENS as{" "}
          <a href={ens.link} target="_blank" rel="noreferrer" className="font-mono text-xs text-gold">{ens.name}</a>
          , written by a scribe that may set only the day&rsquo;s four records.{" "}
          <a href={ens.txLink} target="_blank" rel="noreferrer" className="text-gold">Transaction ↗</a>
        </p>
      )}
    </section>
  );
}
