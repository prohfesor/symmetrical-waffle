import session from "express-session";
import type { Database } from "./db";

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * express-session store backed by the app's own SQLite database.
 *
 * The default MemoryStore leaks memory, can't be shared, and drops every
 * session on restart -- which, for a container that otherwise keeps its
 * database on a volume, would sign everyone out on each redeploy.
 */
export class SqliteSessionStore extends session.Store {
  private readonly pruneTimer: NodeJS.Timeout;

  constructor(
    private readonly sessions: Database["sessions"],
    private readonly ttlMs: number = DEFAULT_TTL_MS,
  ) {
    super();
    this.sessions.pruneExpired(Date.now());
    this.pruneTimer = setInterval(() => this.sessions.pruneExpired(Date.now()), PRUNE_INTERVAL_MS);
    this.pruneTimer.unref(); // never keep the process alive just to prune
  }

  private expiryOf(sess: session.SessionData): number {
    const expires = sess.cookie?.expires;
    return expires ? new Date(expires).getTime() : Date.now() + this.ttlMs;
  }

  private run(callback: ((err?: unknown) => void) | undefined, work: () => void): void {
    try {
      work();
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  get(sid: string, callback: (err: unknown, session?: session.SessionData | null) => void): void {
    try {
      const data = this.sessions.get(sid, Date.now());
      callback(null, data ? (JSON.parse(data) as session.SessionData) : null);
    } catch (err) {
      callback(err);
    }
  }

  set(sid: string, sess: session.SessionData, callback?: (err?: unknown) => void): void {
    this.run(callback, () => this.sessions.set(sid, JSON.stringify(sess), this.expiryOf(sess)));
  }

  touch(sid: string, sess: session.SessionData, callback?: () => void): void {
    this.run(callback, () => this.sessions.touch(sid, this.expiryOf(sess)));
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    this.run(callback, () => this.sessions.destroy(sid));
  }

  close(): void {
    clearInterval(this.pruneTimer);
  }
}
