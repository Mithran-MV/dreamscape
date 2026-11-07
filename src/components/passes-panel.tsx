"use client";
// Family passes: grant one by handle and scope, let knocks in, and revoke a pass from the dreamer's own wallet.
// PassesPanel is the /passes page; KnockBanner puts anyone at the door on the wall too.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { arkivEntityUrl, visitsApi, type Door, type GrantedPass, type Passes, type PassScope } from "@/lib/api-visits";
import { usePrivyWallet } from "@/lib/wallet";
import { useClientValue } from "@/lib/use-client-value";
import { ExternalLink } from "@/components/ui";
import { plainError } from "@/components/messages";

const SCOPES: { key: PassScope; label: string; hint: string }[] = [
  { key: "gallery", label: "Whole gallery", hint: "Your paintings and the words you told them with, plus hung comics." },
  { key: "published", label: "Published pieces only", hint: "Only the comics you chose to hang. No paintings, no words." },
];

const scopeLabel = (scope: PassScope) => (scope === "gallery" ? "the whole gallery" : "published pieces only");
const clockTime = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const HOUR_MS = 3_600_000;

function stateText(p: GrantedPass, hour: number) {
  if (p.state === "granting") return "Writing the pass. It takes a minute or two.";
  if (p.state === "failed") return "This pass didn’t go through.";
  if (p.state === "expired") return "Expired";
  if (!p.expiresAt || !hour) return "Active";
  const days = Math.max(0, Math.ceil((p.expiresAt - hour * HOUR_MS) / (24 * HOUR_MS)));
  return days === 1 ? "Ends tomorrow" : `${days} days left`;
}

// Who is knocking and who is inside. It reads Arkiv; if that's unreachable, the rest still works.
function useDoor(every: number) {
  const [door, setDoor] = useState<Door | null>(null);
  const load = useCallback(() => visitsApi.door().then(setDoor, () => setDoor(null)), []);
  useEffect(() => {
    load();
    const t = setInterval(load, every);
    return () => clearInterval(t);
  }, [load, every]);
  return { door, reload: load };
}

function Knocks({ door, busy, onLetIn }: { door: Door; busy: string | null; onLetIn: (key: string, length: "10m" | "1h") => void }) {
  return (
    <div className="space-y-3">
      {door.knocks.map((k) => (
        <div key={k.key} className="appear flex flex-wrap items-center justify-between gap-4 rounded-[1.25rem] border border-gold/60 bg-card/85 px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-display text-title font-semibold">
              <span className="breathe h-2.5 w-2.5 shrink-0 rounded-full bg-gold" aria-hidden />
              {k.handle} is at your door
            </p>
            <p className="text-ui text-mist">
              Their pass shows {scopeLabel(k.scope)}.{" "}
              <ArkivLink entity={k.key}>The knock on Arkiv</ArkivLink>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onLetIn(k.key, "10m")} disabled={busy === k.key} className="btn btn-gold">
              {busy === k.key ? "Opening the door…" : "Let in for 10 minutes"}
            </button>
            <button onClick={() => onLetIn(k.key, "1h")} disabled={busy === k.key} className="btn btn-line">
              Let in for 1 hour
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// On the wall: only shown while someone is knocking or visiting.
export function KnockBanner() {
  const { door, reload } = useDoor(15_000);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!door || (door.knocks.length === 0 && door.inside.length === 0)) return null;
  const letIn = (key: string, length: "10m" | "1h") => {
    setBusy(key);
    setError(null);
    visitsApi
      .letIn(key, length)
      .then(reload, (e: Error) => setError(plainError(e.message)))
      .finally(() => setBusy(null));
  };
  return (
    <div className="mt-8 space-y-3">
      <Knocks door={door} busy={busy} onLetIn={letIn} />
      {door.inside.length > 0 && <Inside door={door} />}
      {error && <p className="text-ui text-danger">{error}</p>}
    </div>
  );
}

function ArkivLink({ entity, children }: { entity: string; children: React.ReactNode }) {
  return (
    <a href={arkivEntityUrl(entity)} target="_blank" rel="noreferrer" className="text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold">
      {children} &#8599;
    </a>
  );
}

function Inside({ door }: { door: Door }) {
  return (
    <ul className="space-y-1.5 text-ui text-mist">
      {door.inside.map((v) => (
        <li key={v.key} className="flex items-center gap-2">
          <span className="breathe h-2 w-2 shrink-0 rounded-full bg-ok" aria-hidden />
          <span>
            <span className="font-semibold text-paper">{v.handle}</span> is visiting {scopeLabel(v.scope)} until {clockTime(v.endsAt)}.{" "}
            <ArkivLink entity={v.key}>The visit on Arkiv</ArkivLink>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PassesPanel() {
  const [passes, setPasses] = useState<Passes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [scope, setScope] = useState<PassScope>("published");
  const wallet = usePrivyWallet();
  const hour = useClientValue(() => Math.floor(Date.now() / HOUR_MS), 0);

  const loadPasses = useCallback(() => visitsApi.passes().then(setPasses, (e: Error) => setError(plainError(e.message))), []);
  // Knocks can come at any time, and a pass being granted lands within a minute or two.
  const granting = passes?.granted.some((p) => p.state === "granting") ?? false;
  const { door, reload: loadDoor } = useDoor(granting ? 5_000 : 15_000);

  useEffect(() => {
    loadPasses();
    const t = setInterval(loadPasses, granting ? 5_000 : 15_000);
    return () => clearInterval(t);
  }, [loadPasses, granting]);

  const act = async (key: string, run: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await run();
      await Promise.all([loadPasses(), loadDoor()]);
    } catch (e) {
      setError(plainError((e as Error).message));
    } finally {
      setBusy(null);
    }
  };

  const grant = () =>
    act("grant", async () => {
      await visitsApi.grant(handle, scope);
      setHandle("");
    });

  // Only the dreamer may unregister a pass, so their own wallet sends it; the server then checks ENS.
  const revoke = (p: GrantedPass) =>
    act(p.id, async () => {
      setConfirming(null);
      const res = await visitsApi.revokeTx(p.id);
      if (!res.tx) return;
      const [hash] = await wallet.send([res.tx]);
      await visitsApi.revoked(p.id, hash);
    });

  if (!passes) {
    return error ? <p className="mt-8 text-danger">{error}</p> : <div className="painting mt-10 h-64 rounded-[1.25rem]" aria-hidden />;
  }
  const ready = passes.ready.wallet && passes.ready.name;
  const live = passes.granted.filter((p) => p.state !== "expired");

  return (
    <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:gap-16">
      <div className="min-w-0 space-y-10">
        {door && door.knocks.length > 0 && <Knocks door={door} busy={busy} onLetIn={(key, length) => act(key, () => visitsApi.letIn(key, length))} />}

        {door && door.inside.length > 0 && (
          <section>
            <h2 className="font-display text-title">Inside right now</h2>
            <div className="mt-3">
              <Inside door={door} />
            </div>
          </section>
        )}

        <section>
          <h2 className="font-display text-h2">Who can visit</h2>
          {live.length === 0 ? (
            <p className="panel mt-5 p-6 text-mist">Nobody yet. Grant a pass and they can knock on your gallery&rsquo;s door.</p>
          ) : (
            <ul className="panel mt-5 divide-y divide-edge">
              {passes.granted.map((p) => (
                <li key={p.id} className={`flex flex-wrap items-center justify-between gap-4 px-5 py-4 ${p.state === "expired" ? "opacity-60" : ""}`}>
                  <div className="min-w-0">
                    <p className="font-display text-title font-semibold">{p.handle}</p>
                    <ExternalLink href={p.link} className="font-mono text-meta">
                      {p.name}
                    </ExternalLink>
                    <p className="mt-1 text-meta text-mist">
                      Sees {scopeLabel(p.scope)}. <span className={p.state === "failed" ? "text-danger" : "text-dim"}>{stateText(p, hour)}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {p.state === "failed" && (
                      <button onClick={() => act(p.id, () => visitsApi.retry(p.id))} disabled={busy === p.id} className="btn btn-line btn-sm">
                        Try again
                      </button>
                    )}
                    {(p.state === "active" || p.state === "failed") &&
                      (confirming === p.id ? (
                        <>
                          <button onClick={() => revoke(p)} disabled={busy === p.id || !wallet.ready} className="btn btn-danger btn-sm">
                            {busy === p.id ? "Revoking…" : "Revoke for good"}
                          </button>
                          <button onClick={() => setConfirming(null)} disabled={busy === p.id} className="btn btn-quiet btn-sm">
                            Keep it
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setConfirming(p.id)} disabled={busy === p.id} className="btn btn-line btn-sm">
                          Revoke
                        </button>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {passes.held.length > 0 && (
          <section>
            <h2 className="font-display text-h2">Passes you hold</h2>
            <ul className="mt-4 space-y-2">
              {passes.held.map((h) => (
                <li key={h.handle} className="flex flex-wrap items-baseline gap-x-3">
                  <Link href={`/g/${h.handle}`} className="font-semibold text-gold underline decoration-gold/30 underline-offset-4 hover:decoration-gold">
                    Visit {h.handle}&rsquo;s gallery
                  </Link>
                  <span className="text-meta text-dim">Shows {scopeLabel(h.scope)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {error && <p className="text-ui text-danger">{error}</p>}
      </div>

      <aside className="lg:sticky lg:top-28 lg:self-start">
        {ready ? (
          <form
            className="panel p-6"
            onSubmit={(e) => {
              e.preventDefault();
              grant();
            }}
          >
            <h2 className="font-display text-title">Grant a pass</h2>
            <label htmlFor="pass-handle" className="mt-5 block text-ui font-semibold text-paper">
              Who it&rsquo;s for
            </label>
            <input id="pass-handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Their gallery name" autoComplete="off" className="field mt-2" />
            <fieldset className="mt-5">
              <legend className="text-ui font-semibold text-paper">What they see</legend>
              <div className="mt-2 space-y-2">
                {SCOPES.map((s) => (
                  <label
                    key={s.key}
                    className={`flex cursor-pointer gap-3 rounded-2xl border px-4 py-3 transition-colors duration-150 ${scope === s.key ? "border-gold bg-gold/10" : "border-line hover:border-mist/50"}`}
                  >
                    <input type="radio" name="pass-scope" checked={scope === s.key} onChange={() => setScope(s.key)} className="mt-1.5 accent-[var(--gold)]" />
                    <span>
                      <span className="block font-semibold text-paper">{s.label}</span>
                      <span className="block text-meta text-mist">{s.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="mt-4 text-meta text-dim">
              The pass ends after 30 days unless you revoke it sooner. It&rsquo;s an ENS name they can&rsquo;t hand on, and visitors never see Morning Notes, drafts or voice notes.
            </p>
            <button disabled={busy === "grant" || !handle.trim()} className="btn btn-gold btn-lg mt-5 w-full">
              {busy === "grant" ? "Granting…" : "Grant pass"}
            </button>
          </form>
        ) : (
          <div className="panel p-6">
            <h2 className="font-display text-title">Grant a pass</h2>
            <p className="mt-2 text-mist">
              {passes.ready.wallet ? "Passes open once your gallery’s ENS name is ready. That takes a couple of minutes." : "Passes need a wallet. Sign in with 0G to use yours."}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
