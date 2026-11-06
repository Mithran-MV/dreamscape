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
import { AppShell } from "@/components/app-shell";
import { ComicPage, type ComicScript } from "@/components/comic";
import { BackLink, ExternalLink, Frame } from "@/components/ui";
import { plainError } from "@/components/messages";

const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const chain = createPublicClient({ chain: sepolia, transport: http("https://ethereum-sepolia-rpc.publicnode.com") });

export default function PiecePage() {
  return (
    <AppShell active="market">
      <Suspense fallback={null}>
        <PieceView />
      </Suspense>
    </AppShell>
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

  if (piece === undefined && !error) {
    return (
      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" aria-hidden>
        <div className="painting aspect-square rounded-[3px]" />
        <div className="painting h-80 rounded-[1.25rem]" />
      </div>
    );
  }
  if (!piece || error) {
    return (
      <div className="panel mx-auto mt-6 max-w-lg p-8 text-center">
        <h1 className="font-display text-h2">{error ? "We couldn’t open this piece" : "This piece isn’t on the market"}</h1>
        {error && <p className="mt-3 text-mist">{plainError(error)}</p>}
        <Link href="/market" className="btn btn-gold mt-6">
          Back to the market
        </Link>
      </div>
    );
  }

  const left = piece.editions - piece.sold;
  return (
    <>
      <BackLink href="/market">The Night Market</BackLink>
      <div className="mt-6 grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          {piece.holds && piece.kind === "episode" && script ? (
            <ComicPage script={script} feeling={null} panelSrc={(n) => fullPanelUrl(piece.id, n)} />
          ) : piece.holds && piece.kind === "dream" ? (
            <Frame src={fullUrl(piece.id)} alt={piece.title} />
          ) : piece.kind === "episode" ? (
            <div className="paper-card p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- a small public preview */}
              <img src={previewUrl(piece.id)} alt="" className="aspect-square w-full object-cover blur-[0.5px]" />
            </div>
          ) : (
            <Frame src={previewUrl(piece.id)} alt={piece.title} />
          )}
          {!piece.holds && <p className="mt-4 text-ui text-dim">This is a small preview. An edition opens the full piece.</p>}
        </div>

        <section className="min-w-0">
          <p className="text-ui font-semibold text-mist">{piece.kind === "episode" ? "Comic" : "Portrait"}</p>
          <h1 className="mt-1 font-display text-h1 lg:text-display">{piece.title}</h1>
          {piece.sellerEns && <p className="mt-3 truncate font-mono text-ui text-gold">{piece.sellerEns}</p>}

          {piece.mine ? (
            <div className="panel mt-8 p-6">
              <p className="text-ui text-mist">{piece.status === "listing" ? "Going up on the market. This takes a minute." : left > 0 ? `${left} of ${piece.editions} left` : "Sold out"}</p>
              <p className="mt-1 font-display text-display font-semibold">{usdc(piece.priceUsdc)}</p>
              <p className="mt-4 text-mist">Your piece. {piece.sold} sold so far, and 95% of each sale comes to you.</p>
              {piece.nextName && (
                <p className="mt-3 text-ui text-mist">
                  The next buyer gets <span className="font-mono text-meta text-gold">{piece.nextName}</span>
                </p>
              )}
            </div>
          ) : (
            <BuyBox piece={piece} left={left} onBought={load} />
          )}

          {piece.holds && piece.names.length > 0 && !piece.mine && (
            <div className="mt-8">
              <p className="text-ui font-semibold text-paper">Editions sold so far</p>
              <ul className="mt-2 space-y-1">
                {piece.names.map((n) => (
                  <li key={n}>
                    <ExternalLink href={`https://sepolia.app.ens.domains/${n}`} className="font-mono text-meta">
                      {n}
                    </ExternalLink>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-10 space-y-2 border-t border-edge pt-6 text-ui text-mist">
            <p>Each edition is its own ENS name, minted to you with no expiry. You can give it away, and access moves with it.</p>
            <p>The commons fund pays for dreams for people who are out of credit.</p>
            <p className="flex flex-wrap gap-x-5 gap-y-1 pt-2">
              <ExternalLink href={piece.proof.market}>NightMarket on Sepolia</ExternalLink>
              {piece.proof.arkiv && <ExternalLink href={piece.proof.arkiv}>The listing on Arkiv</ExternalLink>}
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

function BuyBox({ piece, left, onBought }: { piece: PieceView; left: number; onBought: () => void }) {
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
      setError(plainError((e as Error).message.split("\n")[0]));
    } finally {
      setBusy(false);
    }
  }

  const short = balance !== null && balance < piece.priceUsdc;
  const status = piece.status === "listing" ? "Going up on the market. This takes a minute." : left > 0 ? `Edition ${piece.sold + 1} of ${piece.editions}` : "Sold out";

  return (
    <div className="panel mt-8 p-6">
      <p className="text-ui font-semibold text-mist">{status}</p>
      <p className="mt-1 font-display text-display font-semibold">{usdc(piece.priceUsdc)}</p>

      <dl className="mt-5 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 border-y border-edge py-4 text-ui">
        <dt className="text-mist">To the dreamer, 95%</dt>
        <dd className="text-right font-semibold tabular-nums text-paper">{usdc(piece.priceUsdc * 0.95)}</dd>
        <dt className="text-mist">To the commons fund, 5%</dt>
        <dd className="text-right font-semibold tabular-nums text-paper">{usdc(piece.priceUsdc * 0.05)}</dd>
      </dl>

      {done ? (
        <div className="appear mt-5 rounded-2xl border border-gold/60 bg-gold/10 p-4">
          <p className="font-display text-title font-semibold">It&rsquo;s yours</p>
          {done.map((n) => (
            <ExternalLink key={n} href={`https://sepolia.app.ens.domains/${n}`} className="mt-1 font-mono text-meta">
              {n}
            </ExternalLink>
          ))}
        </div>
      ) : (
        <>
          {piece.nextName && (
            <p className="mt-5 text-mist">
              You get <span className="font-mono text-ui text-gold">{piece.nextName}</span>, which opens the full piece. It&rsquo;s minted on ENS the moment you buy.
            </p>
          )}
          {!wallet.address ? (
            <p className="mt-5 text-mist">
              <Link href="/" className="font-semibold text-gold underline decoration-gold/30 underline-offset-4">
                Sign in with email or Google
              </Link>{" "}
              to buy. You&rsquo;ll get a wallet with some test money in it.
            </p>
          ) : (
            piece.open && (
              <>
                <button onClick={buy} disabled={busy || short} className="btn btn-gold btn-lg mt-6 w-full">
                  {busy ? "Confirm in your wallet…" : `Pay ${usdc(piece.priceUsdc)}`}
                </button>
                <p className="mt-3 text-meta text-dim">
                  {balance === null ? "Checking your USDC…" : `You have ${usdc(balance)} on Sepolia.`}
                  {short && (
                    <>
                      {" "}
                      Get test USDC at{" "}
                      <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="text-gold underline">
                        faucet.circle.com
                      </a>{" "}
                      (Ethereum Sepolia).
                    </>
                  )}
                </p>
              </>
            )
          )}
        </>
      )}
      {error && <p className="mt-3 text-ui text-danger">{error}</p>}
    </div>
  );
}
