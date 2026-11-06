"use client";
// The morning screen: hold to tell a dream, type anything you'd rather write, tap how it felt, done.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { FeelingChips } from "@/components/ui";
import { useClientValue } from "@/lib/use-client-value";
import { AppShell } from "@/components/app-shell";
import { plainError } from "@/components/messages";

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
  // One playable address per recording, let go of when the next one replaces it.
  const clipUrl = useMemo(() => (clip ? URL.createObjectURL(clip) : null), [clip]);
  useEffect(() => () => {
    if (clipUrl) URL.revokeObjectURL(clipUrl);
  }, [clipUrl]);
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
      setError("This browser won’t let us use the microphone. Allow it, or write the dream instead.");
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
    <AppShell active="tell">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-20 lg:pt-6">
        <div className="text-center lg:text-left">
          <p className="h-6 text-ui font-semibold text-mist">{today}</p>
          <h1 className="mt-2 font-display text-h1 md:text-display">Before it fades, what did you dream?</h1>

          {!micOff && (
            <div className="mt-10 flex flex-col items-center lg:mt-14">
              <p className={`mb-4 h-7 font-mono text-title text-gold ${recording ? "" : "invisible"}`} aria-live="polite">
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
                className={`sphere sphere-press flex h-40 w-40 select-none items-center justify-center rounded-full text-gold-ink touch-none lg:h-48 lg:w-48 ${recording ? "listening" : ""}`}
              >
                {recording ? <Wave /> : <Mic />}
              </button>
              <p className="mt-6 text-lead font-semibold text-paper">{recording ? "Let go when you’re done" : clip ? "Hold to tell it again" : "Hold to tell it"}</p>
              <p className="mt-1 text-ui text-mist">{recording ? "Tell it any way it comes." : clip ? "Got it. Listen back, add words, or keep it." : "Ten seconds is plenty."}</p>
              {clip && !recording && clipUrl && <audio controls src={clipUrl} className="mt-5 w-full max-w-sm" />}
            </div>
          )}
        </div>

        <div className="panel p-5 md:p-7">
          <label className="block">
            <span className="text-ui font-semibold text-paper">{clip ? "Anything to add in words?" : micOff ? "Write the dream" : "Or write it, or add to your voice note"}</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="I was flying over my old school, and the roof turned into the sea…"
              className="field mt-2 resize-y rounded-2xl p-4 leading-relaxed"
            />
          </label>

          <div className="mt-7">
            <p className="mb-3 text-ui font-semibold text-paper">How did it feel?</p>
            <FeelingChips value={feeling} onChange={setFeeling} />
          </div>

          <button type="button" disabled={!ready || busy || recording} onClick={keep} className="btn btn-gold btn-lg mt-8 w-full">
            {busy ? "Keeping it…" : "Keep this dream"}
          </button>
          {error && <p className="mt-3 text-ui text-danger">{plainError(error)}</p>}
          <p className="mt-5 text-meta text-dim">Only you can see it. The painter runs sealed on 0G and keeps nothing, and we store your dream encrypted.</p>
        </div>
      </div>
    </AppShell>
  );
}
