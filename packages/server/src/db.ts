import { randomBytes, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

// Loaded with require() rather than imported: Vite (used by the test runner) doesn't know
// that the experimental `node:sqlite` is a builtin and would try to resolve it as a package.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = DatabaseSyncType;

export type Visibility = "private" | "public";

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface DrawingRow {
  id: string;
  owner_id: string;
  title: string;
  document_json: string;
  params_text: string;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
}

export type DrawingSummaryRow = Omit<DrawingRow, "document_json" | "params_text">;

export interface NewDrawing {
  ownerId: string;
  title: string;
  documentJson: string;
  paramsText: string;
  visibility: Visibility;
}

export type DrawingPatch = Partial<Pick<NewDrawing, "title" | "documentJson" | "paramsText" | "visibility">>;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT,
    avatar_url TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS drawings (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    document_json TEXT NOT NULL,
    params_text TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_drawings_owner ON drawings(owner_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

export interface Database {
  users: {
    findById(id: string): UserRow | undefined;
    upsert(user: { id: string; email: string; name?: string | null; avatarUrl?: string | null }): UserRow;
  };
  drawings: {
    listByOwner(ownerId: string): DrawingSummaryRow[];
    get(id: string): DrawingRow | undefined;
    create(drawing: NewDrawing): DrawingRow;
    update(id: string, patch: DrawingPatch): DrawingRow | undefined;
    /** Deletes only if `ownerId` owns it; returns whether anything was deleted. */
    delete(id: string, ownerId: string): boolean;
  };
  sessions: {
    get(sid: string, now: number): string | undefined;
    set(sid: string, data: string, expiresAt: number): void;
    touch(sid: string, expiresAt: number): void;
    destroy(sid: string): void;
    pruneExpired(now: number): number;
  };
  settings: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
  };
  /** Returns the persisted value for `key`, generating (and persisting) a random one on first use. */
  secret(key: string): string;
  close(): void;
}

/** Opens (creating if needed) the SQLite database at `file`, or in memory for ":memory:". */
export function openDatabase(file: string): Database {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);

  const q = {
    userById: db.prepare("SELECT * FROM users WHERE id = ?"),
    insertUser: db.prepare("INSERT INTO users (id, email, name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)"),
    updateUser: db.prepare("UPDATE users SET email = ?, name = ?, avatar_url = ? WHERE id = ?"),
    listDrawings: db.prepare(
      "SELECT id, owner_id, title, visibility, created_at, updated_at FROM drawings WHERE owner_id = ? ORDER BY updated_at DESC",
    ),
    drawingById: db.prepare("SELECT * FROM drawings WHERE id = ?"),
    insertDrawing: db.prepare(
      "INSERT INTO drawings (id, owner_id, title, document_json, params_text, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ),
    updateDrawing: db.prepare(
      "UPDATE drawings SET title = ?, document_json = ?, params_text = ?, visibility = ?, updated_at = ? WHERE id = ?",
    ),
    deleteDrawing: db.prepare("DELETE FROM drawings WHERE id = ? AND owner_id = ?"),
    sessionGet: db.prepare("SELECT data FROM sessions WHERE sid = ? AND expires_at > ?"),
    sessionSet: db.prepare(
      "INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at",
    ),
    sessionTouch: db.prepare("UPDATE sessions SET expires_at = ? WHERE sid = ?"),
    sessionDestroy: db.prepare("DELETE FROM sessions WHERE sid = ?"),
    sessionPrune: db.prepare("DELETE FROM sessions WHERE expires_at <= ?"),
    settingGet: db.prepare("SELECT value FROM settings WHERE key = ?"),
    settingSet: db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"),
  };

  const findUser = (id: string) => q.userById.get(id) as UserRow | undefined;
  const getDrawing = (id: string) => q.drawingById.get(id) as DrawingRow | undefined;
  const getSetting = (key: string) => (q.settingGet.get(key) as { value: string } | undefined)?.value;

  return {
    users: {
      findById: findUser,
      upsert({ id, email, name = null, avatarUrl = null }) {
        if (findUser(id)) q.updateUser.run(email, name, avatarUrl, id);
        else q.insertUser.run(id, email, name, avatarUrl, new Date().toISOString());
        return findUser(id)!;
      },
    },
    drawings: {
      listByOwner: (ownerId) => q.listDrawings.all(ownerId) as DrawingSummaryRow[],
      get: getDrawing,
      create(d) {
        const id = randomUUID();
        const now = new Date().toISOString();
        q.insertDrawing.run(id, d.ownerId, d.title, d.documentJson, d.paramsText, d.visibility, now, now);
        return getDrawing(id)!;
      },
      update(id, patch) {
        const existing = getDrawing(id);
        if (!existing) return undefined;
        q.updateDrawing.run(
          patch.title ?? existing.title,
          patch.documentJson ?? existing.document_json,
          patch.paramsText ?? existing.params_text,
          patch.visibility ?? existing.visibility,
          new Date().toISOString(),
          id,
        );
        return getDrawing(id);
      },
      delete: (id, ownerId) => Number(q.deleteDrawing.run(id, ownerId).changes) > 0,
    },
    sessions: {
      get: (sid, now) => (q.sessionGet.get(sid, now) as { data: string } | undefined)?.data,
      set: (sid, data, expiresAt) => void q.sessionSet.run(sid, data, expiresAt),
      touch: (sid, expiresAt) => void q.sessionTouch.run(expiresAt, sid),
      destroy: (sid) => void q.sessionDestroy.run(sid),
      pruneExpired: (now) => Number(q.sessionPrune.run(now).changes),
    },
    settings: { get: getSetting, set: (key, value) => void q.settingSet.run(key, value) },
    secret(key) {
      const existing = getSetting(key);
      if (existing) return existing;
      const generated = randomBytes(32).toString("hex");
      q.settingSet.run(key, generated);
      return generated;
    },
    close: () => db.close(),
  };
}
