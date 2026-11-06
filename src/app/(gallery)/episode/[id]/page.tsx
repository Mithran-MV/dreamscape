"use client";
// One comic episode: the lettered page, the morning choice for a draft, and how it was made.
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { api, panelUrl, type EpisodeDetail } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { ComicPage } from "@/components/comic";
import { BackLink, dayLabel } from "@/components/ui";
import { SellPanel } from "@/components/sell-panel";
import { ProofFold, proofLine } from "@/components/proof-fold";
import { plainError } from "@/components/messages";

const STEPS: Record<string, string> = {
  writing: "Writing the script from your dream",
  drawing: "Drawing the four panels",
  draft: "Ready for you. Only you can see it until you hang it.",
  published: "Hanging on your wall",
  discarded: "You let this one go",
};

export default function EpisodePage() {
  return (
    <AppShell active="gallery">
      <Suspense fallback={null}>
        <EpisodeView />
      </Suspense>
    </AppShell>
  );
}

function EpisodeView() {
  const { id } = useParams<{ id: string }>();
  const [ep, setEp] = useState<EpisodeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<"publish" | "discard" | null>(null);

  const load = useCallback(() => api.episode(id).then(setEp, (e) => setError(e.message)), [id]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!ep || ep.status === "draft" || ep.status === "published" || ep.status === "discarded") return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [ep, load]);

  if (error && !ep) {
    return (
      <div className="panel mx-auto mt-6 max-w-lg p-8 text-center">
        <h1 className="font-display text-h2">We couldn&rsquo;t open this comic</h1>
        <p className="mt-3 text-mist">{plainError(error)}</p>
        <Link href="/" className="btn btn-gold mt-6">
          Back to your wall
        </Link>
      </div>
    );
  }
  if (!ep) {
    return (
      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" aria-hidden>
        <div className="painting aspect-square rounded-[3px]" />
        <div className="painting h-64 rounded-[1.25rem]" />
      </div>
    );
  }

  const ready = ep.script && (ep.status === "draft" || ep.status === "published");
  const working = ep.status === "writing" || ep.status === "drawing";
  const decide = (action: "publish" | "discard") => {
    setDeciding(action);
    api
      .decide(ep.id, action)
      .then(load, (e) => setError(e.message))
      .finally(() => setDeciding(null));
  };

  return (
    <>
      <BackLink href={ep.status === "draft" ? "/drafts" : "/"}>{ep.status === "draft" ? "Drafts" : "Your wall"}</BackLink>
      <div className="mt-6 grid gap-12 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-14">
        <div className="min-w-0">
          {ready ? (
            <ComicPage script={ep.script!} feeling={ep.feeling} saga={ep.saga} panelSrc={(n) => panelUrl(ep.id, n)} />
          ) : (
            <div className="painting grid aspect-square place-items-center rounded-[3px]">
              <p className="font-display text-title italic text-mist">{ep.status === "discarded" ? "Let go" : `${STEPS[ep.status] ?? "Waiting"}…`}</p>
            </div>
          )}
        </div>

        <section className="min-w-0 lg:sticky lg:top-28 lg:self-start">
          <p className="text-ui font-semibold text-gold">{dayLabel(ep.day)}</p>
          <h1 className="mt-2 font-display text-h1">{ep.title ?? ep.script?.title ?? "Tonight’s comic"}</h1>
          <p className="mt-4 flex items-center gap-2 text-mist">
            {working && <span className="breathe h-2 w-2 shrink-0 rounded-full bg-gold" aria-hidden />}
            {STEPS[ep.status] ?? ep.status}
          </p>
          {ep.error && working && <p className="mt-1 text-ui text-dim">Trying again. {plainError(ep.error)}</p>}

          {ep.status === "draft" && (
            <div className="panel mt-6 p-5">
              <div className="flex flex-wrap gap-3">
                <button onClick={() => decide("publish")} disabled={deciding !== null} className="btn btn-gold btn-lg">
                  {deciding === "publish" ? "Hanging it…" : "Hang it in my gallery"}
                </button>
                <button onClick={() => decide("discard")} disabled={deciding !== null} className="btn btn-line btn-lg">
                  {deciding === "discard" ? "Letting it go…" : "Let it go"}
                </button>
              </div>
              <p className="mt-3 text-ui text-dim">Hanging it adds it to your wall. Nothing gets shared or sold unless you choose to.</p>
            </div>
          )}
          {error && <p className="mt-3 text-ui text-danger">{plainError(error)}</p>}

          {ep.status === "published" && <SellPanel kind="episode" refId={ep.id} suggested={3} />}

          {ep.traces.length > 0 && (
            <ProofFold summary={proofLine(["written sealed on 0G", "drawn with no words", "lettered by Dreamscape"])}>
              <p className="text-ui text-mist">
                The script was written inside a sealed enclave. The panels were drawn from scene descriptions only, with no words in them, and the app lettered the page.
              </p>
              <ul className="mt-4 divide-y divide-edge">
                {ep.traces.map((t, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-ui">
                    <span className="w-24 font-semibold capitalize text-paper">{t.step}</span>
                    <span className="font-mono text-meta text-mist">
                      {t.model}
                      {t.stand_in && <span className="font-sans text-dim">, standing in for {t.stand_in}</span>}
                    </span>
                    <span className="font-mono text-meta text-dim">request {t.request_id ?? "n/a"}</span>
                    {t.cost_usd != null && <span className="text-meta text-dim">${t.cost_usd.toFixed(4)}</span>}
                  </li>
                ))}
              </ul>
            </ProofFold>
          )}
        </section>
      </div>
    </>
  );
}
