// Browser-side calls for family passes and visits.
import type { Tx } from "@/lib/wallet";

export type PassScope = "gallery" | "published";
export type PassState = "granting" | "failed" | "active" | "expired";

export type GrantedPass = { id: string; handle: string; scope: PassScope; state: PassState; name: string; link: string; expiresAt: number | null };
export type HeldPass = { handle: string; scope: PassScope; expiresAt: number | null };
export type Passes = { ready: { wallet: boolean; name: boolean }; granted: GrantedPass[]; held: HeldPass[] };

export type Door = {
  knocks: { key: string; handle: string; scope: PassScope; at: number | null }[];
  inside: { key: string; handle: string; scope: PassScope; endsAt: number }[];
};

export type VisitorDream = { id: string; day: number; title: string | null; feeling: string | null; saga: string | null; words: string | null };
export type VisitorComic = {
  id: string;
  day: number;
  title: string | null;
  saga: string | null;
  feeling: string | null;
  script: { title: string; panels: { dialogue: { who: string; text: string }[]; caption: string | null }[] };
};

// endsAt is on this browser's clock; fetchedAt is when the answer arrived.
export type VisitView =
  | { state: "own" | "no-pass" | "granting" | "outside" | "waiting" | "ended"; handle: string }
  | { state: "inside"; handle: string; scope: PassScope; endsAt: number; fetchedAt: number; dreams: VisitorDream[]; comics: VisitorComic[] };

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const visitsApi = {
  passes: () => fetch("/api/passes").then((r) => json<Passes>(r)),
  grant: (handle: string, scope: PassScope) => post("/api/passes", { handle, scope }).then((r) => json<{ pass: { id: string; name: string } }>(r)),
  retry: (id: string) => post(`/api/passes/${id}`, { action: "retry" }).then((r) => json<{ ok: true }>(r)),
  revokeTx: (id: string) => post(`/api/passes/${id}`, { action: "revoke" }).then((r) => json<{ tx?: Tx; revoked?: true }>(r)),
  revoked: (id: string, hash?: string) => post(`/api/passes/${id}`, { action: "revoked", hash }).then((r) => json<{ revoked: true }>(r)),
  door: () => fetch("/api/visits").then((r) => json<Door>(r)),
  letIn: (knock: string, length: "10m" | "1h") => post("/api/visits", { knock, length }).then((r) => json<{ key: string; endsAt: number }>(r)),
  knock: (handle: string) => post("/api/visits/knock", { handle }).then((r) => json<{ key: string }>(r)),
  visit: (handle: string) =>
    fetch(`/api/g/${encodeURIComponent(handle)}`, { cache: "no-store" })
      .then((r) => json<VisitView & { now?: number }>(r))
      .then((view): VisitView => {
        if (view.state !== "inside") return { state: view.state, handle: view.handle };
        // Move the server's end time onto this browser's clock, so the countdown is right even if the clocks differ.
        const fetchedAt = Date.now();
        return { ...view, endsAt: view.endsAt - (view.now ?? fetchedAt) + fetchedAt, fetchedAt };
      }),
};

export const visitPortraitUrl = (handle: string, id: string) => `/api/g/${encodeURIComponent(handle)}/dream/${id}`;
export const visitPanelUrl = (handle: string, id: string, n: number) => `/api/g/${encodeURIComponent(handle)}/panel/${id}/${n}`;
