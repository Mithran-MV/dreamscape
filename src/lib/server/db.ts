// One SQLite file shared by the web app and the worker (Node's built-in node:sqlite, WAL mode).
// It holds app state and a local cache; 0G Storage stays the record of every dream file.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { env } from "./env";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  handle TEXT UNIQUE NOT NULL,
  wallet TEXT,
  pass_hash TEXT,                     -- scrypt(salt, passphrase) for the stand-in sign-in
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS dreams (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  day INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  input_kind TEXT NOT NULL,           -- 'voice' or 'text'
  feeling TEXT,                       -- the dreamer's own tap
  status TEXT NOT NULL,               -- queued, transcribing, tagging, painting, storing, anchoring, done, failed
  error TEXT,
  transcript TEXT,
  title TEXT,
  tags_json TEXT,
  scene TEXT,
  suggested_feeling TEXT,
  voice_root TEXT,
  portrait_root TEXT,
  record_root TEXT,
  registry_tx TEXT,
  registry_id INTEGER
);
CREATE INDEX IF NOT EXISTS dreams_by_user_day ON dreams(user_id, day);
CREATE TABLE IF NOT EXISTS traces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dream_id TEXT NOT NULL,
  step TEXT NOT NULL,
  model TEXT NOT NULL,
  request_id TEXT,
  provider TEXT,
  tee_verified INTEGER,
  cost_usd REAL,
  ms INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued, running, done, failed
  attempts INTEGER NOT NULL DEFAULT 0,
  run_after INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS blobs (
  key TEXT PRIMARY KEY,                 -- e.g. 'dream/<id>/portrait'
  mime TEXT NOT NULL,
  sealed BLOB NOT NULL,                 -- AES-256-GCM ciphertext under the dreamer's key
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  day INTEGER NOT NULL,                 -- the night it was made
  status TEXT NOT NULL,                 -- writing, drawing, draft, published, discarded, failed
  error TEXT,
  saga TEXT,
  title TEXT,
  feeling TEXT,                         -- picks the one spot colour
  script_json TEXT,                     -- panels with scene, dialogue and caption; the app letters them
  dream_ids TEXT,                       -- JSON array of the dreams it is drawn from
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS episodes_by_user_day ON episodes(user_id, day);
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,            -- the push service URL for one phone or browser
  user_id TEXT NOT NULL REFERENCES users(id),
  keys_json TEXT NOT NULL,              -- p256dh and auth, used to encrypt each notice
  created_at INTEGER NOT NULL
);
`;

let db: DatabaseSync | undefined;

export function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(env.dataDir(), { recursive: true });
  db = new DatabaseSync(`${env.dataDir()}/dreamscape.db`);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  addColumn(db, "users", "pass_hash", "TEXT");
  addColumn(db, "users", "nightly", "INTEGER NOT NULL DEFAULT 0"); // opted in to the nightly run
  addColumn(db, "users", "last_night", "INTEGER"); // utcDay of the last nightly run
  addColumn(db, "users", "character", "TEXT"); // the dreamer's cartoon, kept the same in every comic
  addColumn(db, "dreams", "saga", "TEXT");
  return db;
}

// Columns added after the first release, for databases made before them.
function addColumn(db: DatabaseSync, table: string, column: string, type: string) {
  const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

export const now = () => Date.now();
export const utcDay = (ms = Date.now()) => Math.floor(ms / 86_400_000);
