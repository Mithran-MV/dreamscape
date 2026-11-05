"use client";
// Visiting someone's gallery: knock, wait to be let in, then look around until the countdown ends.
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { visitPanelUrl, visitPortraitUrl, visitsApi, type VisitView, type VisitorDream } from "@/lib/api-visits";
import { ComicPage } from "@/components/comic";
import { dayLabel, Frame } from "@/components/ui";

type Inside = Extract<VisitView, { state: "inside" }>;

// useParams() is request data, so Cache Components needs it inside a Suspense boundary.
export default function VisitPage() {
  return (
    <Suspense fallback={<main className="flex-1" />}>
      <Visit />
    </Suspense>
  );
}

function Visit() {
  const { handle } = useParams<{ handle: string }>();
  const [view, setView] = useState<VisitView | null>(null);
  const [error, setError] = useState<{ message: string; signIn: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      visitsApi.visit(handle).then(
        (v) => {
          setView(v);
          setError(null);
        },
        (e: Error) => setError({ message: e.message, signIn: e.message === "Sign in first." }),
      ),
    [handle],
  );

  useEffect(() => {
    load();
  }, [load]);

  // At the door, look often. Inside, look now and then, so a revoked pass closes the door.
  useEffect(() => {
    if (!view || !["granting", "waiting", "inside"].includes(view.state)) return;
    const t = setInterval(load, view.state === "inside" ? 20_000 : 6_000);
    return () => clearInterval(t);
  }, [view, load]);

  const knock = () => {
    setBusy(true);
    visitsApi
      .knock(handle)
      .then(load, (e: Error) => setError({ message: e.message, signIn: false }))
      .finally(() => setBusy(false));
  };

  if (error?.signIn) {
    return (
      <Door title={`${handle}'s gallery is private`}>
        <p className="mt-2 text-mist">Sign in to visit with the pass they gave you.</p>
        <Link href="/" className="mt-5 inline-block rounded-full bg-gold px-5 py-2.5 font-medium text-gold-ink">Sign in</Link>
      </Door>
    );
  }
  if (!view) {
    return error ? (
      <Door title="Couldn't reach the gallery">
        <p className="mt-2 text-mist">{error.message}</p>
        <button onClick={load} className="mt-5 rounded-full border border-line px-5 py-2.5 text-mist hover:border-gold">Try again</button>
      </Door>
    ) : (
      <main className="flex-1" />
    );
  }

  return (
    <>
      {view.state === "inside" ? (
        <InsideView view={view} onEnd={load} />
      ) : view.state === "own" ? (
        <Door title="This is your own gallery">
          <Link href="/" className="mt-5 inline-block text-gold">Go to it</Link>
        </Door>
      ) : view.state === "no-pass" ? (
        <Door title={`${handle}'s gallery is private`}>
          <p className="mt-2 text-mist">You need a pass from {handle} to visit. They can grant you one from their gallery.</p>
        </Door>
      ) : view.state === "granting" ? (
        <Door title="Your pass is on its way">
          <p className="mt-2 text-mist">{handle} granted you a pass. It&rsquo;s being written to ENS, which takes a minute or two.</p>
        </Door>
      ) : view.state === "waiting" ? (
        <Door title="You knocked">
          <p className="mt-2 flex items-center gap-2 text-mist">
            <span className="breathe h-2.5 w-2.5 rounded-full bg-gold" aria-hidden />
            Waiting for {handle} to let you in. This page opens by itself.
          </p>
        </Door>
      ) : (
        <Door title={view.state === "ended" ? "The visit has ended" : `You hold a pass to ${handle}'s gallery`}>
          <p className="mt-2 text-mist">
            {view.state === "ended" ? "You can knock again whenever you like." : "Knock, and they choose whether to let you in, and for how long."}
          </p>
          <button onClick={knock} disabled={busy} className="mt-5 rounded-full bg-gold px-6 py-2.5 font-medium text-gold-ink disabled:opacity-60">
            {busy ? "Knocking…" : view.state === "ended" ? "Knock again" : "Visit"}
          </button>
        </Door>
      )}
      {error && <p className="mx-auto max-w-md px-5 text-center text-sm text-danger">{error.message}</p>}
    </>
  );
}

function Door({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 pb-16 pt-6">
      <Link href="/" className="text-sm text-dim">← Your gallery</Link>
      <section className="mt-10 rounded-2xl border border-edge bg-card/70 p-8 text-center">
        <h1 className="font-display text-2xl">{title}</h1>
        {children}
      </section>
    </main>
  );
}

const clockTime = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function left(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function InsideView({ view, onEnd }: { view: Inside; onEnd: () => void }) {
  const [clock, setClock] = useState(view.fetchedAt);
  const [open, setOpen] = useState<VisitorDream | null>(null);
  const remaining = Math.max(0, view.endsAt - clock);

  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Once the countdown runs out, ask the server, which will say the visit has ended.
  useEffect(() => {
    if (remaining > 0) return;
    const t = setTimeout(onEnd, 1000);
    return () => clearTimeout(t);
  }, [remaining, onEnd]);

  if (remaining === 0) {
    return (
      <Door title="The visit has ended">
        <p className="mt-2 text-mist">Closing the door…</p>
      </Door>
    );
  }

  const nothing = view.dreams.length === 0 && view.comics.length === 0;
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-16 pt-6">
      <Link href="/" className="text-sm text-dim">← Your gallery</Link>
      <div className="sticky top-0 z-10 -mx-5 mt-4 flex items-center justify-between gap-4 border-b border-edge bg-ground/90 px-5 py-3 backdrop-blur">
        <p className="text-sm text-mist">
          Visiting until {clockTime(view.endsAt)}
          <span className="text-dim"> · {view.scope === "gallery" ? "the whole gallery" : "hung comics only"}</span>
        </p>
        <p className="font-mono text-lg text-gold" aria-live="off" aria-label={`${Math.ceil(remaining / 60000)} minutes left`}>{left(remaining)}</p>
      </div>

      <header className="mb-8 mt-8">
        <p className="font-display text-lg italic text-gold">A visit</p>
        <h1 className="font-display text-3xl">{view.handle}&rsquo;s gallery</h1>
        <p className="mt-1 text-sm text-dim">You can look, but not touch.</p>
      </header>

      {nothing && (
        <section className="rounded-2xl border border-edge bg-card/70 p-8 text-center">
          <p className="font-display text-2xl italic">Nothing hung yet.</p>
          <p className="mx-auto mt-2 max-w-md text-mist">{view.scope === "published" ? "Your pass shows hung comics, and there aren't any yet." : "The wall is empty, for now."}</p>
        </section>
      )}

      {open && (
        <section className="mb-10 grid gap-6 rounded-2xl border border-edge bg-card/70 p-5 md:grid-cols-[1fr_1.1fr]">
          <Frame src={visitPortraitUrl(view.handle, open.id)} glow={open.feeling} alt={open.title ?? "A dream"} />
          <div>
            <p className="text-sm text-gold">{dayLabel(open.day)}</p>
            <h2 className="mt-1 font-display text-2xl">{open.title ?? "A dream"}</h2>
            {open.saga && <p className="mt-1 text-sm text-dim">From the saga {open.saga}</p>}
            {open.words && <p className="mt-4 whitespace-pre-line font-display text-lg italic leading-relaxed text-paper">{open.words}</p>}
            <button onClick={() => setOpen(null)} className="mt-5 rounded-full border border-line px-4 py-2 text-sm text-mist hover:border-gold">Close</button>
          </div>
        </section>
      )}

      {view.dreams.length > 0 && (
        <section className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {view.dreams.map((d) => (
            <button key={d.id} onClick={() => setOpen(d)} className="group block text-left">
              <Frame src={visitPortraitUrl(view.handle, d.id)} glow={d.feeling} alt={d.title ?? "A dream"} className="transition-transform group-hover:-translate-y-0.5" />
              <p className="mt-2 text-xs text-gold">{dayLabel(d.day)}</p>
              <p className="truncate font-display text-base">{d.title ?? "A dream"}</p>
            </button>
          ))}
        </section>
      )}

      {view.comics.length > 0 && (
        <section className="mt-14">
          <h2 className="font-display text-2xl">Comics</h2>
          <div className="mt-5 grid gap-10 lg:grid-cols-2">
            {view.comics.map((c) => (
              <div key={c.id}>
                <p className="mb-2 text-xs text-gold">{dayLabel(c.day)}</p>
                <ComicPage script={c.script} feeling={c.feeling} saga={c.saga} panelSrc={(n) => visitPanelUrl(view.handle, c.id, n)} />
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
