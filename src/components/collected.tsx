"use client";
// The editions this dreamer holds, bought in the Night Market or given by a friend. Each is an ENS name in
// its maker's gallery; giving one away is a transfer the holder's own wallet sends, and the friend's
// gallery shows it from then on.
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type HeldEdition } from "@/lib/api";
import { usePrivyWallet } from "@/lib/wallet";

const tx = (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`;

export function Collected() {
  const [held, setHeld] = useState<HeldEdition[] | null>(null);
  const load = () => api.collected().then((r) => setHeld(r.editions), () => setHeld([]));
  useEffect(() => {
    load();
  }, []);
  if (!held?.length) return null;
  return (
    <section id="collected" className="mt-20 grid scroll-mt-24 gap-x-14 gap-y-6 border-t border-edge pt-14 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <div>
        <h2 className="font-display text-h2">Collected</h2>
        <p className="mt-3 text-mist">Editions you hold. Each is an ENS name you own, so it opens the full piece for you, and you can give it to a friend.</p>
      </div>
      <ul className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:gap-x-7 xl:grid-cols-3">
        {held.map((e) => (
          <Edition key={e.name} edition={e} onGiven={load} />
        ))}
      </ul>
    </section>
  );
}

function Edition({ edition: e, onGiven }: { edition: HeldEdition; onGiven: () => void }) {
  const { send } = usePrivyWallet();
  const [giving, setGiving] = useState(false);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [given, setGiven] = useState<{ hash: string; friend: string } | null>(null);

  async function give() {
    setBusy(true);
    setError(null);
    try {
      const { tx: call, friend } = await api.giveEdition(e.pieceId, e.editionNo, to);
      const [hash] = await send([call]);
      setGiven({ hash, friend: friend.handle ? `${friend.handle}.dream-scape.eth` : friend.wallet });
    } catch (err) {
      setError((err as Error).message.split("\n")[0]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="appear">
      <Link href={`/market/${e.pieceId}`} className="lift block">
        {/* eslint-disable-next-line @next/next/no-img-element -- the piece's public preview */}
        <img src={e.preview} alt="" className="aspect-square w-full rounded-xl border border-edge object-cover" />
        <p className="mt-3 text-meta font-semibold text-gold">Edition {e.editionNo} · from {e.maker}</p>
        <p className="lift-title truncate font-display text-lead font-semibold">{e.title}</p>
      </Link>
      <p className="mt-1 truncate font-mono text-meta text-dim" title={e.name}>
        {e.name}
      </p>
      {given ? (
        <p className="mt-3 text-ui text-mist">
          Given to {given.friend}.{" "}
          <a href={tx(given.hash)} target="_blank" rel="noreferrer" className="font-semibold text-gold underline decoration-gold/30 underline-offset-4">
            The transfer on Etherscan
          </a>
          {" · "}
          <button type="button" onClick={onGiven} className="font-semibold text-gold underline decoration-gold/30 underline-offset-4">
            Done
          </button>
        </p>
      ) : giving ? (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            give();
          }}
        >
          <label className="text-meta text-mist" htmlFor={`to-${e.name}`}>
            Their gallery name, or wallet address
          </label>
          <input id={`to-${e.name}`} value={to} onChange={(ev) => setTo(ev.target.value)} placeholder="mithran-12" autoFocus className="field rounded-xl px-3 py-2" />
          <div className="flex gap-2">
            <button disabled={busy || !to.trim()} className="btn btn-gold btn-sm">
              {busy ? "Confirm in your wallet…" : "Give it"}
            </button>
            <button type="button" disabled={busy} onClick={() => setGiving(false)} className="btn btn-line btn-sm">
              Cancel
            </button>
          </div>
          {error && <p className="text-meta text-danger">{error}</p>}
        </form>
      ) : (
        <button type="button" onClick={() => setGiving(true)} className="btn btn-line btn-sm mt-3">
          Give to a friend
        </button>
      )}
    </li>
  );
}
