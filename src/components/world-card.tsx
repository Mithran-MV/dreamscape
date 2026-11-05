"use client";
// The World Dream on the gallery: what everybody dreamed, and the dreamer's own circle.
import { useCallback, useEffect, useState } from "react";
import { api, worldImageUrl, type WorldState, type WorldSummary } from "@/lib/api";
import { Frame } from "@/components/ui";

function Painting({ w, label }: { w: WorldSummary; label: string }) {
  return (
    <figure className="grid items-center gap-5 sm:grid-cols-[200px_1fr]">
      <Frame src={worldImageUrl(w.id)} glow={w.feeling} alt={label} />
      <figcaption>
        <p className="text-sm text-gold">{label}</p>
        <p className="mt-1 font-display text-xl leading-snug">{w.sentence}</p>
      </figcaption>
    </figure>
  );
}

export function WorldCard() {
  const [state, setState] = useState<WorldState | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api.world().then(setState, (e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);
  const act = (action: "join" | "leave" | "paint", c?: string) => api.worldAction(action, c).then(load, (e) => setError(e.message));

  if (!state) return null;
  const { world, circle } = state;
  return (
    <section className="mt-14">
      <h2 className="font-display text-2xl">The World Dream</h2>
      <p className="mt-1 max-w-lg text-sm text-mist">One painting a day from everyone&rsquo;s themes and feelings, never their words. A theme only counts once five dreamers share it.</p>
      <div className="mt-5 space-y-6">
        {world ? <Painting w={world} label="Everyone" /> : <p className="text-mist">Tonight&rsquo;s World Dream is painted at 23:30 UTC.</p>}
        {circle?.latest && <Painting w={circle.latest} label={circle.name} />}
      </div>
      <div className="mt-5 text-sm">
        {circle ? (
          <div className="flex flex-wrap items-center gap-3 text-mist">
            <span>
              Your circle: <span className="text-paper">{circle.name}</span>. {circle.today} of {circle.needed} dreamers so far today.
            </span>
            {circle.today >= circle.needed ? (
              <button onClick={() => act("paint")} className="rounded-full border border-line px-4 py-2 hover:border-gold">
                Paint {circle.name}&rsquo;s dream now
              </button>
            ) : (
              <span className="text-dim">It can be painted once {circle.needed - circle.today} more dream today.</span>
            )}
            <button onClick={() => act("leave")} className="text-dim">Leave</button>
          </div>
        ) : (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              act("join", code);
            }}
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Circle code, like ethglobal-mumbai"
              className="w-64 rounded-xl border border-line bg-card px-3 py-2 text-paper placeholder:text-dim focus:border-gold focus:outline-none"
            />
            <button className="rounded-full border border-line px-4 py-2 text-mist hover:border-gold">Join a circle</button>
          </form>
        )}
        {error && <p className="mt-2 text-danger">{error}</p>}
      </div>
    </section>
  );
}
