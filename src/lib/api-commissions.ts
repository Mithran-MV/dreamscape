// Browser-side calls for vendor agents and commissions.
import type { Hex } from "viem";

export type AgentStall = {
  label: string | null;
  ens: string;
  style: string;
  services: string[];
  fromPriceUsdc: number;
  prices: Record<string, unknown> | null;
  lastBeat: number;
  stall: string;
};

export type AgentView = {
  label: string;
  name: string;
  owner: { address: string | null; holder: string; gallery: string | null };
  agent: string;
  records: { context: string | null; web: string | null; prices: string | null };
  priceUsdc: number | null;
  styles: { key: string; label: string }[];
  open: boolean;
  proof: { ens: string; resolver: string; market: string; stall: string | null; addrAttempt: string | null; webAttempt: string | null };
};

export type CommissionStatus = "awaiting" | "paid" | "claimed" | "making" | "delivered" | "late" | "refunded";

export type CommissionView = {
  id: Hex;
  agent: string;
  agentName: string;
  status: CommissionStatus;
  style: string;
  styleLabel: string;
  note: string | null;
  name: string;
  priceUsdc: number;
  deadline: number;
  error: string | null;
  holds: boolean;
  file: string | null;
  refund: { to: `0x${string}`; data: Hex } | null;
  proof: { paid: string | null; request: string | null; claim: string | null; storage: string | null; delivered: string | null; name: string | null };
};

export type NewCommission = { id: Hex; txs: { to: `0x${string}`; data: Hex }[]; priceUsdc: number; name: string; deadline: number };

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const agents = {
  list: () => fetch("/api/agents").then((r) => json<{ agents: AgentStall[] }>(r)),
  get: (label: string) => fetch(`/api/agents/${encodeURIComponent(label)}`).then((r) => (r.status === 404 ? null : json<AgentView>(r))),
};

export const commissions = {
  mine: (agent: string) => fetch(`/api/commissions?agent=${encodeURIComponent(agent)}`).then((r) => json<{ commissions: CommissionView[] }>(r)),
  get: (id: string) => fetch(`/api/commissions/${id}`).then((r) => (r.status === 404 ? null : json<CommissionView>(r))),
  create: (body: { agent: string; style: string; note: string }) => post("/api/commissions", body).then((r) => json<NewCommission>(r)),
  paid: (id: string, tx: string) => post(`/api/commissions/${id}/paid`, { tx }).then((r) => json<{ status: CommissionStatus }>(r)),
};

// Still on its way: the page keeps looking until it's delivered or over.
export const inProgress = (status: CommissionStatus) => status === "awaiting" || status === "paid" || status === "claimed" || status === "making";
