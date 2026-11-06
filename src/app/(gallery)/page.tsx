"use client";
// Home: the landing and sign-in, then the gallery wall of framed dream portraits.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { api, PAINTED, panelUrl, type DreamSummary, type EpisodeSummary, type Note } from "@/lib/api";
import { Landing } from "@/components/landing/landing";
import { AppShell, type SessionUser } from "@/components/app-shell";
import { WeatherStrip } from "@/components/weather";
import { CalendarWall } from "@/components/calendar-wall";
import { KnockBanner } from "@/components/passes-panel";
import { MorningsAndMemories } from "@/components/memories";
import { chipColor, dayLabel, FEELINGS } from "@/components/ui";
import { useClientValue } from "@/lib/use-client-value";
import { useSignInKind } from "./providers";

export default function Home() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const router = useRouter();
  const [dreams, setDreams] = useState<DreamSummary[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [aiNote, setAiNote] = useState<AiNote | null>(null);
  const [sagaTonight, setSagaTonight] = useState<string | null>(null);

  // The nightly comic switch lives on the Settings page now, so the wall reads only what it shows.
  const load = useCallback(
    () =>
      api.session().then(async ({ user }) => {
        setUser(user);
        if (!user) return;
        const [d, e] = await Promise.all([api.dreams(), api.episodes()]);
        setDreams(d.dreams);
        setNotes(d.notes);
        setAiNote(d.aiNote);
        setSagaTonight(d.sagaTonight);
        setEpisodes(e.episodes);
      }),
    [],
  );

  // Someone who signed in from a gallery they were visiting goes back to it.
  const afterSignIn = useCallback(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next && /^\/g\/[a-z0-9-]+$/.test(next)) router.push(next);
    else load();
  }, [router, load]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the wall live while any frame is still being painted.
  useEffect(() => {
    const busy =
      dreams.some((d) => !PAINTED.has(d.status) && d.status !== "failed") || episodes.some((e) => e.status === "writing" || e.status === "drawing") || Boolean(user?.naming);
    if (!busy) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [dreams, episodes, user, load]);

  if (user === undefined) return <main className="flex-1" />;
  if (!user) return <Landing signIn={<SignIn onDone={afterSignIn} />} />;

  const drafts = episodes.filter((e) => e.status === "draft");
  const recall = notes.find((n) => n.kind === "recall");

  return (
    <AppShell active="gallery" user={user} drafts={drafts.length}>
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-h1 md:text-display">Your wall</h1>
          <RecallLine dreams={dreams} />
          {!user.ensName && user.naming && (
            <p className="mt-3 flex items-center gap-2 text-ui text-mist">
              <span className="breathe h-2 w-2 shrink-0 rounded-full bg-gold" aria-hidden />
              Writing {user.handle}.dream-scape.eth to ENS. It takes a couple of minutes.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {drafts.length > 0 && (
            <Link href="/drafts" className="btn btn-gold btn-lg">
              {drafts.length} {drafts.length === 1 ? "piece" : "pieces"} to approve
            </Link>
          )}
          {/* A first-time dreamer gets the walkthrough's own button instead. */}
          {dreams.length > 0 && (
            <Link href="/tell" className={`btn btn-lg ${drafts.length > 0 ? "btn-line" : "btn-gold"}`}>
              Tell last night&rsquo;s dream
            </Link>
          )}
        </div>
      </header>

      <KnockBanner />

      <MorningsAndMemories />

      {dreams.length === 0 ? (
        <FirstRun user={user} />
      ) : (
        <Wall dreams={dreams} notes={notes.filter((n) => n !== recall)} aiNote={aiNote} sagaTonight={sagaTonight} onSaga={setSagaTonight} />
      )}

      <HungComics episodes={episodes} />
    </AppShell>
  );
}

type AiNote = { text: string; theme: string | null; model: string; today: boolean };
const DAY = 86_400_000;

// "Dreams remembered this week: 5, up from 2." Only ever said kindly: a quieter week is "so far".
function RecallLine({ dreams }: { dreams: DreamSummary[] }) {
  const today = useClientValue(() => Math.floor(Date.now() / DAY), 0);
  if (!today) return null;
  const monday = today - ((today + 3) % 7);
  const kept = dreams.filter((d) => d.status !== "failed");
  const now = kept.filter((d) => d.day >= monday).length;
  const before = kept.filter((d) => d.day >= monday - 7 && d.day < monday).length;
  if (!now) return null;
  const tail = before && now > before ? `, up from ${before}.` : before && now === before ? ", the same as last week." : before ? " so far." : ".";
  return (
    <p className="mt-3 text-lead text-mist">
      Dreams remembered this week: <span className="font-semibold text-paper">{now}</span>
      {tail}
    </p>
  );
}

// The theme a counted note is about ("Water, three nights running."), so it can become tonight's saga.
const NOTE_THEME: Record<string, string> = { water: "water", flying: "flight", falling: "falling", chase: "chase", home: "home", animal: "animals", crowd: "people", school: "school", city: "city", nature: "nature", fantasy: "fantasy", "night-time": "night" };
const themeOfNote = (n?: Note) => (n?.kind === "streak" ? (NOTE_THEME[n.text.split(",")[0].toLowerCase()] ?? null) : null);

function MorningNote({ notes, aiNote, sagaTonight, onSaga }: { notes: Note[]; aiNote: AiNote | null; sagaTonight: string | null; onSaga: (t: string) => void }) {
  const [busy, setBusy] = useState(false);
  const headline = notes[0];
  const theme = themeOfNote(headline) ?? aiNote?.theme ?? null;
  const asked = theme && sagaTonight === theme;
  return (
    <section className="panel p-6 md:p-7" aria-labelledby="morning-note">
      <h2 id="morning-note" className="text-ui font-semibold text-gold">
        Morning Note
      </h2>
      {headline ? (
        <p className="mt-2 font-display text-h2 font-semibold text-paper">{headline.text}</p>
      ) : (
        !aiNote && <p className="mt-3 text-mist">Notes start once your dreams repeat: a theme three nights running, or a place you keep going back to.</p>
      )}
      {notes[1] && <p className="mt-2 font-display text-lead italic text-paper">{notes[1].text}</p>}
      {aiNote && (
        <>
          <p className="mt-3 font-display text-lead italic text-mist">{aiNote.text}</p>
          <p className="mt-1.5 text-meta text-dim">Written by 0G&rsquo;s sealed AI from your dream themes, never your words.</p>
        </>
      )}
      {theme && (
        <button
          type="button"
          disabled={busy || Boolean(asked)}
          onClick={() => {
            setBusy(true);
            api
              .sagaTonight(theme)
              .then((r) => onSaga(r.sagaTonight))
              .finally(() => setBusy(false));
          }}
          className="btn btn-line mt-5"
        >
          {asked ? "Tonight's comic continues it" : "Make this a saga tonight"}
        </button>
      )}
    </section>
  );
}

function Wall({
  dreams,
  notes,
  aiNote,
  sagaTonight,
  onSaga,
}: {
  dreams: DreamSummary[];
  notes: Note[];
  aiNote: AiNote | null;
  sagaTonight: string | null;
  onSaga: (t: string) => void;
}) {
  const [feeling, setFeeling] = useState<string | null>(null);
  const shown = feeling ? dreams.filter((d) => d.feeling === feeling).length : dreams.length;
  const label = FEELINGS.find((f) => f.key === feeling)?.label.toLowerCase();

  return (
    <>
      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        <MorningNote notes={notes} aiNote={aiNote} sagaTonight={sagaTonight} onSaga={onSaga} />

        <section className="panel p-6 md:p-7" aria-labelledby="dream-weather">
          <h2 id="dream-weather" className="font-display text-title">
            Dream Weather
          </h2>
          <p className="mt-1 text-ui text-mist">As you said it felt</p>
          <div className="mt-4">
            <WeatherStrip dreams={dreams.filter((d) => PAINTED.has(d.status))} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Show the days that felt">
            <button type="button" className="chip" aria-pressed={feeling === null} onClick={() => setFeeling(null)}>
              All <span className="chip-count">{dreams.length}</span>
            </button>
            {FEELINGS.map((f) => {
              const n = dreams.filter((d) => d.feeling === f.key).length;
              return (
                <button key={f.key} type="button" className="chip" style={chipColor(f.color)} aria-pressed={feeling === f.key} onClick={() => setFeeling(feeling === f.key ? null : f.key)}>
                  <span className="chip-dot" aria-hidden />
                  {f.label} <span className="chip-count">{n}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-meta text-dim" aria-live="polite">
            {feeling ? `Lighting the ${shown} ${label} ${shown === 1 ? "dream" : "dreams"} on your wall.` : "Tap a feeling to light up its days."}
          </p>
        </section>
      </div>

      <CalendarWall dreams={dreams} feeling={feeling} />
    </>
  );
}

// A dreamer with nothing on the wall yet sees the three steps, with the first one ready to press.
function FirstRun({ user }: { user: SessionUser }) {
  const name = `${user.handle}.dream-scape.eth`;
  const nameLine = !user.wallet
    ? "Galleries opened with a passphrase don’t get one. Sign in with 0G to claim it."
    : user.ensName
      ? "It’s yours already. Each morning’s dream gets its own name under it."
      : user.naming
        ? "We’re writing it to ENS now. It takes a couple of minutes."
        : "Each morning’s dream gets its own name under it.";

  return (
    <section className="panel mt-10 px-5 py-10 md:px-10 md:py-14" aria-labelledby="first-run">
      <div className="mx-auto max-w-2xl text-center">
        <h2 id="first-run" className="font-display text-h2 md:text-h1">
          Your wall is ready for its first painting
        </h2>
        <p className="mx-auto mt-4 max-w-[46ch] text-lead text-mist">Tell a dream when you wake. A minute later it hangs here as a painting, with your own words beside it.</p>
        <Link href="/tell" className="btn btn-gold btn-lg mt-8">
          Tell your first dream
        </Link>
      </div>

      <ol className="mx-auto mt-14 grid max-w-5xl gap-10 md:grid-cols-3 md:gap-8">
        <FirstStep n={1} title="Tell your first dream" body="Hold the gold button and say what you saw. Ten seconds is plenty. You can type it instead.">
          <Link href="/tell" aria-label="Tell your first dream" className="sphere sphere-press grid h-20 w-20 place-items-center rounded-full text-gold-ink">
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
            </svg>
          </Link>
        </FirstStep>
        <FirstStep n={2} title="Watch it paint" body="A checklist shows each step as it happens, from hearing your words to sealing the painting. You can close the app meanwhile.">
          <div className="painting grid h-full w-full place-items-center">
            <span className="font-display text-ui italic text-mist">Painting…</span>
          </div>
        </FirstStep>
        <FirstStep n={3} title="Your name on ENS" body={nameLine}>
          <span className={`max-w-[90%] rounded-md border border-gold/70 bg-gradient-to-b from-[#3a2d10] to-[#22190a] px-3 py-2 text-center font-mono text-meta text-gold shadow-[inset_0_1px_0_rgb(255_230_170/0.25)] ${user.wallet ? "" : "opacity-50"}`}>
            <span className="block break-all">{name}</span>
          </span>
        </FirstStep>
      </ol>
    </section>
  );
}

function FirstStep({ n, title, body, children }: { n: number; title: string; body: string; children: React.ReactNode }) {
  return (
    <li>
      <div className="frame">
        <div className="mat grid aspect-[4/3] w-full place-items-center">{children}</div>
      </div>
      <p className="mt-5 flex items-center gap-3 font-display text-title font-semibold">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gold/60 font-sans text-ui font-bold text-gold" aria-hidden>
          {n}
        </span>
        {title}
      </p>
      <p className="mt-2 text-ui text-mist">{body}</p>
    </li>
  );
}

// Comics you chose to hang. Drafts wait on the Drafts page.
function HungComics({ episodes }: { episodes: EpisodeSummary[] }) {
  const hung = episodes.filter((e) => e.status === "published");
  if (hung.length === 0) return null;
  return (
    <section id="comics" className="mt-20 grid scroll-mt-24 gap-x-14 gap-y-6 border-t border-edge pt-14 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <div>
        <h2 className="font-display text-h2">Hung comics</h2>
        <p className="mt-3 text-mist">The comics you chose to hang. New ones wait in Drafts until you decide.</p>
        <Link href="/drafts" className="mt-4 inline-block font-semibold text-gold underline decoration-gold/30 underline-offset-4 hover:decoration-gold">
          Open Drafts
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:gap-x-7 xl:grid-cols-4">
        {hung.map((e) => (
          <Link key={e.id} href={`/episode/${e.id}`} className="lift appear">
            <div className="paper-card">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, decrypted per request */}
              <img src={panelUrl(e.id, 0)} alt="" className="aspect-square w-full border-2 border-[#1d1a17] object-cover" />
            </div>
            <p className="mt-3 text-meta font-semibold text-gold">{dayLabel(e.day)}</p>
            <p className="lift-title truncate font-display text-lead font-semibold">{e.title}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

// The sign-in that sits in the landing's slot: 0G's own sign-in on localhost, the dreamer's wallet on the
// live site (providers.tsx), then, for a new dreamer, the name their gallery gets on ENS. The landing itself
// shows the wordmark and headline.
function SignIn({ onDone }: { onDone: () => void }) {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const kind = useSignInKind();
  const [needsName, setNeedsName] = useState(false);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exchange = useCallback(
    (name?: string) =>
      getAccessToken()
        .then((token) => {
          if (!token) throw new Error("Sign in again.");
          return kind === "wallet" ? api.walletSignIn(token, name) : api.zeroGSignIn(token, name);
        })
        .then((res) => (res.needsHandle ? setNeedsName(true) : onDone())),
    [getAccessToken, onDone, kind],
  );

  // Once 0G has signed them in, swap that for our own session.
  useEffect(() => {
    if (!ready || !authenticated) return;
    exchange().catch((e: Error) => setError(e.message));
  }, [ready, authenticated, exchange]);

  if (needsName) {
    return (
      <form
        className="flex flex-col gap-3 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          exchange(handle)
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      >
        <label className="text-sm text-mist" htmlFor="handle">Pick your gallery&rsquo;s name</label>
        <input
          id="handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="mithran"
          autoFocus
          className="rounded-xl border border-line bg-card px-4 py-3 text-paper placeholder:text-dim focus:border-gold focus:outline-none"
        />
        <p className="text-xs text-dim">It becomes {handle.trim() ? handle.trim().toLowerCase() : "yourname"}.dream-scape.eth, owned by your {kind === "wallet" ? "wallet" : "0G wallet"}.</p>
        <button disabled={busy} className="press rounded-xl bg-gold px-4 py-3 font-semibold text-gold-ink disabled:opacity-60">
          {busy ? "Opening…" : "Open my gallery"}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button disabled={!ready || (authenticated && !error)} onClick={login} className="press rounded-xl bg-gold px-4 py-3 font-semibold text-gold-ink disabled:opacity-60">
        {authenticated && !error ? "Opening your gallery…" : kind === "wallet" ? "Sign in with your wallet" : "Sign in with 0G"}
      </button>
      <p className="text-left text-xs text-dim">
        {kind === "wallet"
          ? "Use the wallet your 0G account signs in with: it opens your gallery and holds your ENS name."
          : "Your 0G account is your gallery: its wallet holds your ENS name, and its iAI credit paints your dreams."}
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
