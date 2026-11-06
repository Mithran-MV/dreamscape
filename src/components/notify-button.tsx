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

// explain: say why when this browser can't take notifications, instead of showing nothing (the Settings page).
export function NotifyButton({ explain = false }: { explain?: boolean }) {
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
