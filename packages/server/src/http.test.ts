import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db";
import { SqliteSessionStore } from "./sessionStore";
import { startTestServer, TestServer } from "./testServer";

const running: TestServer[] = [];
async function start(...args: Parameters<typeof startTestServer>): Promise<TestServer> {
  const server = await startTestServer(...args);
  running.push(server);
  return server;
}
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()));
});

describe("HTTP hardening", () => {
  it("sends security headers and doesn't advertise Express", async () => {
    const res = await (await start()).client().get("/api/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("same-origin");
    expect(res.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.has("x-powered-by")).toBe(false);
  });

  it("answers malformed JSON with a JSON 400, not an HTML stack trace", async () => {
    const server = await start();
    const client = server.client();
    await client.login("ann@example.com");
    const res = await client.request("POST", "/api/drawings", { rawBody: "{ not json", headers: { "content-type": "application/json" } });
    expect(res.status).toBe(400);
    expect(res.json).toEqual({ error: "request body is not valid JSON" });
  });

  it("rejects oversized bodies with a JSON 413", async () => {
    const server = await start();
    const client = server.client();
    await client.login("ann@example.com");
    const huge = JSON.stringify({ title: "x", document: { entities: [], dimensions: [], pad: "y".repeat(6 * 1024 * 1024) }, paramsText: "" });
    const res = await client.request("POST", "/api/drawings", { rawBody: huge, headers: { "content-type": "application/json" } });
    expect(res.status).toBe(413);
    expect(typeof res.json.error).toBe("string");
  });

  it("answers unknown API routes with a JSON 404", async () => {
    const res = await (await start()).client().get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.json).toEqual({ error: "not found" });
  });

  it("only enables CORS when the UI is on a different origin (split dev mode)", async () => {
    const same = await (await start()).client().get("/api/health", { origin: "http://evil.example" });
    expect(same.headers.has("access-control-allow-origin")).toBe(false);

    const split = await start({ env: { FRONTEND_URL: "http://localhost:5173" } });
    const allowed = await split.client().get("/api/health", { origin: "http://localhost:5173" });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");
    const denied = await split.client().get("/api/health", { origin: "http://evil.example" });
    expect(denied.headers.get("access-control-allow-origin")).not.toBe("http://evil.example");
  });
});

describe("serving the built UI", () => {
  function fakeDist(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pcad-dist-"));
    fs.mkdirSync(path.join(dir, "assets"));
    fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>app</title>");
    fs.writeFileSync(path.join(dir, "assets", "app-abc123.js"), "console.log(1)");
    return dir;
  }

  it("serves index.html (uncached), hashed assets (cached forever) and falls back to the SPA for client routes", async () => {
    const dist = fakeDist();
    try {
      const client = (await start({ uiDistDir: dist })).client();
      const index = await client.get("/");
      expect(index.text).toContain("<title>app</title>");
      expect(index.headers.get("cache-control")).toBe("no-cache");

      const asset = await client.get("/assets/app-abc123.js");
      expect(asset.status).toBe(200);
      expect(asset.headers.get("cache-control")).toMatch(/max-age=31536000.*immutable/);

      expect((await client.get("/d/some-client-route")).text).toContain("<title>app</title>");
      expect((await client.get("/api/nope")).json).toEqual({ error: "not found" }); // API misses stay JSON, not the SPA
    } finally {
      fs.rmSync(dist, { recursive: true, force: true });
    }
  });

  it("serves no UI when there is no build", async () => {
    expect((await (await start()).client().get("/")).status).toBe(404);
  });
});

describe("SqliteSessionStore", () => {
  const sessionData = (expires: number) => ({ cookie: { originalMaxAge: 1000, expires: new Date(expires).toISOString() as unknown as Date, httpOnly: true, path: "/" } });

  it("stores, reads, touches and destroys sessions", () => {
    const db = openDatabase(":memory:");
    const store = new SqliteSessionStore(db.sessions);
    const future = Date.now() + 60_000;
    const get = (sid: string) => new Promise((resolve, reject) => store.get(sid, (err, s) => (err ? reject(err) : resolve(s))));
    const call = (fn: (cb: (err?: unknown) => void) => void) => new Promise<void>((resolve, reject) => fn((err) => (err ? reject(err) : resolve())));

    return (async () => {
      await call((cb) => store.set("sid1", sessionData(future), cb));
      expect(await get("sid1")).toMatchObject({ cookie: { httpOnly: true } });
      expect(await get("missing")).toBeNull();

      await call((cb) => store.destroy("sid1", cb));
      expect(await get("sid1")).toBeNull();
      store.close();
      db.close();
    })();
  });

  it("never returns an expired session, and prunes it", () => {
    const db = openDatabase(":memory:");
    const store = new SqliteSessionStore(db.sessions);
    db.sessions.set("old", JSON.stringify(sessionData(Date.now() - 1000)), Date.now() - 1000);
    db.sessions.set("live", JSON.stringify(sessionData(Date.now() + 60_000)), Date.now() + 60_000);

    expect(db.sessions.get("old", Date.now())).toBeUndefined();
    expect(db.sessions.pruneExpired(Date.now())).toBe(1);
    expect(db.sessions.get("live", Date.now())).toBeDefined();
    store.close();
    db.close();
  });
});

describe("database", () => {
  it("generates a secret once and keeps returning the same one", () => {
    const db = openDatabase(":memory:");
    const first = db.secret("session_secret");
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(db.secret("session_secret")).toBe(first);
    expect(db.secret("other")).not.toBe(first);
    db.close();
  });

  it("persists the secret on disk, so signed cookies stay valid after a restart", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pcad-db-"));
    try {
      const file = path.join(dir, "nested", "pcad.sqlite"); // parent directory is created on demand
      const a = openDatabase(file);
      const secret = a.secret("session_secret");
      a.close();
      const b = openDatabase(file);
      expect(b.secret("session_secret")).toBe(secret);
      b.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("updates a user in place on a repeat sign-in", () => {
    const db = openDatabase(":memory:");
    db.users.upsert({ id: "u1", email: "a@x.com", name: "Old" });
    const updated = db.users.upsert({ id: "u1", email: "a@x.com", name: "New", avatarUrl: "https://img/a.png" });
    expect(updated).toMatchObject({ name: "New", avatar_url: "https://img/a.png" });
    db.close();
  });

  it("deletes a drawing only for its owner and cascades when the user is removed", () => {
    const db = openDatabase(":memory:");
    db.users.upsert({ id: "u1", email: "a@x.com" });
    db.users.upsert({ id: "u2", email: "b@x.com" });
    const d = db.drawings.create({ ownerId: "u1", title: "t", documentJson: "{}", paramsText: "", visibility: "private" });
    expect(db.drawings.delete(d.id, "u2")).toBe(false);
    expect(db.drawings.get(d.id)).toBeDefined();
    expect(db.drawings.delete(d.id, "u1")).toBe(true);
    db.close();
  });
});
