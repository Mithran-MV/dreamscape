// Dream records and the per-dreamer sealed cache.
import { getDb, now, utcDay } from "./db";
import { dreamerKey, newId, open, seal } from "./crypto";
import type { Trace } from "./zerog/router";

export const FEELINGS = ["wonder", "joy", "calm", "confused", "scared", "sad"] as const;
export type Feeling = (typeof FEELINGS)[number];

// A closed theme list, so the market can filter on one true/false column per theme.
export const THEMES = ["water", "flight", "falling", "chase", "home", "animals", "people", "school", "city", "nature", "fantasy", "night"] as const;

export type Dream = {
  id: string;
  user_id: string;
  day: number;
  created_at: number;
  input_kind: "voice" | "text";
  feeling: Feeling | null;
  status: string;
  error: string | null;
  transcript: string | null;
  title: string | null;
  tags_json: string | null;
  scene: string | null;
  suggested_feeling: string | null;
  voice_root: string | null;
  portrait_root: string | null;
  record_root: string | null;
  registry_tx: string | null;
  registry_id: number | null;
  saga: string | null;
};

export function getOrCreateUser(handle: string): string {
  const db = getDb();
  const found = db.prepare("SELECT id FROM users WHERE handle = ?").get(handle) as { id: string } | undefined;
  if (found) return found.id;
  const id = newId("user");
  db.prepare("INSERT INTO users (id, handle, created_at) VALUES (?, ?, ?)").run(id, handle, now());
  return id;
}

export function createDream(userId: string, kind: "voice" | "text", feeling: Feeling | null, text: string | null): string {
  const id = newId("dream");
  getDb()
    .prepare("INSERT INTO dreams (id, user_id, day, created_at, input_kind, feeling, status, transcript) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?)")
    .run(id, userId, utcDay(), now(), kind, feeling, text);
  return id;
}

export function getDream(id: string): Dream | undefined {
  return getDb().prepare("SELECT * FROM dreams WHERE id = ?").get(id) as Dream | undefined;
}

export function listDreams(userId: string, limit = 120): Dream[] {
  return getDb().prepare("SELECT * FROM dreams WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").all(userId, limit) as Dream[];
}

const COLUMNS = new Set([
  "status", "error", "transcript", "title", "tags_json", "scene", "suggested_feeling",
  "voice_root", "portrait_root", "record_root", "registry_tx", "registry_id", "saga",
]);

export function updateDream(id: string, fields: Partial<Record<string, string | number | null>>) {
  const keys = Object.keys(fields).filter((k) => COLUMNS.has(k));
  if (!keys.length) return;
  const sql = `UPDATE dreams SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`;
  getDb().prepare(sql).run(...keys.map((k) => fields[k] ?? null), id);
}

export function addTrace(dreamId: string, step: string, t: Trace) {
  getDb()
    .prepare("INSERT INTO traces (dream_id, step, model, request_id, provider, tee_verified, cost_usd, ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(dreamId, step, t.model, t.requestId, t.provider, t.teeVerified == null ? null : t.teeVerified ? 1 : 0, t.costUsd, t.ms, now());
}

export function tracesFor(dreamId: string) {
  return getDb().prepare("SELECT step, model, request_id, provider, tee_verified, cost_usd, ms FROM traces WHERE dream_id = ? ORDER BY id").all(dreamId);
}

// Sealed local cache: files are encrypted under the dreamer's key, like their copies on 0G Storage.
export function putBlob(userId: string, key: string, mime: string, bytes: Uint8Array) {
  getDb()
    .prepare("INSERT OR REPLACE INTO blobs (key, mime, sealed, created_at) VALUES (?, ?, ?, ?)")
    .run(key, mime, seal(dreamerKey(userId), bytes), now());
}

export function getBlob(userId: string, key: string): { mime: string; bytes: Buffer } | undefined {
  const row = getDb().prepare("SELECT mime, sealed FROM blobs WHERE key = ?").get(key) as { mime: string; sealed: Uint8Array } | undefined;
  return row ? { mime: row.mime, bytes: open(dreamerKey(userId), row.sealed) } : undefined;
}
