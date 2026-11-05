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

export type EpisodeSummary = { id: string; day: number; status: string; title: string | null; saga: string | null; feeling: string | null; error: string | null };

export type EpisodeDetail = EpisodeSummary & {
  script: { title: string; panels: { scene: string; dialogue: { who: string; text: string }[]; caption: string | null }[] } | null;
  dreamIds: string[];
  traces: Trace[];
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
  retry: (id: string) => fetch(`/api/dreams/${id}/retry`, { method: "POST" }).then((r) => json<{ ok: true }>(r)),
  episodes: () => fetch("/api/episodes").then((r) => json<{ episodes: EpisodeSummary[] }>(r)),
  episode: (id: string) => fetch(`/api/episodes/${id}`).then((r) => json<EpisodeDetail>(r)),
  decide: (id: string, action: "publish" | "discard") =>
    fetch(`/api/episodes/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).then((r) => json<{ ok: true }>(r)),
  nightly: () => fetch("/api/nightly").then((r) => json<{ optedIn: boolean; spentTodayUsd: number }>(r)),
  night: (action: "run" | "opt-in" | "opt-out") =>
    fetch("/api/nightly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).then((r) => json<{ ok: true }>(r)),
  tell: (form: FormData) => fetch("/api/dreams", { method: "POST", body: form }).then((r) => json<{ id: string }>(r)),
};

export const portraitUrl = (id: string) => `/api/dreams/${id}/media/portrait`;
export const panelUrl = (id: string, n: number) => `/api/episodes/${id}/panel/${n}`;
export const voiceUrl = (id: string) => `/api/dreams/${id}/media/voice`;
export const PAINTED = new Set(["painted", "storing", "done"]);
