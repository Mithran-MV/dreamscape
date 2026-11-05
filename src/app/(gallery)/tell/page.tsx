"use client";
// The morning screen: hold to tell a dream, type anything you'd rather write, tap how it felt, done.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { FeelingChips } from "@/components/ui";
import { useClientValue } from "@/lib/use-client-value";
import { TabBar } from "@/components/tab-bar";

function Mic() {
  return (
    <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}

// A sound wave while recording; the bars are fixed, so it reads as a voice without faking levels.
function Wave() {
  const bars = [4, 9, 6, 13, 18, 11, 16, 8, 14, 10, 5, 8];
  return (
    <svg viewBox="0 0 60 24" className="h-9 w-20" aria-hidden>
      {bars.map((h, i) => (
        <rect key={i} x={i * 5 + 1} y={12 - h / 2} width="2.2" height={h} rx="1.1" fill="currentColor" />
      ))}
    </svg>
  );
}

function pickMime() {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

export default function Tell() {
  const router = useRouter();
  const [micOff, setMicOff] = useState(false);
  const today = useClientValue(() => new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }), "");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [clip, setClip] = useState<Blob | null>(null);
  const [text, setText] = useState("");
  const [feeling, setFeeling] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setClip(new Blob(chunks.current, { type: rec.mimeType || "audio/webm" }));
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("The microphone isn't available here. Allow it, or type the dream below.");
      setMicOff(true);
    }
  }

  function stop() {
    if (!recorder.current || recorder.current.state === "inactive") return;
    recorder.current.stop();
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
  }

  async function keep() {
    setBusy(true);
    setError(null);
    const form = new FormData();
    if (clip) form.append("audio", clip, "dream");
    if (text.trim()) form.append("text", text.trim());
    if (feeling) form.append("feeling", feeling);
    try {
      const { id } = await api.tell(form);
      router.push(`/dream/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const ready = Boolean(clip) || text.trim().length >= 3;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center px-6 pb-28 pt-8 text-center sm:pb-10">
      <div className="flex w-full items-center justify-between">
        <Link href="/" className="text-sm text-dim">← Gallery</Link>
      </div>

      <div className="mt-8 w-full text-left">
        <p className="h-5 text-sm text-mist">{today}</p>
        <h1 className="mt-2 font-display text-4xl leading-[1.1]">
          Before it <em className="text-gold">fades</em>:<br />what did you dream?
        </h1>
      </div>

      {!micOff && (
        <div className="mt-12 flex flex-col items-center">
          <p className={`mb-4 h-6 font-mono text-xl text-gold ${recording ? "" : "invisible"}`} aria-live="polite">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </p>
          <button
            type="button"
            aria-label={recording ? "Release to stop" : "Hold to tell your dream"}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              start();
            }}
            onPointerUp={stop}
            onPointerCancel={stop}
            onContextMenu={(e) => e.preventDefault()}
            className={`sphere flex h-40 w-40 select-none items-center justify-center rounded-full text-gold-ink touch-none ${recording ? "listening" : ""}`}
          >
            {recording ? <Wave /> : <Mic />}
          </button>
          <p className="mt-5 font-medium text-paper">{recording ? "Let go when you're done" : clip ? "Hold to tell it again" : "Hold to tell it"}</p>
          <p className="mt-1 text-sm text-dim">{recording ? "Tell it any way it comes." : clip ? "Got it. Listen back, add words, or keep it." : "Ten seconds is plenty."}</p>
          {clip && !recording && <audio controls src={URL.createObjectURL(clip)} className="mt-4 w-full" />}
        </div>
      )}

      <label className="mt-8 block w-full text-left">
        <span className="text-sm text-mist">{clip ? "Anything to add in words?" : micOff ? "Write the dream" : "Or write it, or add to your voice note"}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="I was flying over my old school, and the roof turned into the sea…"
          className="mt-2 w-full rounded-2xl border border-line bg-card p-4 text-paper placeholder:text-dim focus:border-gold focus:outline-none"
        />
      </label>

      <div className="mt-10 w-full">
        <p className="mb-3 text-sm text-mist">How did it feel?</p>
        <FeelingChips value={feeling} onChange={setFeeling} />
      </div>

      <button
        type="button"
        disabled={!ready || busy || recording}
        onClick={keep}
        className="mt-10 w-full rounded-xl bg-gold px-4 py-3.5 font-medium text-gold-ink disabled:opacity-40"
      >
        {busy ? "Keeping it…" : "Keep this dream"}
      </button>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <p className="mt-6 text-xs text-dim">Only you can see it. It&rsquo;s painted by sealed AI on 0G and stored encrypted.</p>
      <TabBar active="today" />
    </main>
  );
}
