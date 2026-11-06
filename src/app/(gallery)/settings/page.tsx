"use client";
// Settings: the nightly comic, notifications, the dreamer's circle, where sales pay out, and the account itself.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, type WorldState } from "@/lib/api";
import { AppShell, Avatar, useSessionUser, useSignOut } from "@/components/app-shell";
import { NotifyButton } from "@/components/notify-button";
import { ExternalLink, Switch } from "@/components/ui";
import { plainError } from "@/components/messages";

export default function SettingsPage() {
  return (
    <AppShell active="settings">
      <header className="max-w-3xl">
        <h1 className="font-display text-h1 md:text-display">Settings</h1>
      </header>
      <SettingsView />
    </AppShell>
  );
}

function Row({ title, body, children }: { title: string; body?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="grid gap-4 px-6 py-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-10">
      <div>
        <h3 className="font-display text-title">{title}</h3>
        {body && <div className="mt-1 text-ui text-mist">{body}</div>}
      </div>
      <div className="min-w-0 md:justify-self-end">{children}</div>
    </div>
  );
}

function SettingsView() {
  const user = useSessionUser();
  const signOut = useSignOut();
  const [nightly, setNightly] = useState<boolean | null>(null);
  const [pending, setPending] = useState<boolean | null>(null);
  const [world, setWorld] = useState<WorldState | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNightly = useCallback(() => api.nightly().then((n) => setNightly(n.optedIn), (e: Error) => setError(e.message)), []);
  const loadWorld = useCallback(() => api.world().then(setWorld, () => undefined), []);
  useEffect(() => {
    loadNightly();
    loadWorld();
  }, [loadNightly, loadWorld]);

  // The switch moves the moment it's tapped, then settles on what the server saved.
  const toggleNightly = (next: boolean) => {
    setPending(next);
    setError(null);
    api
      .night(next ? "opt-in" : "opt-out")
      .then(loadNightly, (e: Error) => setError(e.message))
      .finally(() => setPending(null));
  };
  const circleAct = (action: "join" | "leave", c?: string) => {
    setBusy(true);
    setError(null);
    api
      .worldAction(action, c)
      .then(loadWorld, (e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };

  const circle = world?.circle;
  return (
    <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-14">
      <div className="min-w-0 space-y-10">
        <section aria-labelledby="dreams">
          <h2 id="dreams" className="font-display text-h2">
            Your dreams
          </h2>
          <div className="panel mt-5 divide-y divide-edge">
            <Row title="Make a comic every night" body="Your newest dream becomes a four-panel comic overnight. It waits in Drafts until you hang it.">
              {nightly === null ? <span className="text-ui text-dim">Loading…</span> : <Switch checked={pending ?? nightly} onChange={toggleNightly} label={(pending ?? nightly) ? "On" : "Off"} />}
            </Row>
            <Row title="Notifications" body="A tap on your phone when a painting is on the wall. It says nothing about the dream itself.">
              <NotifyButton explain />
            </Row>
            <Row
              title="Your circle"
              body={circle ? `You dream into ${circle.name}'s World Dream as well as everyone's.` : "Join a circle with a code to share a World Dream with people you know."}
            >
              {circle ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Link href="/world" className="font-semibold text-gold underline decoration-gold/30 underline-offset-4">
                    {circle.name}
                  </Link>
                  <button onClick={() => circleAct("leave")} disabled={busy} className="btn btn-line btn-sm">
                    Leave the circle
                  </button>
                </div>
              ) : (
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    circleAct("join", code);
                  }}
                >
                  <label htmlFor="settings-circle" className="sr-only">
                    Circle code
                  </label>
                  <input id="settings-circle" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ethglobal-mumbai" className="field w-48 py-2 text-ui" />
                  <button disabled={busy} className="btn btn-line">
                    Join
                  </button>
                </form>
              )}
            </Row>
          </div>
          {error && <p className="mt-3 text-ui text-danger">{plainError(error)}</p>}
        </section>

        <section aria-labelledby="payouts">
          <h2 id="payouts" className="font-display text-h2">
            Payouts
          </h2>
          <div className="panel mt-5 divide-y divide-edge">
            <Row title="Where sales go" body="When someone buys an edition of your piece, 95% of the price comes to your wallet in USDC and 5% goes to the commons fund, which pays for dreams for people out of credit." />
            <Row title="Your gallery’s name" body="Every edition you sell gets its own name under it.">
              {user?.ensName ? (
                <ExternalLink href={`https://sepolia.app.ens.domains/${user.ensName}`} className="font-mono text-ui">
                  {user.ensName}
                </ExternalLink>
              ) : (
                <span className="text-ui text-dim">{user?.naming ? "Being written to ENS now" : "None yet. Galleries opened with email or Google get one."}</span>
              )}
            </Row>
          </div>
        </section>
      </div>

      <aside className="lg:sticky lg:top-28 lg:self-start" aria-labelledby="account">
        <div className="panel p-6">
          <h2 id="account" className="sr-only">
            Your account
          </h2>
          {user && (
            <div className="flex items-center gap-4">
              <Avatar handle={user.handle} size="h-14 w-14 text-h2" />
              <div className="min-w-0">
                <p className="truncate font-display text-title font-semibold">{user.handle}</p>
                {user.ensName && <p className="truncate font-mono text-meta text-gold">{user.ensName}</p>}
              </div>
            </div>
          )}
          <div className="mt-6 border-t border-edge pt-5">
            <p className="text-meta font-semibold text-dim">Your wallet</p>
            {user?.wallet ? (
              <p className="mt-1 break-all font-mono text-meta text-paper">{user.wallet}</p>
            ) : (
              <p className="mt-1 text-ui text-mist">No wallet. Galleries opened with a passphrase don&rsquo;t get one.</p>
            )}
          </div>
          <div className="mt-6 flex flex-wrap gap-3 border-t border-edge pt-5">
            <Link href="/0g" className="btn btn-line">
              0G credit
            </Link>
            <button onClick={signOut} className="btn btn-quiet">
              Sign out
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
