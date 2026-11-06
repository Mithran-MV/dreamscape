"use client";
// Offers to tap the phone when the painting is ready. Shown only where Web Push works;
// on an iPhone that means Dreamscape was added to the Home Screen. In the phone app the
// phone schedules the morning reminder itself instead (lib/native.ts).
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useClientValue } from "@/lib/use-client-value";
import { inApp, remindEachMorning, reminderOn, stopReminder } from "@/lib/native";

type State = "hidden" | "off" | "on" | "blocked" | "busy";

function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function currentState(): Promise<State> {
  if (!pushSupported()) return "hidden";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

// The push service wants the server's public key as raw bytes.
function keyBytes(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// explain: say why when this browser can't take notifications, instead of showing nothing (the Settings page).
// The phone app only has the morning reminder, so it shows nothing on a dream's page.
export function NotifyButton({ explain = false }: { explain?: boolean }) {
  const app = useClientValue(inApp, false);
  if (app) return explain ? <MorningReminder /> : null;
  return <WebPushButton explain={explain} />;
}

const clock = (minute: number) => new Date(2000, 0, 1, Math.floor(minute / 60), minute % 60).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function MorningReminder() {
  const [state, setState] = useState<"loading" | "off" | "on" | "blocked" | "busy">("loading");
  const [wake, setWake] = useState<number | null>(null);

  useEffect(() => {
    reminderOn().then((on) => setState(on ? "on" : "off"), () => setState("off"));
    api.mornings().then((m) => setWake(m.wake), () => undefined);
  }, []);

  async function turnOn() {
    setState("busy");
    const minute = wake ?? (await api.mornings()).wake;
    setState((await remindEachMorning(minute).catch(() => false)) ? "on" : "blocked");
  }

  async function turnOff() {
    setState("busy");
    await stopReminder().catch(() => undefined);
    setState("off");
  }

  if (state === "loading") return <span className="text-ui text-dim">Loading…</span>;
  if (state === "blocked") return <p className="text-ui text-dim">Your phone blocks notifications from Dreamscape. You can allow them in its settings.</p>;
  if (state === "on") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-ui text-dim">Each morning{wake !== null && ` at ${clock(wake)}`}.</p>
        <button onClick={turnOff} className="btn btn-line btn-sm">
          Turn off
        </button>
      </div>
    );
  }
  return (
    <button onClick={turnOn} disabled={state === "busy"} className="btn btn-line btn-sm">
      {state === "busy" ? "Asking…" : "Remind me each morning"}
    </button>
  );
}

function WebPushButton({ explain }: { explain: boolean }) {
  const [state, setState] = useState<State>("hidden");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    currentState().then(setState, () => setState("hidden"));
  }, []);

  async function turnOn() {
    setState("busy");
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "blocked" : "off");
      const { publicKey } = await api.pushKey();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      await api.pushSubscribe(sub.toJSON());
      setState("on");
    } catch (e) {
      setError((e as Error).message);
      setState("off");
    }
  }

  if (state === "hidden") {
    return explain ? <p className="text-ui text-dim">This browser can&rsquo;t receive notifications from Dreamscape. On an iPhone, add Dreamscape to your Home Screen first.</p> : null;
  }
  if (state === "on") return <p className="mt-4 text-ui text-dim">We&rsquo;ll tap your phone when it&rsquo;s on the wall.</p>;
  if (state === "blocked") return <p className="mt-4 text-ui text-dim">This browser blocks notifications from Dreamscape. You can allow them in its settings.</p>;
  return (
    <div className="mt-4">
      <button onClick={turnOn} disabled={state === "busy"} className="btn btn-line btn-sm">
        {state === "busy" ? "Asking…" : "Tell me when it’s painted"}
      </button>
      {error && <p className="mt-2 text-meta text-danger">{error}</p>}
    </div>
  );
}
