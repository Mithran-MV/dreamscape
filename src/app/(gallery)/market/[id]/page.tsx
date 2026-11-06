"use client";
// One piece on the Night Market: the preview, what's left, and buying an edition with USDC.
// Whoever holds an edition (or made the piece) sees the full piece here instead of the preview.
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { createPublicClient, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";
import { fullPanelUrl, fullUrl, market, previewUrl, usdc, type PieceView } from "@/lib/api-market";
import { usePrivyWallet } from "@/lib/wallet";
import { ComicPage, type ComicScript } from "@/components/comic";
import { Frame } from "@/components/ui";
import { TabBar } from "@/components/tab-bar";

const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const chain = createPublicClient({ chain: sepolia, transport: http("https://ethereum-sepolia-rpc.publicnode.com") });

export default function PiecePage() {
  return (
    <Suspense fallback={<main className="flex-1" />}>
      <PieceView />
    </Suspense>
  );
}

function PieceView() {
  const { id } = useParams<{ id: string }>();
  const [piece, setPiece] = useState<PieceView | null | undefined>(undefined);
  const [script, setScript] = useState<ComicScript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => market.piece(id).then(setPiece, (e: Error) => setError(e.message)), [id]);

  useEffect(() => {
    load();
  }, [load]);
  // While it's still being listed on-chain, look again every few seconds.
  useEffect(() => {
    if (piece?.status !== "listing") return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [piece, load]);
  // A holder of a comic gets the script too, so the app can letter the full page.
  useEffect(() => {
    if (!piece?.holds || piece.kind !== "episode") return;
    fetch(`/api/market/${piece.id}/script`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setScript(s));
  }, [piece]);

  if (piece === undefined) return <main className="flex-1" />;
  if (piece === null || error) return <main className="p-8 text-center text-mist">{error ?? "This piece isn't on the market."} <Link href="/market" className="text-gold">Back to the market</Link></main>;

  const left = piece.editions - piece.sold;
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 pb-28 pt-6">
      <Link href="/market" className="text-sm text-dim">← The Night Market</Link>
      <div className="mt-6 grid gap-8 md:grid-cols-[1.2fr_1fr]">
        <div>
          {piece.holds && piece.kind === "episode" && script ? (
            <ComicPage script={script} feeling={null} panelSrc={(n) => fullPanelUrl(piece.id, n)} />
          ) : piece.holds && piece.kind === "dream" ? (
            <Frame src={fullUrl(piece.id)} alt={piece.title} />
          ) : piece.kind === "episode" ? (
            <div className="rounded-[3px] bg-[#fbf9f4] p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- a small public preview */}
              <img src={previewUrl(piece.id)} alt="" className="aspect-square w-full object-cover blur-[0.5px]" />
            </div>
          ) : (
            <Frame src={previewUrl(piece.id)} alt={piece.title} />
          )}
          {!piece.holds && <p className="mt-3 text-sm text-dim">This is a small preview. An edition opens the full piece.</p>}
        </div>

        <section>
          <h1 className="font-display text-3xl leading-tight">{piece.title}</h1>
          {piece.sellerEns && <p className="mt-1 font-mono text-xs text-gold">{piece.sellerEns}</p>}
          <p className="mt-5 font-display text-4xl">{usdc(piece.priceUsdc)}</p>
          <p className="mt-1 text-sm text-mist">
            {piece.status === "listing" ? "Being listed on NightMarket…" : left > 0 ? `${left} of ${piece.editions} left` : "Sold out"}
          </p>
          {piece.nextName && (
            <p className="mt-3 text-sm text-mist">
              {piece.mine ? "The next buyer gets" : "You get"} <span className="font-mono text-xs text-gold">{piece.nextName}</span>
              <span className="block text-xs text-dim">It&rsquo;s minted on ENS the moment the edition is bought.</span>
            </p>
          )}

          {piece.mine ? (
            <p className="mt-6 rounded-xl border border-edge bg-card/70 p-4 text-sm text-mist">Your piece. {piece.sold} sold so far; 95% of each sale comes to you.</p>
          ) : (
            piece.open && <Buy piece={piece} onBought={load} />
          )}

          {piece.holds && piece.names.length > 0 && !piece.mine && (
            <div className="mt-6">
              <p className="text-sm text-mist">Editions sold so far</p>
              {piece.names.map((n) => (
                <a key={n} href={`https://sepolia.app.ens.domains/${n}`} target="_blank" rel="noreferrer" className="mt-1 block truncate font-mono text-xs text-gold">{n}</a>
              ))}
            </div>
          )}

          <div className="mt-8 space-y-1 border-t border-edge pt-4 text-sm text-dim">
            <p>Each edition is its own ENS name, minted to you with no expiry. You can give it away.</p>
            <p>95% goes to the dreamer and 5% to the commons, which pays for dreams for people who are out of credit.</p>
            <p className="pt-2">
              <a href={piece.proof.market} target="_blank" rel="noreferrer" className="text-gold">NightMarket on Sepolia ↗</a>
              {piece.proof.arkiv && (
                <a href={piece.proof.arkiv} target="_blank" rel="noreferrer" className="ml-4 text-gold">The listing on Arkiv ↗</a>
              )}
            </p>
          </div>
        </section>
      </div>
      <TabBar active="market" />
    </main>
  );
}

function Buy({ piece, onBought }: { piece: PieceView; onBought: () => void }) {
  const wallet = usePrivyWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet.address) return;
    chain
      .readContract({ address: USDC, abi: parseAbi(["function balanceOf(address) view returns (uint256)"]), functionName: "balanceOf", args: [wallet.address as `0x${string}`] })
      .then((b) => setBalance(Number(b) / 1e6), () => setBalance(null));
  }, [wallet.address, done]);

  if (!wallet.address) {
    return (
      <p className="mt-6 text-sm text-mist">
        <Link href="/" className="text-gold">Sign in with email or Google</Link> to buy. You&rsquo;ll get a wallet with a little test money in it.
      </p>
    );
  }

  async function buy() {
    if (!piece.buy) return;
    setBusy(true);
    setError(null);
    try {
      const hashes = await wallet.send(piece.buy);
      const { editions } = await market.bought(piece.id, hashes[hashes.length - 1]);
      setDone(editions.map((e) => e.name));
      onBought();
    } catch (e) {
      setError((e as Error).message.split("\n")[0]);
    } finally {
      setBusy(false);
    }
  }

  const short = balance !== null && balance < piece.priceUsdc;
  return (
    <div className="mt-6">
      {done ? (
        <div className="rounded-xl border border-gold/50 bg-card/70 p-4">
          <p className="font-display text-lg">It&rsquo;s yours.</p>
          {done.map((n) => (
            <a key={n} href={`https://sepolia.app.ens.domains/${n}`} target="_blank" rel="noreferrer" className="mt-1 block truncate font-mono text-xs text-gold">{n}</a>
          ))}
        </div>
      ) : (
        <>
          <button onClick={buy} disabled={busy || short} className="w-full rounded-xl bg-gold px-4 py-3.5 font-medium text-gold-ink disabled:opacity-50">
            {busy ? "Confirm in your wallet…" : `Buy an edition for ${usdc(piece.priceUsdc)}`}
          </button>
          <p className="mt-2 text-xs text-dim">
            {balance === null ? "Checking your USDC…" : `You have ${usdc(balance)} on Sepolia.`}
            {short && (
              <>
                {" "}
                Get test USDC at <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="text-gold">faucet.circle.com</a> (Ethereum Sepolia).
              </>
            )}
          </p>
        </>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
