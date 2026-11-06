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
  moving: boolean;
};

export type Note = { kind: string; text: string; saga?: string };

export type Trace = {
  step: string;
  model: string;
  request_id: string | null;
  provider: string | null;
  tee_verified: number | null;
  cost_usd: number | null;
  ms: number;
  e2ee: string | null;
  res_key: string | null;
  stand_in?: string | null; // the default model this backup stood in for
};

export type DreamDetail = {
  id: string;
  day: number;
  createdAt: number;
  status: string;
  error: string | null;
  inputKind: "voice" | "text";
  transcript: string | null;
  note: string | null;
  title: string | null;
  tags: { themes: string[]; people: string[]; places: string[]; objects: string[]; scene: string } | null;
  feeling: string | null;
  suggestedFeeling: string | null;
  saga: string | null;
  video: "rendering" | "done" | "failed" | null;
  notes: Note[];
  proof: {
    traces: Trace[];
    storage: { what: string; root: string; link: string }[];
    registry: { id: number; tx: string; link: string } | null;
    ens: {
      name: string;
      gallery: string;
      galleryLink: string;
      tx: string;
      txLink: string;
      records: { root: string | null; saga: string | null; date: string | null; scope: string | null } | null;
      current: boolean;
    } | null;
  };
};

export type EpisodeSummary = { id: string; day: number; status: string; title: string | null; saga: string | null; feeling: string | null; error: string | null };

export type EpisodeDetail = EpisodeSummary & {
  script: { title: string; panels: { scene: string; dialogue: { who: string; text: string }[]; caption: string | null }[] } | null;
  dreamIds: string[];
  traces: Trace[];
};

export type WorldSummary = { id: string; day: number; sentence: string; dreamers: number; feeling: string | null };
export type WorldState = {
  world: WorldSummary | null;
  circle: { code: string; name: string; latest: WorldSummary | null; today: number; needed: number } | null;
};

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export type Star = { day: number; kind: "dream" | "feeling" | "nothing" | null; feeling: string | null };
export type Slide = { image?: string; kicker?: string; title?: string; text?: string; quote?: boolean; feeling?: string | null };
export type Memory = { id: string; kind: string; title: string; subtitle: string; cover: string | null; feeling: string | null; slides: Slide[] };
export type Mornings = {
  today: number;
  keptToday: boolean;
  week: Star[];
  kept: number;
  constellation: "forming" | "tonight" | "painted";
  hidden: boolean;
  next: { title: string; at: number; left: number } | null;
  // The local minute of the day this dreamer usually keeps their morning.
  wake: number;
  memories: Memory[];
};

export type NightlyDrafts = {
  posters: { id: string; kind: "sky" | "week"; title: string; text: string | null; image: string; createdAt: number }[];
  portraits: { dreamId: string; title: string | null; video: string; image: string }[];
};

export const api = {
  session: () => fetch("/api/session").then((r) => json<{ user: { handle: string; wallet: string | null; ensName: string | null; naming: boolean } | null }>(r)),
  signOut: () => fetch("/api/session", { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),
  zeroGSignIn: (token: string, handle?: string) =>
    fetch("/api/session/zerog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, handle }) }).then((r) =>
      json<{ ok?: true; needsHandle?: true }>(r),
    ),
  signIn: (handle: string, passphrase: string) =>
    fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle, passphrase }) }).then((r) => json<{ handle: string }>(r)),
  nightlyDrafts: () => fetch("/api/drafts").then((r) => json<NightlyDrafts>(r)),
  decideDraft: (piece: "poster" | "portrait", id: string, action: "hang" | "let-go") =>
    fetch("/api/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ piece, id, action }) }).then((r) => json<NightlyDrafts>(r)),
  mornings: () => fetch(`/api/mornings?tz=${new Date().getTimezoneOffset()}`).then((r) => json<Mornings>(r)),
  hideStars: (hide: boolean) =>
    fetch("/api/mornings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hide }) }).then((r) => json<Mornings>(r)),
  keepMorning: (kind: "feeling" | "nothing", feeling?: string) =>
    fetch("/api/mornings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, feeling }) }).then((r) => json<Mornings>(r)),
  dreams: () =>
    fetch("/api/dreams").then((r) =>
      json<{ dreams: DreamSummary[]; notes: Note[]; aiNote: { text: string; theme: string | null; model: string; today: boolean } | null; sagaTonight: string | null }>(r),
    ),
  sagaTonight: (theme: string) =>
    fetch("/api/mornings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saga: theme }) }).then((r) => json<{ sagaTonight: string }>(r)),
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
  world: () => fetch("/api/world").then((r) => json<WorldState>(r)),
  worldAction: (action: "join" | "leave" | "paint", code?: string) =>
    fetch("/api/world", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, code }) }).then((r) => json<{ ok: true }>(r)),
  tell: (form: FormData) => fetch("/api/dreams", { method: "POST", body: form }).then((r) => json<{ id: string }>(r)),
};

export const portraitUrl = (id: string) => `/api/dreams/${id}/media/portrait`;
export const panelUrl = (id: string, n: number) => `/api/episodes/${id}/panel/${n}`;
export const worldImageUrl = (id: string) => `/api/world/${id}/image`;
export const videoUrl = (id: string) => `/api/dreams/${id}/media/video`;
export const voiceUrl = (id: string) => `/api/dreams/${id}/media/voice`;
export const PAINTED = new Set(["painted", "storing", "done"]);
