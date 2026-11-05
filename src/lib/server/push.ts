// Web Push: each dreamer's phone subscriptions, and the short notices the worker sends.
// Notices never carry dream content. They say something is ready and link to it.
import webpush from "web-push";
import { getDb, now } from "./db";
import { env } from "./env";

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };
export type Notice = { title: string; body: string; url: string; tag?: string };

// The server POSTs to whatever endpoint a browser hands it, so only the real push services are allowed.
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com", "push.apple.com", "notify.windows.com"];

export function parseSubscription(input: unknown): PushSub | null {
  const sub = input as Partial<PushSub> | null;
  if (!sub || typeof sub.endpoint !== "string" || typeof sub.keys?.p256dh !== "string" || typeof sub.keys?.auth !== "string") return null;
  let url: URL;
  try {
    url = new URL(sub.endpoint);
  } catch {
    return null;
  }
  const host = url.hostname;
  if (url.protocol !== "https:" || !PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  return { endpoint: url.href, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
}

export function saveSubscription(userId: string, sub: PushSub) {
  getDb()
    .prepare(
      `INSERT INTO push_subs (endpoint, user_id, keys_json, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, keys_json = excluded.keys_json`,
    )
    .run(sub.endpoint, userId, JSON.stringify(sub.keys), now());
}

export function removeSubscription(userId: string, endpoint: string) {
  getDb().prepare("DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?").run(endpoint, userId);
}

let configured = false;

// Sends to every phone the dreamer subscribed. Throws only if none of them got it, so the job retries.
export async function notify(userId: string, notice: Notice): Promise<number> {
  const subs = getDb().prepare("SELECT endpoint, keys_json FROM push_subs WHERE user_id = ?").all(userId) as { endpoint: string; keys_json: string }[];
  if (!subs.length) return 0;
  if (!configured) {
    webpush.setVapidDetails(env.vapidSubject(), env.vapidPublic(), env.vapidPrivate());
    configured = true;
  }
  let sent = 0;
  let lastError: unknown;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.keys_json) }, JSON.stringify(notice), { TTL: 6 * 3600 });
      sent++;
    } catch (error) {
      // 404 and 410 mean the phone dropped this subscription, so forget it.
      if (error instanceof webpush.WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
        getDb().prepare("DELETE FROM push_subs WHERE endpoint = ?").run(s.endpoint);
      } else {
        lastError = error;
      }
    }
  }
  if (!sent && lastError) throw lastError;
  return sent;
}
