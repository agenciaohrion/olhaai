/**
 * OLHA.AI Signage — camada de dados (SQLite nativo do Node, zero dependências binárias)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(ROOT, 'uploads');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(path.join(UPLOAD_DIR, 'thumbs'), { recursive: true });
fs.mkdirSync(path.join(UPLOAD_DIR, 'shots'), { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'signage.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL UNIQUE,
  pass_hash   TEXT NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('agency','client')),
  client_id   INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  phone       TEXT,
  last_login  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  brand         TEXT,
  segment       TEXT,
  cnpj          TEXT,
  contact_name  TEXT,
  contact_email TEXT,
  phone         TEXT,
  city          TEXT,
  state         TEXT,
  plan          TEXT NOT NULL DEFAULT 'essencial',
  status        TEXT NOT NULL DEFAULT 'ativo',
  monthly_value REAL DEFAULT 0,
  seats         INTEGER DEFAULT 0,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  address    TEXT,
  district   TEXT,
  city       TEXT,
  state      TEXT,
  zip        TEXT,
  lat        REAL,
  lng        REAL,
  kind       TEXT NOT NULL DEFAULT 'loja',
  footfall   INTEGER DEFAULT 0,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS devices (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uid          TEXT NOT NULL UNIQUE,
  client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  location_id  INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'tv',
  orientation  TEXT NOT NULL DEFAULT 'h',
  width        INTEGER DEFAULT 1920,
  height       INTEGER DEFAULT 1080,
  pairing_code TEXT NOT NULL,
  token        TEXT UNIQUE,
  status       TEXT NOT NULL DEFAULT 'pendente',
  paired_at    TEXT,
  last_seen    TEXT,
  lat          REAL,
  lng          REAL,
  accuracy     REAL,
  bearing      REAL,
  speed        REAL,
  geo_source   TEXT,
  geo_at       TEXT,
  battery      INTEGER,
  charging     INTEGER,
  os           TEXT,
  app_version  TEXT,
  ip           TEXT,
  ua           TEXT,
  mode         TEXT NOT NULL DEFAULT 'playlist',
  playlist_id  INTEGER REFERENCES playlists(id) ON DELETE SET NULL,
  takeover_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  uptime       INTEGER DEFAULT 0,
  playing_ms   INTEGER DEFAULT 0,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'image',
  title       TEXT NOT NULL,
  filename    TEXT,
  mime        TEXT,
  bytes       INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  width       INTEGER,
  height      INTEGER,
  url         TEXT,
  body        TEXT,
  orientation TEXT,
  checksum    TEXT,
  tags        TEXT,
  public      INTEGER DEFAULT 0,
  created_by  INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playlists (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  notes        TEXT,
  orientation  TEXT NOT NULL DEFAULT 'h',
  bg           TEXT DEFAULT '#05070f',
  status       TEXT NOT NULL DEFAULT 'rascunho',
  version      INTEGER NOT NULL DEFAULT 1,
  published_at TEXT,
  created_by   INTEGER,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  media_id    INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS schedules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name        TEXT,
  days        TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',
  start_time  TEXT NOT NULL DEFAULT '00:00',
  end_time    TEXT NOT NULL DEFAULT '23:59',
  priority    INTEGER NOT NULL DEFAULT 0,
  enabled     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS assignments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  scope       TEXT NOT NULL CHECK (scope IN ('client','location','device')),
  scope_id    INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (playlist_id, scope, scope_id)
);

CREATE TABLE IF NOT EXISTS device_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id  INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  media_id   INTEGER,
  payload    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playlog (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id  INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  media_id   INTEGER,
  ms         INTEGER NOT NULL DEFAULT 0,
  day        TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS screenshots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id  INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  w          INTEGER,
  h          INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  actor      TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  INTEGER,
  client_id  INTEGER,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);

CREATE INDEX IF NOT EXISTS ix_devices_client   ON devices(client_id);
CREATE INDEX IF NOT EXISTS ix_devices_loc      ON devices(location_id);
CREATE INDEX IF NOT EXISTS ix_media_client     ON media(client_id);
CREATE INDEX IF NOT EXISTS ix_items_playlist   ON playlist_items(playlist_id);
CREATE INDEX IF NOT EXISTS ix_logs_device      ON device_logs(device_id, id);
CREATE INDEX IF NOT EXISTS ix_playlog_day      ON playlog(day, device_id);
CREATE INDEX IF NOT EXISTS ix_shots_device     ON screenshots(device_id, id);
`);

/* ---------------- helpers ---------------- */

export function all(sql, params = []) {
  return db.prepare(sql).all(...params).map(plain);
}
export function get(sql, params = []) {
  const row = db.prepare(sql).get(...params);
  return row ? plain(row) : null;
}
export function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}
export function insert(table, obj) {
  const keys = Object.keys(obj);
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
  const info = db.prepare(sql).run(...keys.map((k) => cast(obj[k])));
  return Number(info.lastInsertRowid);
}
export function update(table, id, obj) {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  if (!keys.length) return 0;
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`;
  return db.prepare(sql).run(...keys.map((k) => cast(obj[k])), id).changes;
}
export function del(table, id) {
  return db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id).changes;
}
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
export function kvGet(k, def = null) {
  const row = get('SELECT v FROM kv WHERE k=?', [k]);
  return row ? JSON.parse(row.v) : def;
}
export function kvSet(k, v) {
  run('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', [k, JSON.stringify(v)]);
}

function cast(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v && typeof v === 'object' && !(v instanceof Date)) return JSON.stringify(v);
  return v;
}
function plain(row) {
  const o = {};
  for (const [k, v] of Object.entries(row)) o[k] = v;
  return o;
}

export function audit(entry) {
  insert('audit', entry);
}

export const nowISO = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
