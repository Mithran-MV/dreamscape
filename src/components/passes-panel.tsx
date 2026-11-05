"use client";
// The dreamer's family passes: grant one by handle and scope, let knocks in, and revoke a pass from their own wallet.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { visitsApi, type Door, type GrantedPass, type Passes, type PassScope } from "@/lib/api-visits";
import { usePrivyWallet } from "@/lib/wallet";

const SCOPES: { key: PassScope; label: string; hint: string }[] = [
  { key: "gallery", label: "The whole gallery", hint: "Your paintings and the words you told them with, plus hung comics." },
  { key: "published", label: "Hung comics only", hint: "Only the comics you chose to hang. No paintings, no words." },
];

const scopeLabel = (scope: PassScope) => (scope === "gallery" ? "the whole gallery" : "hung comics only");
const clockTime = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const dateLabel = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function stateText(p: GrantedPass) {
  if (p.state === "granting") return "Granting on ENS…";
  if (p.state === "failed") return "Couldn't grant this pass.";
  if (p.state === "expired") return "Expired";
  return p.expiresAt ? `Until ${dateLabel(p.expiresAt)}` : "Active";
}

export function PassesPanel() {
  const [passes, setPasses] = useState<Passes | null>(null);
  const [door, setDoor] = useState<Door | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [scope, setScope] = useState<PassScope>("published");
  const wallet = usePrivyWallet();

  const load = useCallback(
    () =>
      Promise.all([
        visitsApi.passes().then(setPasses),
        // The door reads Arkiv; if it's unreachable, the rest of the panel still works.
        visitsApi.door().then(setDoor, () => setDoor(null)),
      ]).catch((e: Error) => setError(e.message)),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Knocks can come at any time, and a pass being granted lands within a minute or two.
  const granting = passes?.granted.some((p) => p.state === "granting") ?? false;
  useEffect(() => {
    const t = setInterval(load, granting ? 5_000 : 15_000);
    return () => clearInterval(t);
  }, [load, granting]);

  const act = async (key: string, run: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await run();
      await load();
    } catch (e) {
      setError((e as Error).message);
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

  if (!passes) return null;
  const ready = passes.ready.wallet && passes.ready.name;

  return (
    <section id="passes" className="mt-14 scroll-mt-6">
      <h2 className="font-display text-2xl">Family passes</h2>
      <p className="mt-2 max-w-md text-mist">Your gallery is private. A pass lets someone knock, and you choose whether to let them in, and for how long.</p>

      {door && door.knocks.length > 0 && (
        <div className="mt-5 space-y-3">
          {door.knocks.map((k) => (
            <div key={k.key} className="rounded-2xl border border-gold/50 bg-card/70 px-5 py-4">
              <p className="font-display text-lg">{k.handle} is at your door</p>
              <p className="text-sm text-mist">Their pass shows {scopeLabel(k.scope)}.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => act(k.key, () => visitsApi.letIn(k.key, "10m"))}
                  disabled={busy === k.key}
                  className="rounded-full bg-gold px-4 py-2 text-sm font-medium text-gold-ink disabled:opacity-60"
                >
                  {busy === k.key ? "Opening the door…" : "Let in for 10 minutes"}
                </button>
                <button
                  onClick={() => act(k.key, () => visitsApi.letIn(k.key, "1h"))}
                  disabled={busy === k.key}
                  className="rounded-full border border-line px-4 py-2 text-sm text-mist hover:border-gold disabled:opacity-60"
                >
                  Let in for 1 hour
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {door && door.inside.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-mist">
          {door.inside.map((v) => (
            <li key={v.key}>
              <span className="text-paper">{v.handle}</span> is visiting {scopeLabel(v.scope)} until {clockTime(v.endsAt)}
            </li>
          ))}
        </ul>
      )}

      {ready ? (
        <form
          className="mt-5 max-w-md rounded-2xl border border-edge bg-card/70 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            grant();
          }}
        >
          <label htmlFor="pass-handle" className="text-sm text-mist">Grant a pass to</label>
          <input
            id="pass-handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="Their gallery name"
            autoComplete="off"
            className="mt-2 w-full rounded-xl border border-line bg-card px-4 py-3 text-paper placeholder:text-dim focus:border-gold focus:outline-none"
          />
          <div className="mt-4 space-y-2" role="radiogroup" aria-label="What they may see">
            {SCOPES.map((s) => (
              <label key={s.key} className={`flex cursor-pointer gap-3 rounded-xl border px-4 py-3 ${scope === s.key ? "border-gold" : "border-line"}`}>
                <input type="radio" name="pass-scope" checked={scope === s.key} onChange={() => setScope(s.key)} className="mt-1 accent-[var(--gold)]" />
                <span>
                  <span className="block text-paper">{s.label}</span>
                  <span className="block text-xs text-dim">{s.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <button disabled={busy === "grant" || !handle.trim()} className="mt-4 rounded-full bg-gold px-5 py-2.5 font-medium text-gold-ink disabled:opacity-60">
            {busy === "grant" ? "Granting…" : "Grant a pass"}
          </button>
          <p className="mt-3 text-xs text-dim">
            The pass is an ENS name they can&rsquo;t hand on to anyone. It lasts 30 days unless you revoke it. Morning Notes, drafts and voice notes are never shown.
          </p>
        </form>
      ) : (
        <p className="mt-4 max-w-md text-sm text-dim">
          {passes.ready.wallet ? "Passes need your gallery's ENS name, which is being made now." : "Passes need a wallet. Sign in with email or Google to get one."}
        </p>
      )}

      {passes.granted.length > 0 && (
        <ul className="mt-5 max-w-xl divide-y divide-edge rounded-2xl border border-edge bg-card/70">
          {passes.granted.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p>
                  {p.handle} <span className="text-sm text-mist">sees {scopeLabel(p.scope)}</span>
                </p>
                <a href={p.link} target="_blank" rel="noreferrer" className="block truncate font-mono text-xs text-gold">{p.name}</a>
                <p className="text-xs text-dim">{stateText(p)}</p>
              </div>
              <div className="flex shrink-0 gap-2 text-sm">
                {p.state === "failed" && (
                  <button onClick={() => act(p.id, () => visitsApi.retry(p.id))} disabled={busy === p.id} className="rounded-full border border-line px-3.5 py-1.5 text-mist hover:border-gold disabled:opacity-60">
                    Try again
                  </button>
                )}
                {(p.state === "active" || p.state === "failed") &&
                  (confirming === p.id ? (
                    <button onClick={() => revoke(p)} disabled={busy === p.id || !wallet.ready} className="rounded-full border border-danger px-3.5 py-1.5 text-danger disabled:opacity-60">
                      {busy === p.id ? "Revoking…" : "Revoke for good"}
                    </button>
                  ) : (
                    <button onClick={() => setConfirming(p.id)} disabled={busy === p.id} className="rounded-full border border-line px-3.5 py-1.5 text-mist hover:border-danger disabled:opacity-60">
                      {busy === p.id ? "Revoking…" : "Revoke"}
                    </button>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {passes.held.length > 0 && (
        <div className="mt-8">
          <h3 className="font-display text-xl">Passes you hold</h3>
          <ul className="mt-2 space-y-1">
            {passes.held.map((h) => (
              <li key={h.handle}>
                <Link href={`/g/${h.handle}`} className="text-gold">Visit {h.handle}&rsquo;s gallery</Link>
                <span className="text-sm text-dim"> · {scopeLabel(h.scope)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </section>
  );
}
