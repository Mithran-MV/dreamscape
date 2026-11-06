"use client";
// The day view: the painting and what was made from it, your words and voice, where it is on its way
// to the wall, and how it was made.
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { api, PAINTED, panelUrl, portraitUrl, videoUrl, voiceUrl, type DreamDetail, type EpisodeDetail } from "@/lib/api";
import { AppShell, useSessionUser } from "@/components/app-shell";
import { BackLink, chipColor, dayLabel, ExternalLink, feelingColor, feelingLabel, Frame } from "@/components/ui";
import { DreamProgress, dreamSteps, settled } from "@/components/dream-progress";
import { ProofFold, proofLine } from "@/components/proof-fold";
import { NotifyButton } from "@/components/notify-button";
import { VoicePlayer } from "@/components/voice-player";
import { SellPanel } from "@/components/sell-panel";
import { plainError } from "@/components/messages";

const SEALED_STEPS = new Set(["transcribe", "tag", "portrait"]);

// useParams() is request data, so Cache Components needs it inside a Suspense boundary.
export default function DreamPage() {
  return (
    <AppShell active="gallery">
      <Suspense fallback={null}>
        <DreamView />
      </Suspense>
    </AppShell>
  );
}

function DreamView() {
  const { id } = useParams<{ id: string }>();
  const user = useSessionUser();
  const [dream, setDream] = useState<DreamDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(() => api.dream(id).then(setDream, (e) => setError(e.message)), [id]);
  useEffect(() => {
    load();
  }, [load]);

  // Days get their own ENS name only once the gallery has one.
  const expectEns = Boolean(user?.ensName || user?.naming);
  const steps = dream ? dreamSteps(dream, expectEns) : [];
  const naming = Boolean(dream && dream.status === "done" && dream.proof.registry && !settled(steps));
  useEffect(() => {
    if (!dream || dream.status === "failed") return;
    const painting = !(dream.status === "done" && dream.proof.registry);
    // While it paints, look often. Once it's on the chain, look now and then until the day's ENS name lands.
    if (!painting && !naming) return;
    const t = setInterval(load, painting ? 2500 : 6000);
    return () => clearInterval(t);
  }, [dream, naming, load]);

  if (error && !dream) {
    return (
      <div className="panel mx-auto mt-6 max-w-lg p-8 text-center">
        <h1 className="font-display text-h2">We couldn&rsquo;t open this dream</h1>
        <p className="mt-3 text-mist">{plainError(error)}</p>
        <Link href="/" className="btn btn-gold mt-6">
          Back to your wall
        </Link>
      </div>
    );
  }
  if (!dream) return <DaySkeleton />;

  const feeling = dream.feeling ?? dream.suggestedFeeling;
  const label = feelingLabel(feeling);
  const painted = PAINTED.has(dream.status);
  // A finished dream shows no checklist; wait for the session before deciding the ENS step won't come.
  const showSteps = dream.status === "failed" || !settled(steps) ? user !== undefined || dream.status !== "done" : false;
  const title = dream.title ?? (dream.status === "failed" ? "This dream didn’t paint" : painted ? "Untitled dream" : "Painting your dream");

  const retry = () => {
    setRetrying(true);
    api
      .retry(dream.id)
      .then(load, (e) => setError(e.message))
      .finally(() => setRetrying(false));
  };

  return (
    <>
      <BackLink href="/">Your wall</BackLink>
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Frame src={painted ? portraitUrl(dream.id) : null} failed={dream.status === "failed"} glow={feeling} alt={dream.title ?? "Your dream"} />
          <MadeFrom dream={dream} />
        </div>

        <section className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-ui font-semibold text-gold">{dayLabel(dream.day)}</p>
            {label && (
              <span className="inline-flex items-center gap-2 rounded-full border px-3 py-0.5 text-ui font-semibold" style={{ ...chipColor(feelingColor(feeling)), borderColor: "var(--c)" }}>
                <span className="chip-dot" aria-hidden />
                {label}
                {!dream.feeling && <span className="font-normal text-dim">(our guess)</span>}
              </span>
            )}
          </div>
          <h1 className="mt-3 font-display text-h1 lg:text-display">{title}</h1>

          {showSteps && <DreamProgress steps={steps} />}
          {dream.status === "failed" && (
            <button onClick={retry} disabled={retrying} className="btn btn-gold mt-4">
              {retrying ? "Starting again…" : "Try again"}
            </button>
          )}
          {!painted && dream.status !== "failed" && <NotifyButton />}
          {error && <p className="mt-3 text-ui text-danger">{plainError(error)}</p>}

          {dream.transcript && (
            <blockquote className="mt-8 font-display text-title font-medium italic leading-relaxed text-paper md:text-[1.625rem] md:leading-[1.5]">
              <span className="sr-only">{dream.inputKind === "voice" ? "What you said: " : "What you wrote: "}</span>&ldquo;{dream.transcript}&rdquo;
            </blockquote>
          )}
          {dream.inputKind === "voice" && <VoicePlayer src={voiceUrl(dream.id)} seed={dream.id} />}
          {dream.note && (
            <div className="mt-6">
              <p className="text-meta font-semibold text-dim">You also wrote</p>
              <p className="mt-1 whitespace-pre-line text-mist">{dream.note}</p>
            </div>
          )}

          {((dream.tags && dream.tags.themes.length > 0) || dream.saga) && (
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Themes and saga">
              {dream.saga && (
                <li className="inline-flex items-center gap-1.5 rounded-full border border-gold/60 bg-gold/10 px-3 py-1 text-meta font-semibold text-paper">
                  <span className="text-dim">Saga</span> <span className="font-display italic">{dream.saga}</span>
                </li>
              )}
              {dream.tags?.themes.map((t) => (
                <li key={t} className="rounded-full border border-line px-3 py-1 text-meta font-semibold text-mist">
                  {t}
                </li>
              ))}
            </ul>
          )}

          {dream.notes.length > 0 && (
            <section className="panel mt-8 p-5" aria-labelledby="note-title">
              <h2 id="note-title" className="font-display text-title">
                Morning Note
              </h2>
              <div className="mt-2 space-y-1.5">
                {dream.notes.map((n) => (
                  <p key={n.kind} className="font-display text-lead font-medium italic text-paper">
                    {n.text}
                  </p>
                ))}
              </div>
            </section>
          )}

          {painted && <SellPanel kind="dream" refId={dream.id} suggested={2} />}
          <Proof dream={dream} />
        </section>
      </div>
    </>
  );
}

// What else came of this dream: its moving portrait and the comic it went into, when they exist.
function MadeFrom({ dream }: { dream: DreamDetail }) {
  const [comic, setComic] = useState<EpisodeDetail | null>(null);
  useEffect(() => {
    let live = true;
    // A comic is drawn from the night's newest dream, so only that night's episodes can hold this one.
    api
      .episodes()
      .then((r) => r.episodes.filter((e) => Math.abs(e.day - dream.day) <= 1 && (e.status === "published" || e.status === "draft")))
      .then((near) => Promise.all(near.map((e) => api.episode(e.id).catch(() => null))))
      .then((details) => live && setComic(details.find((d) => d?.dreamIds.includes(dream.id)) ?? null), () => undefined);
    return () => {
      live = false;
    };
  }, [dream.id, dream.day]);

  const moving = dream.video === "done";
  if (!moving && !comic && dream.video !== "rendering") return null;
  return (
    <section className="mt-8" aria-labelledby="made-from">
      <h2 id="made-from" className="font-display text-title">
        Made from this dream
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-5">
        {moving && (
          <figure>
            <div className="frame">
              <div className="mat aspect-square w-full">
                <video src={videoUrl(dream.id)} poster={portraitUrl(dream.id)} autoPlay loop muted playsInline aria-label="The moving portrait" className="h-full w-full object-cover" />
              </div>
            </div>
            <figcaption className="mt-2 text-ui font-semibold">Moving portrait</figcaption>
          </figure>
        )}
        {dream.video === "rendering" && (
          <div>
            <div className="painting grid aspect-square place-items-center rounded-[3px] p-3 text-center">
              <span className="text-meta text-mist">Learning to move. This takes a few minutes.</span>
            </div>
            <p className="mt-2 text-ui font-semibold text-mist">Moving portrait</p>
          </div>
        )}
        {comic && (
          <Link href={`/episode/${comic.id}`} className="lift">
            <div className="paper-card">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, decrypted per request */}
              <img src={panelUrl(comic.id, 0)} alt="" className="aspect-square w-full border-2 border-[#1d1a17] object-cover" />
            </div>
            <p className="lift-title mt-2 truncate text-ui font-semibold">{comic.title ?? comic.script?.title ?? "The comic"}</p>
            <p className="text-meta text-dim">{comic.status === "draft" ? "Waiting for you in Drafts" : "Hanging on your wall"}</p>
          </Link>
        )}
      </div>
    </section>
  );
}

function DaySkeleton() {
  return (
    <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16" aria-hidden>
      <div className="painting aspect-square rounded-[3px]" />
      <div className="space-y-4">
        <div className="painting h-5 w-28 rounded" />
        <div className="painting h-14 w-4/5 rounded" />
        <div className="painting h-40 w-full rounded-[1.25rem]" />
      </div>
    </div>
  );
}

function Proof({ dream }: { dream: DreamDetail }) {
  const { traces, storage, registry, ens } = dream.proof;
  if (!traces.length && !storage.length) return null;
  const sealed = traces.some((t) => SEALED_STEPS.has(t.step) && (t.tee_verified === 1 || t.e2ee === "sealed"));
  const verified = traces.some((t) => SEALED_STEPS.has(t.step) && t.tee_verified === 1);
  const summary = proofLine([
    verified ? "sealed and verified on 0G" : sealed ? "sealed by 0G" : traces.length > 0 && "made on 0G",
    storage.length > 0 && "stored encrypted",
    registry && "recorded on-chain",
    ens && "named on ENS",
  ]);
  return (
    <ProofFold summary={summary}>
      <p className="text-ui text-mist">Every step ran on 0G. Sealed steps ran inside an enclave that keeps nothing.</p>
      <ul className="mt-4 divide-y divide-edge">
        {traces.map((t, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-ui">
            <span className="w-24 font-semibold capitalize text-paper">{t.step}</span>
            <span className="font-mono text-meta text-mist">
              {t.model}
              {t.stand_in && <span className="font-sans text-dim">, standing in for {t.stand_in}</span>}
            </span>
            {/* Sealed only when 0G said so for this step: a backup painter runs on standard trust. */}
            {(t.tee_verified === 1 || t.e2ee === "sealed") && (
              <span className="rounded-md border border-ok/50 px-2 py-px text-meta font-semibold text-ok" title={t.res_key ? `Receipt key ${t.res_key}` : undefined}>
                {t.tee_verified === 1 ? "Sealed, enclave verified" : "Sealed, encrypted end to end"}
              </span>
            )}
            <span className="font-mono text-meta text-dim">request {t.request_id ?? "n/a"}</span>
            {t.cost_usd != null && <span className="text-meta text-dim">${t.cost_usd.toFixed(4)}</span>}
          </li>
        ))}
      </ul>
      {storage.length > 0 && (
        <div className="mt-4 border-t border-edge pt-4">
          <p className="text-ui font-semibold text-paper">Encrypted on 0G Storage</p>
          <ul className="mt-1.5 space-y-1">
            {storage.map((s) => (
              <li key={s.what} className="flex min-w-0 items-baseline gap-2">
                <span className="w-16 shrink-0 text-meta capitalize text-dim">{s.what}</span>
                <ExternalLink href={s.link} className="min-w-0 font-mono text-meta">
                  {s.root}
                </ExternalLink>
              </li>
            ))}
          </ul>
        </div>
      )}
      {registry && (
        <p className="mt-4 border-t border-edge pt-4 text-ui">
          <ExternalLink href={registry.link}>Record #{registry.id} on 0G Chain</ExternalLink>
        </p>
      )}
      {ens && (
        <div className="mt-4 border-t border-edge pt-4 text-ui">
          <p className="text-mist">
            On ENS as <span className="font-mono text-meta text-paper">{ens.name}</span>, a name with no registry entry: your gallery&rsquo;s resolver answers for it. A scribe
            that may set only these four records wrote them.
          </p>
          {ens.records && (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-meta">
              {Object.entries(ens.records).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-dim">dreamscape.{k}</dt>
                  <dd className="truncate text-paper">{v ?? "none"}</dd>
                </div>
              ))}
            </dl>
          )}
          {!ens.current && <p className="mt-2 text-meta text-dim">A later dream that day took the day&rsquo;s name over.</p>}
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
            <ExternalLink href={ens.galleryLink}>{ens.gallery} on ENS</ExternalLink>
            <ExternalLink href={ens.txLink}>The scribe&rsquo;s transaction</ExternalLink>
          </p>
        </div>
      )}
    </ProofFold>
  );
}
