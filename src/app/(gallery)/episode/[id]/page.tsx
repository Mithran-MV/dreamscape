"use client";
// One comic episode: the lettered page, the morning choice for a draft, and how it was made.
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { api, panelUrl, type EpisodeDetail } from "@/lib/api";
import { ComicPage } from "@/components/comic";
import { dayLabel } from "@/components/ui";
import { SellPanel } from "@/components/sell-panel";

const STEPS: Record<string, string> = {
  writing: "Writing tonight's script",
  drawing: "Drawing the panels",
  draft: "A draft, waiting for you",
  published: "In your gallery",
};

export default function EpisodePage() {
  return (
    <Suspense fallback={<main className="flex-1" />}>
      <EpisodeView />
    </Suspense>
  );
}

function EpisodeView() {
  const { id } = useParams<{ id: string }>();
  const [ep, setEp] = useState<EpisodeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api.episode(id).then(setEp, (e) => setError(e.message)), [id]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!ep || ep.status === "draft" || ep.status === "published" || ep.status === "discarded") return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [ep, load]);

  if (error) return <main className="p-8 text-center text-mist">{error} <Link href="/" className="text-gold">Back to the gallery</Link></main>;
  if (!ep) return <main className="flex-1" />;

  const ready = ep.script && (ep.status === "draft" || ep.status === "published");
  const decide = (action: "publish" | "discard") => api.decide(ep.id, action).then(load, (e) => setError(e.message));

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-6">
      <Link href="/" className="text-sm text-dim">← Gallery</Link>
      <p className="mt-5 text-sm text-gold">{dayLabel(ep.day)}</p>
      <p className="mt-1 text-sm text-mist">
        {ep.status === "discarded" ? "Let go" : (STEPS[ep.status] ?? ep.status)}
        {ep.error && ep.status !== "draft" && ep.status !== "published" ? `. Retrying: ${ep.error.slice(0, 140)}` : ""}
      </p>

      <div className="mt-5">
        {ready ? (
          <ComicPage script={ep.script!} feeling={ep.feeling} saga={ep.saga} panelSrc={(n) => panelUrl(ep.id, n)} />
        ) : (
          <div className="painting grid aspect-square place-items-center rounded-[3px] bg-card">
            <p className="font-display italic text-mist">{STEPS[ep.status] ?? "Waiting"}…</p>
          </div>
        )}
      </div>

      {ep.status === "draft" && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button onClick={() => decide("publish")} className="rounded-full bg-gold px-5 py-2.5 font-medium text-gold-ink">
            Hang it in my gallery
          </button>
          <button onClick={() => decide("discard")} className="rounded-full border border-line px-5 py-2.5 text-mist">
            Let it go
          </button>
          <p className="w-full text-xs text-dim">Only you can see a draft. Hanging it adds it to your gallery; nothing is shared or sold.</p>
        </div>
      )}

      {ep.status === "published" && <SellPanel kind="episode" refId={ep.id} suggested={3} />}

      {ep.traces.length > 0 && (
        <section className="mt-10 rounded-2xl border border-edge bg-card/70 p-5">
          <h2 className="font-display text-xl">How it was made</h2>
          <p className="mt-1 text-sm text-dim">
            The script was written inside a sealed enclave. The panels were drawn from scene descriptions only, with no words in them; the app lettered the page.
          </p>
          <ul className="mt-4 space-y-2">
            {ep.traces.map((t, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className="w-20 capitalize text-mist">{t.step}</span>
                <span className="font-mono text-xs text-paper">{t.model}</span>
                <span className="font-mono text-[11px] text-dim">request {t.request_id ?? "n/a"}</span>
                {t.cost_usd != null && <span className="text-[11px] text-dim">${t.cost_usd.toFixed(4)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
