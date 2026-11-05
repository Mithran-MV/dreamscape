"use client";
// "Sign in with 0G": the dreamer's own 0G credit, read from 0G Pay, going down as dreams become art.
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { StripeClient, type Balance } from "@0gfoundation/0g-pay-sdk/server";
import { useCallback, useEffect, useState } from "react";

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

  if (!ready) return <main className="flex-1" />;

  const spendable = balance?.spendable_micros ?? null;
  const spent = start != null && spendable != null ? Math.max(0, start - spendable) : null;
  const who = user?.email?.address ?? user?.google?.email ?? user?.wallet?.address ?? user?.twitter?.username;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-16 pt-8">
      <Link href="/" className="text-sm text-dim">← Gallery</Link>
      <p className="mt-8 text-xs uppercase tracking-[0.25em] text-gold">Your 0G credit</p>
      <h1 className="mt-2 font-display text-3xl leading-tight">Dreams paid for by your own 0G account.</h1>
      <p className="mt-3 text-sm text-mist">
        Dreamscape&rsquo;s painter runs on 0G with a key from your account, so every dream you tell spends from this balance. Your
        iAI credits reset each day, so keeping a dream every morning uses credit that would otherwise expire.
      </p>

      {!authenticated ? (
        <button onClick={login} className="mt-8 rounded-xl bg-gold px-4 py-3 font-medium text-gold-ink">Sign in with 0G</button>
      ) : (
        <section className="mt-8 rounded-2xl border border-edge bg-card/70 p-5">
          <p className="text-xs text-dim">Signed in{who ? ` as ${who}` : ""}</p>
          {spendable == null ? (
            <p className="mt-4 text-mist">{error ? "" : "Reading your balance from 0G Pay…"}</p>
          ) : (
            <>
              <p className="mt-3 font-display text-5xl">{usd(spendable)}</p>
              <p className="mt-1 text-sm text-mist">you can spend now</p>
              {balance?.spendable_credit_micros != null && (
                <p className="mt-3 text-sm text-mist">Of that, {usd(balance.spendable_credit_micros)} is credit (iAI and grants).</p>
              )}
              <p className="mt-3 text-sm">
                Spent since you signed in: <span className="font-mono text-gold">{usd(spent ?? 0)}</span>
              </p>
              {balance?.serve && balance.serve !== "allow" && (
                <p className="mt-2 text-sm text-danger">0G has paused spending: {balance.stop_reason ?? balance.serve}</p>
              )}
            </>
          )}
          <div className="mt-6 flex items-center gap-4">
            <Link href="/tell" target="_blank" className="rounded-full bg-gold px-4 py-2 text-sm font-medium text-gold-ink">
              Tell a dream
            </Link>
            <button onClick={() => logout().then(() => (setPay(null), setBalance(null), setStart(null)))} className="text-sm text-dim">
              Sign out
            </button>
          </div>
        </section>
      )}

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      <p className="mt-8 text-xs text-dim">0G allows its sign-in only on localhost:3000, 3001 and 5173, so this page runs on the laptop.</p>
    </main>
  );
}
