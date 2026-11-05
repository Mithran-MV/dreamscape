"use client";
// The morning screen: hold to tell a dream, type anything you'd rather write, tap how it felt, done.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { FeelingChips } from "@/components/ui";

function pickMime() {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

export default function Tell() {
  const router = useRouter();
  const [micOff, setMicOff] = useState(false);
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center px-6 pb-10 pt-8 text-center">
      <div className="flex w-full items-center justify-between">
        <Link href="/" className="text-sm text-dim">← Gallery</Link>
      </div>

      <h1 className="mt-10 font-display text-3xl">Before it fades:<br /><em className="text-gold">what did you dream?</em></h1>

      {!micOff && (
        <div className="mt-12 flex flex-col items-center">
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
            className={`flex h-44 w-44 select-none items-center justify-center rounded-full border-2 text-lg font-medium touch-none ${
              recording ? "breathe border-gold bg-gold text-gold-ink" : "border-gold/60 bg-card text-gold"
            }`}
          >
            {recording ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : clip ? "Hold to redo" : "Hold to tell"}
          </button>
          <p className="mt-4 text-sm text-dim">{recording ? "Let go when you're done." : clip ? "Got it. Listen back, or keep it." : "Hold the button and talk. Ten seconds is plenty."}</p>
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
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-dim">How did it feel?</p>
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
    </main>
  );
}
