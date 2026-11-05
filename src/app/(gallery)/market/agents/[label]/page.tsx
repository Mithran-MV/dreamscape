"use client";
// One vendor agent: its records on ENS, the commission form, and where each commission stands.
// Whoever holds a delivered commission's name sees the piece here.
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { createPublicClient, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";
import { agents, commissions, inProgress, type AgentView, type CommissionStatus, type CommissionView } from "@/lib/api-commissions";
import { usdc } from "@/lib/api-market";
import { usePrivyWallet } from "@/lib/wallet";
import { Frame } from "@/components/ui";
import { TabBar } from "@/components/tab-bar";

const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const chain = createPublicClient({ chain: sepolia, transport: http("https://ethereum-sepolia-rpc.publicnode.com") });
const NOTE_MAX = 280;

export default function AgentPage() {
  return (
    <Suspense fallback={<main className="flex-1" />}>
      <AgentView />
    </Suspense>
  );
}

const short = (address: string | null) => (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "none");
const titleOf = (label: string) => label.charAt(0).toUpperCase() + label.slice(1).replace(/-/g, " ");

function AgentView() {
  const { label } = useParams<{ label: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const [agent, setAgent] = useState<AgentView | null | undefined>(undefined);
  const [mine, setMine] = useState<CommissionView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const current = search.get("c");

  const loadMine = useCallback(() => commissions.mine(label).then((r) => setMine(r.commissions), () => undefined), [label]);
  useEffect(() => {
    agents.get(label).then(setAgent, (e: Error) => setError(e.message));
    loadMine();
  }, [label, loadMine]);

  if (agent === undefined && !error) return <main className="flex-1" />;
  if (!agent || error) {
    return (
      <main className="p-8 text-center text-mist">
        {error ?? "This agent isn't on the market."} <Link href="/market/agents" className="text-gold">Back to commissions</Link>
      </main>
    );
  }

  // The one asked for, else the one being made, else the newest that was paid for.
  const shown = current ?? (mine.find((c) => inProgress(c.status) && c.status !== "awaiting") ?? mine.find((c) => c.status !== "awaiting"))?.id ?? null;
  const open = (id: string) => router.replace(`/market/agents/${label}?c=${id}`, { scroll: false });
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 pb-28 pt-6">
      <Link href="/market/agents" className="text-sm text-dim">← Commissions</Link>
      <div className="mt-6 grid gap-8 md:grid-cols-[1.2fr_1fr]">
        <div>
          <h1 className="font-display text-4xl leading-tight">{titleOf(agent.label)}</h1>
          <p className="mt-1 truncate font-mono text-xs text-gold">{agent.name}</p>
          {agent.records.context && <p className="mt-4 text-mist">{agent.records.context}</p>}
          {shown && <Status id={shown} onChange={loadMine} />}
          <CommissionForm
            agent={agent}
            onStarted={(id) => {
              open(id);
              loadMine();
            }}
          />
          {mine.length > 0 && (
            <section className="mt-10">
              <h2 className="font-display text-xl">Your commissions</h2>
              <ul className="mt-3 space-y-2">
                {mine.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => open(c.id)} className={`w-full rounded-xl border px-4 py-3 text-left text-sm ${c.id === shown ? "border-gold" : "border-edge hover:border-line"} bg-card/70`}>
                      <span className="block truncate font-mono text-xs text-gold">{c.name}</span>
                      <span className="mt-0.5 block text-mist">
                        {c.styleLabel}, {usdc(c.priceUsdc)}. {STATUS_LINE[c.status]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <Records agent={agent} />
      </div>
      <TabBar active="market" />
    </main>
  );
}

function Records({ agent }: { agent: AgentView }) {
  const rows: [string, React.ReactNode][] = [
    ["addr", <span key="addr">{agent.owner.gallery ?? short(agent.owner.address)} <span className="font-mono text-xs text-dim">{short(agent.owner.address)}</span></span>],
    ["agent-context", agent.records.context ?? "none"],
    [
      "agent-endpoint[web]",
      agent.records.web ? (
        <a key="web" href={agent.records.web} className="break-all text-gold">{agent.records.web}</a>
      ) : (
        "none"
      ),
    ],
    ["prices", <span key="prices" className="font-mono text-xs">{agent.records.prices ?? "none"}</span>],
  ];
  return (
    <section className="self-start rounded-2xl border border-edge bg-card/70 p-5">
      <h2 className="font-display text-xl">On ENS</h2>
      <p className="mt-1 text-sm text-dim">Records on the agent&rsquo;s own resolver. Its owner, a person, gets paid and holds the name.</p>
      <dl className="mt-4 space-y-3 text-sm">
        {rows.map(([key, value]) => (
          <div key={key}>
            <dt className="font-mono text-[11px] text-dim">{key}</dt>
            <dd className="mt-0.5 text-paper">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 space-y-2 border-t border-edge pt-4 text-sm text-mist">
        <p>The agent&rsquo;s own key may change only its context and its prices.</p>
        {agent.proof.addrAttempt && (
          <p>
            Its try at changing who gets paid was refused: <span className="font-mono text-xs text-paper">{agent.proof.addrAttempt}</span>
          </p>
        )}
        {agent.proof.webAttempt && (
          <p>
            So was its try at changing its web address: <span className="font-mono text-xs text-paper">{agent.proof.webAttempt}</span>
          </p>
        )}
        <p className="pt-2">
          <a href={agent.proof.ens} target="_blank" rel="noreferrer" className="text-gold">The name on ENS ↗</a>
          <a href={agent.proof.resolver} target="_blank" rel="noreferrer" className="ml-4 text-gold">Its resolver ↗</a>
          {agent.proof.stall && (
            <a href={agent.proof.stall} target="_blank" rel="noreferrer" className="ml-4 text-gold">Its stall on Arkiv ↗</a>
          )}
        </p>
      </div>
    </section>
  );
}

function CommissionForm({ agent, onStarted }: { agent: AgentView; onStarted: (id: string) => void }) {
  const wallet = usePrivyWallet();
  const [style, setStyle] = useState(agent.styles[0]?.key ?? "");
  const [note, setNote] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet.address) return;
    chain
      .readContract({ address: USDC, abi: parseAbi(["function balanceOf(address) view returns (uint256)"]), functionName: "balanceOf", args: [wallet.address as `0x${string}`] })
      .then((b) => setBalance(Number(b) / 1e6), () => setBalance(null));
  }, [wallet.address, busy]);

  if (!agent.open || agent.priceUsdc === null) {
    return <p className="mt-8 rounded-xl border border-edge bg-card/70 p-4 text-sm text-mist">This agent isn&rsquo;t taking commissions right now.</p>;
  }
  const price = agent.priceUsdc;
  const low = balance !== null && balance < price;

  async function pay() {
    setBusy("Getting your commission ready…");
    setError(null);
    try {
      const made = await commissions.create({ agent: agent.label, style, note });
      setBusy("Confirm in your wallet…");
      const hashes = await wallet.send(made.txs);
      setBusy("Checking your payment…");
      // Once paid, the escrow is on-chain, so the status shows even if this report doesn't get through.
      try {
        await commissions.paid(made.id, hashes[hashes.length - 1]);
      } finally {
        setNote("");
        onStarted(made.id);
      }
    } catch (e) {
      setError((e as Error).message.split("\n")[0]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <form
      className="mt-8 rounded-2xl border border-edge bg-card/70 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        pay();
      }}
    >
      <h2 className="font-display text-xl">Commission a portrait</h2>
      <p className="mt-4 text-sm text-mist">Pick a style</p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Style">
        {agent.styles.map((s) => (
          <button
            key={s.key}
            type="button"
            role="radio"
            aria-checked={style === s.key}
            onClick={() => setStyle(s.key)}
            className={`rounded-full border px-3.5 py-1.5 text-sm ${style === s.key ? "border-gold bg-gold text-gold-ink" : "border-line text-mist hover:border-gold"}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <label className="mt-5 block text-sm text-mist">
        Who or what should it paint?
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
          rows={3}
          placeholder="My grandmother in her garden, with the cat on her lap"
          className="mt-2 block w-full resize-none rounded-xl border border-line bg-card px-3 py-2 text-paper placeholder:text-dim focus:border-gold focus:outline-none"
        />
      </label>
      <p className="mt-1 flex justify-between text-xs text-dim">
        <span>Only the sealed painter reads this. It never goes on Arkiv or ENS.</span>
        <span>{note.length} of {NOTE_MAX}</span>
      </p>

      {!wallet.address ? (
        <p className="mt-5 text-sm text-mist">
          <Link href="/" className="text-gold">Sign in with email or Google</Link> to commission a piece. You&rsquo;ll get a wallet with a little test money in it.
        </p>
      ) : (
        <>
          <button disabled={Boolean(busy) || low || note.trim().length < 3 || !style} className="mt-5 w-full rounded-xl bg-gold px-4 py-3.5 font-medium text-gold-ink disabled:opacity-50">
            {busy ?? `Pay ${usdc(price)} into escrow`}
          </button>
          <p className="mt-2 text-xs text-dim">
            {balance === null ? "Checking your USDC…" : `You have ${usdc(balance)} on Sepolia.`}
            {low && (
              <>
                {" "}
                Get test USDC at <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="text-gold">faucet.circle.com</a> (Ethereum Sepolia).
              </>
            )}
          </p>
        </>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <p className="mt-4 text-xs text-dim">The agent has 48 hours. If it doesn&rsquo;t deliver, you take your USDC back. When it does, 95% goes to its owner and 5% to the commons.</p>
    </form>
  );
}

const STEPS: { key: CommissionStatus; label: string }[] = [
  { key: "paid", label: "Paid" },
  { key: "claimed", label: "Claimed" },
  { key: "making", label: "Making it" },
  { key: "delivered", label: "Delivered" },
];

const STATUS_LINE: Record<CommissionStatus, string> = {
  awaiting: "Waiting for your payment.",
  paid: "Paid into escrow. Waiting for the agent to claim it.",
  claimed: "The agent claimed it on Arkiv.",
  making: "The agent is painting it.",
  delivered: "Delivered.",
  late: "The agent missed its deadline. You can take your USDC back.",
  refunded: "Refunded.",
};

function Status({ id, onChange }: { id: string; onChange: () => void }) {
  const wallet = usePrivyWallet();
  const [c, setC] = useState<CommissionView | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => commissions.get(id).then(setC, () => setC(null)), [id]);

  useEffect(() => {
    load();
  }, [load]);
  // While the agent works, look again every few seconds.
  useEffect(() => {
    if (!c || !inProgress(c.status)) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [c, load]);
  useEffect(() => {
    if (c?.status === "delivered" || c?.status === "refunded") onChange();
  }, [c?.status, onChange]);

  if (!c) return null;
  const reached = STEPS.findIndex((s) => s.key === c.status);

  async function refund() {
    if (!c?.refund) return;
    setBusy(true);
    setError(null);
    try {
      await wallet.send([c.refund]);
      await load();
    } catch (e) {
      setError((e as Error).message.split("\n")[0]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-gold/40 bg-card/70 p-5">
      <p className="truncate font-mono text-xs text-gold">{c.name}</p>
      {reached >= 0 && (
        <ol className="mt-4 grid grid-cols-4 gap-2">
          {STEPS.map((s, i) => (
            <li key={s.key} className="flex flex-col items-center gap-1.5 text-center text-xs">
              <span
                aria-hidden
                className={`h-3 w-3 rounded-full border ${i < reached || c.status === "delivered" ? "border-gold bg-gold" : i === reached ? "animate-pulse border-gold bg-gold/40" : "border-line"}`}
              />
              <span className={i <= reached ? "text-paper" : "text-dim"}>{s.label}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-4 text-sm text-mist">{STATUS_LINE[c.status]}</p>
      {c.error && inProgress(c.status) && <p className="mt-1 text-xs text-dim">{c.error.includes("0G") ? "0G is busy. The agent will try again by itself." : c.error}</p>}
      {c.note && <p className="mt-3 text-sm text-dim">{c.styleLabel}: &ldquo;{c.note}&rdquo;</p>}

      {c.status === "delivered" && c.holds && c.file && (
        <div className="mt-5">
          <Frame src={c.file} alt={`A portrait in ${c.styleLabel.toLowerCase()}`} />
          <p className="mt-3 text-sm text-mist">
            It&rsquo;s yours: a one-of-one name with no expiry, and only its holder can open this piece.{" "}
            {c.proof.name && (
              <a href={c.proof.name} target="_blank" rel="noreferrer" className="text-gold">See it on ENS ↗</a>
            )}
          </p>
        </div>
      )}
      {c.status === "delivered" && !c.holds && <p className="mt-3 text-sm text-dim">The name has moved to someone else, so the piece opens for them now.</p>}

      {c.refund && (
        <button onClick={refund} disabled={busy} className="mt-4 rounded-full bg-gold px-5 py-2 font-medium text-gold-ink disabled:opacity-60">
          {busy ? "Confirm in your wallet…" : `Take back ${usdc(c.priceUsdc)}`}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {c.proof.paid && <a href={c.proof.paid} target="_blank" rel="noreferrer" className="text-gold">Payment ↗</a>}
        {c.proof.request && <a href={c.proof.request} target="_blank" rel="noreferrer" className="text-gold">Request on Arkiv ↗</a>}
        {c.proof.claim && <a href={c.proof.claim} target="_blank" rel="noreferrer" className="text-gold">Claim on Arkiv ↗</a>}
        {c.proof.storage && <a href={c.proof.storage} target="_blank" rel="noreferrer" className="text-gold">Encrypted on 0G Storage ↗</a>}
        {c.proof.delivered && <a href={c.proof.delivered} target="_blank" rel="noreferrer" className="text-gold">Delivery ↗</a>}
      </p>
    </section>
  );
}
