import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { openDatabase } from "./db";
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

describe("loadConfig", () => {
  it("defaults the frontend to the server's own origin (single-process deployment)", () => {
    const c = loadConfig({ PORT: "9000" });
    expect(c.publicServerUrl).toBe("http://localhost:9000");
    expect(c.frontendUrl).toBe("http://localhost:9000");
  });

  it("honours an explicit FRONTEND_URL for split dev mode and trims trailing slashes", () => {
    const c = loadConfig({ FRONTEND_URL: "http://localhost:5173/", PUBLIC_SERVER_URL: "http://localhost:8787//" });
    expect(c.frontendUrl).toBe("http://localhost:5173");
    expect(c.publicServerUrl).toBe("http://localhost:8787");
  });

  it("makes cookies Secure based on the public URL's scheme, not NODE_ENV", () => {
    expect(loadConfig({ NODE_ENV: "production", PUBLIC_SERVER_URL: "http://localhost:8787" }).secureCookies).toBe(false);
    expect(loadConfig({ NODE_ENV: "production", PUBLIC_SERVER_URL: "https://cad.example.com" }).secureCookies).toBe(true);
    expect(loadConfig({ NODE_ENV: "development", PUBLIC_SERVER_URL: "https://cad.example.com" }).secureCookies).toBe(true);
    expect(loadConfig({ PUBLIC_SERVER_URL: "https://cad.example.com", COOKIE_SECURE: "false" }).secureCookies).toBe(false);
  });

  describe("login mode", () => {
    it("uses the dev stub in development and when running production on loopback (the local Docker case)", () => {
      expect(loadConfig({}).loginMode).toBe("dev");
      expect(loadConfig({ NODE_ENV: "production" }).loginMode).toBe("dev");
      expect(loadConfig({ NODE_ENV: "production", PUBLIC_SERVER_URL: "http://127.0.0.1:3000" }).loginMode).toBe("dev");
    });

    it("refuses the dev stub on a real production deployment unless explicitly allowed", () => {
      const production = { NODE_ENV: "production", PUBLIC_SERVER_URL: "https://cad.example.com" };
      expect(loadConfig(production).loginMode).toBe("none");
      expect(loadConfig({ ...production, ALLOW_DEV_LOGIN: "true" }).loginMode).toBe("dev");
    });

    it("uses Google whenever credentials exist, even if the stub is also allowed", () => {
      const google = { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };
      expect(loadConfig(google).loginMode).toBe("google");
      expect(loadConfig({ ...google, ALLOW_DEV_LOGIN: "true" }).loginMode).toBe("google");
      expect(loadConfig({ GOOGLE_CLIENT_ID: "id" }).loginMode).toBe("dev"); // half-configured doesn't count
    });
  });
});

describe("authentication", () => {
  it("reports no user and the login mode when anonymous", async () => {
    const server = await start();
    const me = await server.client().get("/api/auth/me");
    expect(me.json).toEqual({ user: null, loginMode: "dev" });
  });

  it("signs in through the dev stub and redirects back to the frontend origin", async () => {
    const server = await start({ env: { FRONTEND_URL: "http://localhost:5173" } });
    const client = server.client();
    const login = await client.login("ann@example.com", "Ann");
    expect(login.status).toBe(302);
    expect(login.headers.get("location")).toBe("http://localhost:5173");
    const me = await client.get("/api/auth/me");
    expect(me.json.user).toEqual({ id: "dev:ann@example.com", email: "ann@example.com", name: "Ann", avatarUrl: null });
  });

  it("REGRESSION: sign-in sticks in the production Docker setup (NODE_ENV=production over plain http)", async () => {
    // This used to set no session cookie at all: Secure was keyed off NODE_ENV, so every
    // login on http://localhost silently did nothing.
    const server = await start({ env: { NODE_ENV: "production", PUBLIC_SERVER_URL: "http://localhost:8787" } });
    const client = server.client();
    const login = await client.login("docker@example.com");
    expect(login.headers.getSetCookie().join(";")).not.toMatch(/;\s*Secure/i);
    expect((await client.get("/api/auth/me")).json.user?.email).toBe("docker@example.com");
  });

  it("sets Secure, HttpOnly and SameSite=Lax cookies for an https deployment behind a TLS proxy", async () => {
    const server = await start({ env: { NODE_ENV: "production", PUBLIC_SERVER_URL: "https://cad.example.com", ALLOW_DEV_LOGIN: "true" } });
    const client = server.client({ "x-forwarded-proto": "https" });
    const cookie = (await client.login("tls@example.com")).headers.getSetCookie().join(";");
    expect(cookie).toMatch(/pcad\.sid=/);
    expect(cookie).toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax/i);
  });

  it("only hands out the public fields of a user", async () => {
    const server = await start();
    const client = server.client();
    await client.login("ann@example.com");
    expect(Object.keys((await client.get("/api/auth/me")).json.user).sort()).toEqual(["avatarUrl", "email", "id", "name"]);
  });

  it("rejects a dev-login without a plausible email", async () => {
    const server = await start();
    expect((await server.client().get("/api/auth/dev-login?email=not-an-email")).status).toBe(400);
  });

  it("signs out, invalidating the session", async () => {
    const server = await start();
    const client = server.client();
    await client.login("ann@example.com");
    expect((await client.post("/api/auth/logout")).json).toEqual({ ok: true });
    expect((await client.get("/api/auth/me")).json.user).toBeNull();
  });

  it("has no login endpoint at all when no sign-in method is enabled", async () => {
    const server = await start({ env: { NODE_ENV: "production", PUBLIC_SERVER_URL: "https://cad.example.com" } });
    const client = server.client();
    expect((await client.get("/api/auth/me")).json.loginMode).toBe("none");
    expect((await client.login("ann@example.com")).status).toBe(404);
  });

  it("keeps people signed in across a server restart", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pcad-test-"));
    try {
      const file = path.join(dir, "pcad.sqlite");
      const first = await startTestServer({ db: openDatabase(file) });
      const client = first.client();
      await client.login("ann@example.com");
      expect((await client.get("/api/auth/me")).json.user.email).toBe("ann@example.com");
      await first.stop();

      // A brand-new server process on the same database file; the browser keeps its cookie.
      const second = await start({ db: openDatabase(file) });
      const restarted = second.client().adoptCookies(client);
      expect((await restarted.get("/api/auth/me")).json.user?.email).toBe("ann@example.com");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
