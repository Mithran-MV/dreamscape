"use client";
// Offers to tap the phone when the painting is ready. Shown only where Web Push works;
// on an iPhone that means Dreamscape was added to the Home Screen.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

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

export function NotifyButton() {
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

  if (state === "hidden") return null;
  if (state === "on") return <p className="mt-3 text-xs text-dim">We&rsquo;ll tap your phone when it&rsquo;s on the wall.</p>;
  if (state === "blocked") return <p className="mt-3 text-xs text-dim">Notifications are blocked for Dreamscape in this browser&rsquo;s settings.</p>;
  return (
    <div className="mt-3">
      <button onClick={turnOn} disabled={state === "busy"} className="rounded-full border border-line px-3.5 py-1.5 text-xs text-mist hover:border-gold disabled:opacity-60">
        {state === "busy" ? "Asking…" : "Tell me when it’s painted"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
