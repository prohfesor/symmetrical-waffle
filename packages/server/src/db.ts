import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, "../data/pcad.sqlite");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT,
    avatar_url TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS drawings (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    title TEXT NOT NULL,
    document_json TEXT NOT NULL,
    params_text TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_drawings_owner ON drawings(owner_id);
`);

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
  visibility: "private" | "public";
  created_at: string;
  updated_at: string;
}

export function findUserById(id: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function findUserByEmail(email: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
}

export function upsertUser(user: { id: string; email: string; name?: string | null; avatarUrl?: string | null }): UserRow {
  const existing = findUserById(user.id);
  if (existing) {
    db.prepare("UPDATE users SET email = ?, name = ?, avatar_url = ? WHERE id = ?").run(
      user.email,
      user.name ?? null,
      user.avatarUrl ?? null,
      user.id,
    );
  } else {
    db.prepare("INSERT INTO users (id, email, name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)").run(
      user.id,
      user.email,
      user.name ?? null,
      user.avatarUrl ?? null,
      new Date().toISOString(),
    );
  }
  return findUserById(user.id)!;
}

export function listDrawingsForOwner(ownerId: string): Omit<DrawingRow, "document_json" | "params_text">[] {
  return db
    .prepare(
      "SELECT id, owner_id, title, visibility, created_at, updated_at FROM drawings WHERE owner_id = ? ORDER BY updated_at DESC",
    )
    .all(ownerId) as Omit<DrawingRow, "document_json" | "params_text">[];
}

export function getDrawing(id: string): DrawingRow | undefined {
  return db.prepare("SELECT * FROM drawings WHERE id = ?").get(id) as DrawingRow | undefined;
}

export function createDrawing(opts: {
  ownerId: string;
  title: string;
  documentJson: string;
  paramsText: string;
  visibility: "private" | "public";
}): DrawingRow {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO drawings (id, owner_id, title, document_json, params_text, visibility, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, opts.ownerId, opts.title, opts.documentJson, opts.paramsText, opts.visibility, now, now);
  return getDrawing(id)!;
}

export function updateDrawing(
  id: string,
  fields: Partial<{ title: string; documentJson: string; paramsText: string; visibility: "private" | "public" }>,
): DrawingRow | undefined {
  const existing = getDrawing(id);
  if (!existing) return undefined;
  const next = {
    title: fields.title ?? existing.title,
    document_json: fields.documentJson ?? existing.document_json,
    params_text: fields.paramsText ?? existing.params_text,
    visibility: fields.visibility ?? existing.visibility,
  };
  db.prepare("UPDATE drawings SET title = ?, document_json = ?, params_text = ?, visibility = ?, updated_at = ? WHERE id = ?").run(
    next.title,
    next.document_json,
    next.params_text,
    next.visibility,
    new Date().toISOString(),
    id,
  );
  return getDrawing(id);
}

export function deleteDrawing(id: string, ownerId: string): boolean {
  const result = db.prepare("DELETE FROM drawings WHERE id = ? AND owner_id = ?").run(id, ownerId);
  return result.changes > 0;
}
