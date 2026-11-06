"use client";
// "Sign in with 0G": the dreamer's own 0G credit, read from 0G Pay, going down as dreams become art.
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { StripeClient, type Balance } from "@0gfoundation/0g-pay-sdk/server";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { BackLink } from "@/components/ui";

const usd = (micros: number) => `$${(micros / 1e6).toFixed(micros < 1e6 ? 4 : 2)}`;

export default function ZeroGPage() {
  const { ready, authenticated, login, logout, getAccessToken, user } = usePrivy();
  const [pay, setPay] = useState<StripeClient | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            Dreamscape&rsquo;s painter runs on 0G with a key from your account, so every dream you tell spends from this balance. Your iAI credits reset each day,
            so keeping a dream every morning uses credit that would otherwise expire.
          </p>
          <p className="mt-6 text-ui text-dim">0G allows its sign-in only on localhost:3000, 3001 and 5173, so this page runs on the laptop.</p>
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
