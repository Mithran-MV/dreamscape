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
CREATE TABLE IF NOT EXISTS world_dreams (
  id TEXT PRIMARY KEY,
  day INTEGER NOT NULL,
  circle TEXT NOT NULL,                 -- 'world', or a circle code such as ethglobal-mumbai
  status TEXT NOT NULL,                 -- painting, done, too-few
  counts_json TEXT NOT NULL,            -- dreamers, shared themes (5 or more dreamers each), main feeling
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pieces (
  id TEXT PRIMARY KEY,                  -- NightMarket's bytes32 piece id
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,                   -- 'episode' or 'dream'
  ref TEXT NOT NULL,                    -- the episode or dream it sells
  title TEXT NOT NULL,
  label_prefix TEXT NOT NULL,           -- edition n is <prefix>-<n>.<handle>.dream-scape.eth
  price_usdc INTEGER NOT NULL,          -- 6 decimals
  editions INTEGER NOT NULL,
  status TEXT NOT NULL,                 -- listing, listed
  error TEXT,
  market_tx TEXT,
  arkiv_key TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sales (
  tx TEXT NOT NULL,
  piece_id TEXT NOT NULL,
  buyer TEXT NOT NULL,                  -- who paid; the edition's current owner is read from ENS
  edition_no INTEGER NOT NULL,
  label TEXT NOT NULL,
  token_id TEXT,
  price_usdc INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (tx, edition_no)
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,                 -- small app facts, such as the last night the stalls opened
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,            -- the push service URL for one phone or browser
  user_id TEXT NOT NULL REFERENCES users(id),
  keys_json TEXT NOT NULL,              -- p256dh and auth, used to encrypt each notice
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mornings (
  user_id TEXT NOT NULL REFERENCES users(id),
  day INTEGER NOT NULL,                 -- the UTC day the star was lit
  kind TEXT NOT NULL,                   -- 'dream', 'feeling' or 'nothing': all of them keep the morning
  feeling TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS reveals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,                   -- 'pattern' (7 mornings), 'cast' (21), 'book' (30), 'portrait' (100)
  status TEXT NOT NULL,                 -- making, ready
  title TEXT NOT NULL,
  body TEXT,
  slides_json TEXT,                     -- the story the dreamer taps through
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, kind)
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
  addColumn(db, "users", "circle", "TEXT");
  addColumn(db, "world_dreams", "published", "INTEGER"); // 1 once the counts are on Arkiv
  addColumn(db, "users", "ens_json", "TEXT");
  addColumn(db, "users", "privy_id", "TEXT");
  addColumn(db, "users", "session_version", "INTEGER NOT NULL DEFAULT 0"); // bumped on sign-out, ending every session
  addColumn(db, "users", "dripped_at", "INTEGER"); // when the server sent this wallet its test ETH and USDC // the Privy user behind this account, if they signed in that way
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_by_privy ON users(privy_id)"); // gallery name, resolver and registries once onboarded // one circle per dreamer, such as ethglobal-mumbai
  addColumn(db, "dreams", "saga", "TEXT");
  // The dreamer's own 0G key (sealed under their key), so their iAI credit pays for their dreams.
  addColumn(db, "users", "zg_key", "TEXT");
  addColumn(db, "users", "zg_key_preview", "TEXT");
  addColumn(db, "users", "zg_wallet", "TEXT");
  addColumn(db, "users", "zg_connected_at", "INTEGER");
  addColumn(db, "users", "zg_error", "TEXT");
  addColumn(db, "traces", "paid_by", "TEXT"); // 'you' when the dreamer's own 0G key paid, 'dreamscape' otherwise
  addColumn(db, "users", "tz_offset", "INTEGER"); // minutes behind UTC, from the browser, for the morning notice
  addColumn(db, "users", "hide_stars", "INTEGER"); // 1 when the dreamer hid the week's stars
  addColumn(db, "reveals", "decision", "TEXT"); // nightly posters: NULL waits in Drafts, then 'hung' or 'let-go'
  addColumn(db, "dreams", "video_decision", "TEXT");
  addColumn(db, "traces", "stand_in", "TEXT"); // the default model a backup stood in for // the moving portrait: NULL waits in Drafts, then 'hung' or 'let-go'

  addColumn(db, "traces", "e2ee", "TEXT"); // "sealed" when the request was encrypted to the enclave
  addColumn(db, "traces", "res_key", "TEXT"); // the provider's receipt key for this response
  addColumn(db, "dreams", "video_job", "TEXT"); // the living portrait's job id on 0G
  addColumn(db, "dreams", "video_state", "TEXT"); // rendering, done or failed
  addColumn(db, "dreams", "video_at", "INTEGER");
  addColumn(db, "dreams", "video_mode", "TEXT"); // verified or standard: which kind of video provider made it
  addColumn(db, "dreams", "ens_tx", "TEXT");
  addColumn(db, "dreams", "sample", "INTEGER"); // 1 for a sample dream filed on an earlier day: painted on 0G, never stored, anchored or named
  addColumn(db, "dreams", "note", "TEXT"); // words typed alongside a voice note // the scribe's day-record transaction on Sepolia
  return db;
}

// Columns added after the first release, for databases made before them.
function addColumn(db: DatabaseSync, table: string, column: string, type: string) {
  const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

export const now = () => Date.now();
export const utcDay = (ms = Date.now()) => Math.floor(ms / 86_400_000);
