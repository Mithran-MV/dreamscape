// Browser-side calls to the app's own API.

export type DreamSummary = {
  id: string;
  day: number;
  createdAt: number;
  status: string;
  title: string | null;
  feeling: string | null;
  stored: boolean;
  anchored: boolean;
};

export type Trace = { step: string; model: string; request_id: string | null; provider: string | null; tee_verified: number | null; cost_usd: number | null; ms: number };

export type DreamDetail = {
  id: string;
  day: number;
  createdAt: number;
  status: string;
  error: string | null;
  inputKind: "voice" | "text";
  transcript: string | null;
  title: string | null;
  tags: { themes: string[]; people: string[]; places: string[]; objects: string[]; scene: string } | null;
  feeling: string | null;
  suggestedFeeling: string | null;
  proof: {
    traces: Trace[];
    storage: { what: string; root: string; link: string }[];
    registry: { id: number; tx: string; link: string } | null;
  };
};

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  session: () => fetch("/api/session").then((r) => json<{ user: { handle: string } | null }>(r)),
  signIn: (handle: string, passphrase: string) =>
    fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle, passphrase }) }).then((r) => json<{ handle: string }>(r)),
  dreams: () => fetch("/api/dreams").then((r) => json<{ dreams: DreamSummary[] }>(r)),
  dream: (id: string) => fetch(`/api/dreams/${id}`).then((r) => json<DreamDetail>(r)),
  pushKey: () => fetch("/api/push").then((r) => json<{ publicKey: string }>(r)),
  pushSubscribe: (sub: PushSubscriptionJSON) =>
    fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) }).then((r) => json<{ ok: true }>(r)),
  tell: (form: FormData) => fetch("/api/dreams", { method: "POST", body: form }).then((r) => json<{ id: string }>(r)),
};

export const portraitUrl = (id: string) => `/api/dreams/${id}/media/portrait`;
export const voiceUrl = (id: string) => `/api/dreams/${id}/media/voice`;
export const PAINTED = new Set(["painted", "storing", "done"]);
