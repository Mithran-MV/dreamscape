"use client";
// Visiting someone's gallery: knock, wait to be let in, then look around until the countdown ends.
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { arkivEntityUrl, visitPanelUrl, visitPortraitUrl, visitsApi, type VisitView, type VisitorDream } from "@/lib/api-visits";
import { ComicPage } from "@/components/comic";
import { AppShell } from "@/components/app-shell";
import { BackLink, dayLabel, Frame } from "@/components/ui";
import { plainError } from "@/components/messages";

type Inside = Extract<VisitView, { state: "inside" }>;

// useParams() is request data, so Cache Components needs it inside a Suspense boundary.
export default function VisitPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <Visit />
      </Suspense>
    </AppShell>
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
        <p className="mt-3 text-mist">Sign in to visit with the pass they gave you.</p>
        <Link href={`/?next=${encodeURIComponent(`/g/${handle}`)}`} className="btn btn-gold btn-lg mt-6">
          Sign in
        </Link>
      </Door>
    );
  }
  if (!view) {
    return error ? (
      <Door title="We couldn’t reach the gallery">
        <p className="mt-3 text-mist">{plainError(error.message)}</p>
        <button onClick={load} className="btn btn-line mt-6">
          Try again
        </button>
      </Door>
    ) : (
      <div className="painting mx-auto mt-16 h-56 max-w-xl rounded-[1.25rem]" aria-hidden />
    );
  }

  return (
    <>
      {view.state === "inside" ? (
        <InsideView view={view} onEnd={load} />
      ) : view.state === "own" ? (
        <Door title="This is your own gallery">
          <Link href="/" className="btn btn-gold mt-6">
            Go to your wall
          </Link>
        </Door>
      ) : view.state === "no-pass" ? (
        <Door title={`${handle}'s gallery is private`}>
          <p className="mt-3 text-mist">You need a pass from {handle} to visit. They can grant you one from their Passes page.</p>
        </Door>
      ) : view.state === "granting" ? (
        <Door title="Your pass is on its way">
          <p className="mt-3 text-mist">{handle} granted you a pass. We&rsquo;re writing it to ENS, which takes a minute or two.</p>
        </Door>
      ) : view.state === "waiting" ? (
        <Door title="You knocked">
          <p className="mt-3 flex items-center justify-center gap-2 text-mist">
            <span className="breathe h-2.5 w-2.5 shrink-0 rounded-full bg-gold" aria-hidden />
            Waiting for {handle} to let you in. This page opens by itself.
          </p>
        </Door>
      ) : (
        <Door title={view.state === "ended" ? "The visit has ended" : `You hold a pass to ${handle}'s gallery`}>
          <p className="mt-3 text-mist">
            {view.state === "ended" ? "You can knock again whenever you like." : "Knock, and they choose whether to let you in, and for how long."}
          </p>
          <button onClick={knock} disabled={busy} className="btn btn-gold btn-lg mt-6">
            {busy ? "Knocking…" : view.state === "ended" ? "Knock again" : "Visit"}
          </button>
        </Door>
      )}
      {error && <p className="mx-auto mt-4 max-w-md text-center text-ui text-danger">{plainError(error.message)}</p>}
    </>
  );
}

function Door({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-xl">
      <BackLink href="/">Your wall</BackLink>
      <section className="panel mt-10 px-6 py-12 text-center md:px-10">
        <h1 className="font-display text-h2">{title}</h1>
        {children}
      </section>
    </div>
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
        <p className="mt-3 text-mist">Closing the door…</p>
      </Door>
    );
  }

  const nothing = view.dreams.length === 0 && view.comics.length === 0;
  return (
    <div>
      <BackLink href="/">Your wall</BackLink>
      <div className="sticky top-0 z-20 -mx-5 mt-4 flex items-center justify-between gap-4 border-b border-edge bg-ground/90 px-5 py-3 backdrop-blur-md md:-mx-8 md:px-8 lg:top-16">
        <p className="text-ui text-mist">
          <span className="font-semibold text-paper">Visiting until {clockTime(view.endsAt)}.</span>{" "}
          <span className="text-dim">Your pass shows {view.scope === "gallery" ? "the whole gallery" : "hung comics only"}.</span>{" "}
          <a href={arkivEntityUrl(view.visit)} target="_blank" rel="noreferrer" className="text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold">
            This visit on Arkiv &#8599;
          </a>
        </p>
        <p className="font-mono text-title text-gold" aria-live="off" aria-label={`${Math.ceil(remaining / 60000)} minutes left`}>
          {left(remaining)}
        </p>
      </div>

      <header className="mb-10 mt-10">
        <h1 className="font-display text-h1 md:text-display">{view.handle}&rsquo;s gallery</h1>
        <p className="mt-3 text-lead text-mist">You can look, but not touch.</p>
      </header>

      {nothing && (
        <section className="panel px-6 py-12 text-center">
          <p className="font-display text-h2">Nothing hung yet</p>
          <p className="mx-auto mt-3 max-w-md text-mist">{view.scope === "published" ? "Your pass shows hung comics, and there aren't any yet." : "The wall is empty, for now."}</p>
        </section>
      )}

      {open && (
        <section className="panel appear mb-12 grid gap-8 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:p-8">
          <Frame src={visitPortraitUrl(view.handle, open.id)} glow={open.feeling} alt={open.title ?? "A dream"} />
          <div>
            <p className="text-ui font-semibold text-gold">{dayLabel(open.day)}</p>
            <h2 className="mt-2 font-display text-h1">{open.title ?? "A dream"}</h2>
            {open.saga && <p className="mt-2 text-ui text-mist">From the saga {open.saga}</p>}
            {open.words && <p className="mt-5 whitespace-pre-line font-display text-title font-medium italic leading-relaxed text-paper">{open.words}</p>}
            <button onClick={() => setOpen(null)} className="btn btn-line mt-6">
              Close
            </button>
          </div>
        </section>
      )}

      {view.dreams.length > 0 && (
        <section className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-7 xl:grid-cols-5">
          {view.dreams.map((d) => (
            <button key={d.id} onClick={() => setOpen(d)} className="lift appear text-left">
              <Frame src={visitPortraitUrl(view.handle, d.id)} glow={d.feeling} alt={d.title ?? "A dream"} />
              <p className="mt-3 text-meta font-semibold text-gold">{dayLabel(d.day)}</p>
              <p className="lift-title truncate font-display text-lead font-semibold">{d.title ?? "A dream"}</p>
            </button>
          ))}
        </section>
      )}

      {view.comics.length > 0 && (
        <section className="mt-16">
          <h2 className="font-display text-h2">Comics</h2>
          <div className="mt-6 grid gap-12 lg:grid-cols-2">
            {view.comics.map((c) => (
              <div key={c.id}>
                <p className="mb-3 text-meta font-semibold text-gold">{dayLabel(c.day)}</p>
                <ComicPage script={c.script} feeling={c.feeling} saga={c.saga} panelSrc={(n) => visitPanelUrl(view.handle, c.id, n)} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
