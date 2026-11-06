"use client";
// "Sign in with 0G": the dreamer's own 0G credit, read from 0G Pay, going down as dreams become art.
// Connecting gives Dreamscape a key on their own 0G account, so their credit is what pays.
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { StripeClient, type Balance } from "@0gfoundation/0g-pay-sdk/server";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { BackLink } from "@/components/ui";

const usd = (micros: number) => `$${(micros / 1e6).toFixed(micros < 1e6 ? 4 : 2)}`;

type Account = { connected: boolean; wallet: string | null; keyPreview: string | null; since: number | null; error: string | null };

async function account(init?: RequestInit): Promise<Account> {
  const res = await fetch("/api/zerog", init && { ...init, headers: { "Content-Type": "application/json" } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Couldn't reach Dreamscape.");
  return body;
}

export default function ZeroGPage() {
  const { ready, authenticated, login, logout, getAccessToken, user } = usePrivy();
  const [pay, setPay] = useState<StripeClient | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");

  useEffect(() => {
    account().then(setLinked, () => setLinked(null));
  }, []);

  const change = (init: RequestInit) => {
    setBusy(true);
    setLinkError(null);
    return account(init)
      .then(setLinked, (e: Error) => setLinkError(e.message))
      .finally(() => setBusy(false));
  };
  const connect = () =>
    getAccessToken().then((token) => (token ? change({ method: "POST", body: JSON.stringify({ token }) }) : setLinkError("0G didn't return a sign-in token. Sign in again.")));

  // Swap the 0G sign-in token for a 0G Pay session, once per sign-in.
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    getAccessToken()
      .then((token) => {
        if (!token) throw new Error("0G didn't return a sign-in token.");
        return new StripeClient({ network: "mainnet", sessionToken: "" }).exchangeSession(token);
      })
      .then((info) => !cancelled && setPay(new StripeClient({ network: "mainnet", sessionToken: info.token, accountId: info.account_id })))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [authenticated, getAccessToken]);

  const read = useCallback(
    () =>
      pay?.getBalance().then(
        (b) => {
          setBalance(b);
          setStart((s) => s ?? b.spendable_micros ?? null);
        },
        (e: Error) => setError(e.message),
      ),
    [pay],
  );

  useEffect(() => {
    if (!pay) return;
    read();
    const t = setInterval(read, 8000);
    return () => clearInterval(t);
  }, [pay, read]);

  const spendable = balance?.spendable_micros ?? null;
  const spent = start != null && spendable != null ? Math.max(0, start - spendable) : null;
  const who = user?.email?.address ?? user?.google?.email ?? user?.wallet?.address ?? user?.twitter?.username;

  return (
    <AppShell privyLogout={false}>
      <BackLink href="/settings">Settings</BackLink>
      <div className="mt-6 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start lg:gap-20">
        <div>
          <h1 className="font-display text-h1 md:text-display">Your 0G credit</h1>
          <p className="mt-5 max-w-[60ch] text-lead text-mist">
            Connect your 0G account and Dreamscape&rsquo;s painter runs on a key from it, so every dream you tell, and the comic made while you sleep, spends your
            own credit. Your iAI credits reset each day, so keeping a dream every morning uses credit that would otherwise expire.
          </p>
          <p className="mt-6 text-ui text-dim">0G allows its sign-in only on localhost:3000, 3001 and 5173, so this page runs on the laptop.</p>
          {linked && <Connection linked={linked} busy={busy} error={linkError} signedIn={authenticated} onConnect={connect} onPaste={() => change({ method: "POST", body: JSON.stringify({ key: pasted }) })} pasted={pasted} setPasted={setPasted} onDisconnect={() => change({ method: "DELETE" })} />}
        </div>

        {!ready ? (
          <div className="painting h-64 rounded-[1.25rem]" aria-hidden />
        ) : !authenticated ? (
          <section className="panel p-6">
            <h2 className="font-display text-title">Sign in with 0G</h2>
            <p className="mt-2 text-mist">See your balance and watch it go down as your dreams are painted.</p>
            <button onClick={login} className="btn btn-gold btn-lg mt-6 w-full">
              Sign in with 0G
            </button>
          </section>
        ) : (
          <section className="panel p-6">
            <p className="truncate text-meta text-dim">Signed in{who ? ` as ${who}` : ""}</p>
            {spendable == null ? (
              <p className="mt-4 text-mist">{error ? "" : "Reading your balance from 0G Pay…"}</p>
            ) : (
              <>
                <p className="mt-3 font-display text-[3.5rem] font-semibold leading-none">{usd(spendable)}</p>
                <p className="mt-2 text-mist">you can spend now</p>
                {balance?.spendable_credit_micros != null && <p className="mt-3 text-ui text-mist">Of that, {usd(balance.spendable_credit_micros)} is credit (iAI and grants).</p>}
                <p className="mt-4 text-ui">
                  Spent since you signed in: <span className="font-mono font-semibold text-gold">{usd(spent ?? 0)}</span>
                </p>
                {balance?.serve && balance.serve !== "allow" && <p className="mt-3 text-ui text-danger">0G has paused spending: {balance.stop_reason ?? balance.serve}</p>}
              </>
            )}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/tell" target="_blank" className="btn btn-gold">
                Tell a dream
              </Link>
              <button onClick={() => logout().then(() => (setPay(null), setBalance(null), setStart(null)))} className="btn btn-quiet">
                Sign out of 0G
              </button>
            </div>
          </section>
        )}
      </div>
      {error && <p className="mt-6 text-ui text-danger">{error}</p>}
    </AppShell>
  );
}

function Connection(props: {
  linked: Account;
  busy: boolean;
  error: string | null;
  signedIn: boolean;
  onConnect: () => void;
  onPaste: () => void;
  pasted: string;
  setPasted: (v: string) => void;
  onDisconnect: () => void;
}) {
  const { linked, busy, error } = props;
  if (linked.connected) {
    return (
      <section className="panel mt-10 max-w-xl p-6">
        <p className="flex items-center gap-2 font-display text-title font-semibold">
          <span className="h-2.5 w-2.5 rounded-full bg-ok" aria-hidden />
          Your 0G account pays for your dreams
        </p>
        <p className="mt-2 text-mist">
          Dreamscape uses the key <span className="font-mono text-paper">{linked.keyPreview}</span>
          {linked.wallet && (
            <>
              {" "}
              on <span className="font-mono text-paper">{linked.wallet.slice(0, 6)}…{linked.wallet.slice(-4)}</span>
            </>
          )}
          . Revoke it any time at pc.0g.ai.
        </p>
        {linked.error && <p className="mt-3 text-ui text-danger">Your last dream ran on Dreamscape&rsquo;s credit: {linked.error}. Connect again to fix it.</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          {linked.error && props.signedIn && (
            <button onClick={props.onConnect} disabled={busy} className="btn btn-gold">
              Connect again
            </button>
          )}
          <button onClick={props.onDisconnect} disabled={busy} className="btn btn-line">
            Stop using my 0G account
          </button>
        </div>
        {error && <p className="mt-3 text-ui text-danger">{error}</p>}
      </section>
    );
  }
  return (
    <section className="panel mt-10 max-w-xl p-6">
      <h2 className="font-display text-title">Connect your 0G account</h2>
      <p className="mt-2 text-mist">
        Dreamscape makes a key called &ldquo;Dreamscape&rdquo; on your 0G account and keeps it sealed. Your dreams, comics and moving portraits then spend your credit, even at night.
      </p>
      <button onClick={props.onConnect} disabled={busy || !props.signedIn} className="btn btn-gold mt-5">
        {busy ? "Connecting…" : props.signedIn ? "Connect my 0G account" : "Sign in with 0G first"}
      </button>
      <details className="mt-6">
        <summary className="cursor-pointer text-ui text-mist">Or paste a key from pc.0g.ai</summary>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            props.onPaste();
          }}
        >
          <input
            value={props.pasted}
            onChange={(e) => props.setPasted(e.target.value)}
            placeholder="sk-…"
            autoComplete="off"
            spellCheck={false}
            className="field min-w-0 flex-1 font-mono"
            aria-label="Your 0G key"
          />
          <button type="submit" disabled={busy || !props.pasted.trim()} className="btn btn-line">
            Use this key
          </button>
        </form>
      </details>
      {error && <p className="mt-3 text-ui text-danger">{error}</p>}
    </section>
  );
}
