// 0G Private Computer router: an OpenAI-compatible API. Sealed steps send the private trust mode,
// so they fail with 503 instead of ever falling back to a provider that can read the dream.
import { env } from "../env";

export type Trace = {
  model: string;
  requestId: string | null;
  provider: string | null;
  teeVerified: boolean | null;
  costUsd: number | null;
  ms: number;
};

export class ZeroGError extends Error {
  constructor(public status: number, public body: string, public trace?: Partial<Trace>) {
    super(`0G router ${status}: ${body.slice(0, 300)}`);
  }
  // 503 no_provider_for_trust_mode, 429 and 5xx are worth retrying later; 4xx errors are not.
  get retryable() {
    return this.status === 429 || this.status >= 500;
  }
}

// private: sealed enclave (TeeML). verified: a TeeTLS relay, where the vendor sees the input.
type Sealing = "private" | "verified" | "standard";

function headers(sealing: Sealing, json: boolean): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${env.zgApiKey()}`,
    "X-Title": "Dreamscape",
    "HTTP-Referer": "https://dreamscape.hacklabs.in",
  };
  if (sealing !== "standard") h["X-0G-Provider-Trust-Mode"] = sealing;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function readTrace(model: string, ms: number, res: Response, body: unknown): Trace {
  const t = (body as { x_0g_trace?: Record<string, unknown> } | null)?.x_0g_trace ?? {};
  const billing = (t.billing ?? {}) as Record<string, unknown>;
  const micro = billing.total_cost_usd_micro;
  return {
    model,
    requestId: (t.request_id as string) ?? res.headers.get("x-request-id"),
    provider: (t.provider as string) ?? null,
    teeVerified: typeof t.tee_verified === "boolean" ? t.tee_verified : null,
    costUsd: micro != null ? Number(micro) / 1e6 : null,
    ms,
  };
}

async function call<T>(path: string, model: string, init: RequestInit): Promise<{ data: T; trace: Trace }> {
  const started = Date.now();
  const res = await fetch(`${env.zgRouter()}${path}`, { ...init, signal: AbortSignal.timeout(180_000) });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON error bodies are reported as text */
  }
  const trace = readTrace(model, Date.now() - started, res, body);
  if (!res.ok) throw new ZeroGError(res.status, text, trace);
  return { data: body as T, trace };
}

// Speech to text, sealed. Whisper only returns json or verbose_json now.
export async function transcribe(audio: Uint8Array, mime: string) {
  const model = "whisper-large-v3";
  const form = new FormData();
  const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : "webm";
  form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), `dream.${ext}`);
  form.append("model", model);
  form.append("response_format", "json");
  const { data, trace } = await call<{ text: string }>("/audio/transcriptions?verify_tee=true", model, {
    method: "POST",
    headers: headers("private", false),
    body: form,
  });
  return { text: (data.text ?? "").trim(), trace };
}

// Sealed chat that must answer with a JSON object.
export async function chatJson<T>(system: string, user: string, maxTokens = 900) {
  const model = "0gm-1.0-35b-a3b";
  const { data, trace } = await call<{ choices: { message: { content: string } }[] }>("/chat/completions", model, {
    method: "POST",
    headers: headers("private", true),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      reasoning_effort: "low",
      max_tokens: maxTokens,
      temperature: 0.7,
      verify_tee: true,
    }),
  });
  const content = data.choices?.[0]?.message?.content ?? "";
  const json = content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1);
  return { value: JSON.parse(json) as T, trace };
}

// Sealed painting. z-image-turbo takes text only and needs b64_json.
export async function paint(prompt: string, size = "1024x1024") {
  const model = "z-image-turbo";
  const { data, trace } = await call<{ data: { b64_json: string }[] }>("/images/generations", model, {
    method: "POST",
    headers: headers("private", true),
    body: JSON.stringify({ model, prompt, size, n: 1, response_format: "b64_json", verify_tee: true }),
  });
  return { png: Buffer.from(data.data[0].b64_json, "base64"), trace };
}

// Comic panels (not sealed: they only ever get a scene description, never the raw dream).
export async function drawPanel(prompt: string, references: string[] = [], seed?: number) {
  const model = "tencent/hy-image-3.5-preview";
  const body: Record<string, unknown> = { model, prompt, size: "1024x1024", n: 1 };
  if (references.length) body.image = references;
  if (seed != null) body.seed = seed;
  const { data, trace } = await call<{ data: { b64_json?: string; url?: string }[] }>("/images/generations", model, {
    method: "POST",
    headers: headers("standard", true),
    body: JSON.stringify(body),
  });
  const item = data.data[0];
  const png = item.b64_json ? Buffer.from(item.b64_json, "base64") : Buffer.from(await (await fetch(item.url!)).arrayBuffer());
  return { png, trace };
}

// Living portraits: image to video, submitted, polled, then downloaded. Seedance runs on a verified
// relay whose vendor sees the input, so it only ever gets the painted portrait and a motion line.
export type VideoJob = { id: string; status: string; error?: { message?: string } };
const VIDEO_MODEL = "bytedance/seedance-2.0";

export async function submitVideo(prompt: string, firstFrame: string, seconds = 5, size = "480p") {
  const { data, trace } = await call<VideoJob>("/videos", VIDEO_MODEL, {
    method: "POST",
    headers: headers("verified", true),
    body: JSON.stringify({ model: VIDEO_MODEL, prompt, input_reference: firstFrame, seconds, size, generate_audio: false }),
  });
  return { job: data, trace };
}

// verify_tee on the poll is the proof for video, since response signatures don't cover it.
export async function pollVideo(id: string) {
  const { data, trace } = await call<VideoJob>(`/videos/${encodeURIComponent(id)}?verify_tee=true`, VIDEO_MODEL, { headers: headers("verified", false) });
  return { job: data, trace };
}

export async function downloadVideo(id: string) {
  const res = await fetch(`${env.zgRouter()}/videos/${encodeURIComponent(id)}/content`, { headers: headers("verified", false), signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new ZeroGError(res.status, await res.text());
  return Buffer.from(await res.arrayBuffer());
}
