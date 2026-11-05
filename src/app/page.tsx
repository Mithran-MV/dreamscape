"use client";
// Home: sign in, then the gallery wall of framed dream portraits.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, PAINTED, panelUrl, portraitUrl, type DreamSummary, type EpisodeSummary } from "@/lib/api";
import { dayLabel, Frame } from "@/components/ui";

export default function Home() {
  const [user, setUser] = useState<{ handle: string } | null | undefined>(undefined);
  const [dreams, setDreams] = useState<DreamSummary[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);
  const [nightly, setNightly] = useState<boolean | null>(null);

  const load = useCallback(
    () =>
      api.session().then(async ({ user }) => {
        setUser(user);
        if (!user) return;
        const [d, e, n] = await Promise.all([api.dreams(), api.episodes(), api.nightly()]);
        setDreams(d.dreams);
        setEpisodes(e.episodes);
        setNightly(n.optedIn);
      }),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Keep the wall live while any frame is still being painted.
  useEffect(() => {
    const busy = dreams.some((d) => !PAINTED.has(d.status) && d.status !== "failed") || episodes.some((e) => e.status === "writing" || e.status === "drawing");
    if (!busy) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [dreams, episodes, load]);

  if (user === undefined) return <main className="flex-1" />;
  if (!user) return <SignIn onDone={load} />;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-28 pt-8">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold">Dreamscape</p>
          <h1 className="font-display text-3xl">{user.handle}&rsquo;s gallery</h1>
        </div>
        <div className="text-right text-sm text-dim">
          <p>{dreams.length} {dreams.length === 1 ? "dream" : "dreams"} kept</p>
          <Link href="/0g" className="text-gold">0G credit</Link>
        </div>
      </header>

      {episodes
        .filter((e) => e.status === "draft")
        .slice(0, 1)
        .map((e) => (
          <Link key={e.id} href={`/episode/${e.id}`} className="mb-8 flex items-center justify-between gap-4 rounded-2xl border border-gold/50 bg-card/70 px-5 py-4">
            <span>
              <span className="block font-display text-lg">Last night&rsquo;s comic is waiting</span>
              <span className="text-sm text-mist">{e.title ?? "A new episode"}. Hang it or let it go.</span>
            </span>
            <span className="shrink-0 text-sm text-gold">Open</span>
          </Link>
        ))}

      {dreams.length === 0 ? (
        <section className="rounded-2xl border border-edge bg-card/70 p-8 text-center">
          <p className="font-display text-2xl italic">The wall is empty, for now.</p>
          <p className="mx-auto mt-2 max-w-md text-mist">Tell your first dream and it will hang here as a painting, with your own voice kept beside it.</p>
        </section>
      ) : (
        <section className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {dreams.map((d) => (
            <Link key={d.id} href={`/dream/${d.id}`} className="group block">
              <Frame src={PAINTED.has(d.status) ? portraitUrl(d.id) : null} failed={d.status === "failed"} glow={d.feeling} alt={d.title ?? "A dream"} className="transition-transform group-hover:-translate-y-0.5" />
              <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-gold">{dayLabel(d.day)}</p>
              <p className="truncate font-display text-base">{d.status === "failed" ? "Couldn't paint this one" : d.title ?? "Painting…"}</p>
            </Link>
          ))}
        </section>
      )}

      <Comics episodes={episodes} nightly={nightly} onChange={load} />

      <Link
        href="/tell"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold px-7 py-3.5 font-medium text-gold-ink shadow-[0_8px_30px_rgb(240_200_120/0.35)]"
      >
        Tell last night&rsquo;s dream
      </Link>
    </main>
  );
}

function Comics({ episodes, nightly, onChange }: { episodes: EpisodeSummary[]; nightly: boolean | null; onChange: () => void }) {
  const hung = episodes.filter((e) => e.status === "published");
  const making = episodes.find((e) => e.status === "writing" || e.status === "drawing");
  const [error, setError] = useState<string | null>(null);
  const act = (action: "run" | "opt-in" | "opt-out") => api.night(action).then(onChange, (e) => setError(e.message));
  return (
    <section className="mt-14">
      <h2 className="font-display text-2xl">Comics</h2>
      {hung.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3">
          {hung.map((e) => (
            <Link key={e.id} href={`/episode/${e.id}`} className="group block">
              <div className="rounded-[3px] bg-[#fbf9f4] p-2 transition-transform group-hover:-translate-y-0.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- private, decrypted per request */}
                <img src={panelUrl(e.id, 0)} alt="" className="aspect-square w-full border-2 border-[#1d1a17] object-cover" />
              </div>
              <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-gold">{dayLabel(e.day)}</p>
              <p className="truncate font-display text-base">{e.title}</p>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-2 max-w-md text-mist">Each night, your newest dream can become a four-panel comic in your own words. You approve it in the morning.</p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
        {making ? (
          <Link href={`/episode/${making.id}`} className="text-gold">Tonight&rsquo;s comic is being made</Link>
        ) : (
          <button onClick={() => act("run")} className="rounded-full border border-line px-4 py-2 text-mist hover:border-gold">
            Make tonight&rsquo;s comic now
          </button>
        )}
        {nightly !== null && (
          <label className="flex items-center gap-2 text-mist">
            <input type="checkbox" checked={nightly} onChange={(e) => act(e.target.checked ? "opt-in" : "opt-out")} className="accent-[var(--gold)]" />
            Make one every night
          </label>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [handle, setHandle] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-gold">Dreamscape</p>
      <h1 className="mt-3 max-w-md font-display text-4xl leading-tight">
        Your brain deletes your dreams. <em className="text-gold">Dreamscape keeps them.</em>
      </h1>
      <p className="mt-4 max-w-sm text-mist">Ten seconds when you wake. It&rsquo;s painted, sealed and kept, with your own voice beside it.</p>
      <form
        className="mt-8 flex w-full max-w-xs flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.signIn(handle, pass);
            onDone();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="Pick a name, like mithran"
          autoComplete="username"
          className="rounded-xl border border-line bg-card px-4 py-3 text-paper placeholder:text-dim focus:border-gold focus:outline-none"
        />
        <input
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          type="password"
          placeholder="Passphrase (6+ characters)"
          autoComplete="current-password"
          className="rounded-xl border border-line bg-card px-4 py-3 text-paper placeholder:text-dim focus:border-gold focus:outline-none"
        />
        <p className="text-left text-xs text-dim">New name? This passphrase claims it. Same name later? Use the same passphrase.</p>
        <button className="rounded-xl bg-gold px-4 py-3 font-medium text-gold-ink">Open my gallery</button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </main>
  );
}
