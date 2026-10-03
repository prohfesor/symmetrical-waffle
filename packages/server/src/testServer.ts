import type { AddressInfo } from "node:net";
import { createApp } from "./app";
import { loadConfig, ServerConfig } from "./config";
import { Database, openDatabase } from "./db";

type Env = Record<string, string | undefined>;

export interface Reply {
  status: number;
  headers: Headers;
  /** Parsed JSON body, or undefined if the body wasn't JSON. */
  json: any;
  text: string;
}

/** A minimal browser stand-in: keeps cookies between requests and never follows redirects (so tests can inspect them). */
export class TestClient {
  private readonly cookies = new Map<string, string>();

  constructor(
    private readonly baseUrl: string,
    private readonly defaultHeaders: Record<string, string> = {},
  ) {}

  get cookieNames(): string[] {
    return [...this.cookies.keys()];
  }

  /** Carries another client's cookies over, as a browser would keep them across a server restart. */
  adoptCookies(other: TestClient): this {
    other.cookies.forEach((value, name) => this.cookies.set(name, value));
    return this;
  }

  async request(
    method: string,
    path: string,
    options: { body?: unknown; rawBody?: string; headers?: Record<string, string> } = {},
  ): Promise<Reply> {
    const headers: Record<string, string> = { ...this.defaultHeaders, ...options.headers };
    if (this.cookies.size > 0) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    let body: string | undefined = options.rawBody;
    if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers["content-type"] = "application/json";
    }
    const res = await fetch(this.baseUrl + path, { method, headers, body, redirect: "manual" });
    this.storeCookies(res.headers.getSetCookie());
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status, headers: res.headers, json, text };
  }

  get = (path: string, headers?: Record<string, string>) => this.request("GET", path, { headers });
  post = (path: string, body?: unknown) => this.request("POST", path, { body });
  put = (path: string, body?: unknown) => this.request("PUT", path, { body });
  delete = (path: string) => this.request("DELETE", path);

  /** Signs in through the dev-login stub and returns the response. */
  login(email: string, name = email.split("@")[0]): Promise<Reply> {
    return this.get(`/api/auth/dev-login?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`);
  }

  private storeCookies(setCookies: string[]): void {
    for (const line of setCookies) {
      const [pair, ...attributes] = line.split(";").map((s) => s.trim());
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const expires = attributes.find((a) => a.toLowerCase().startsWith("expires="));
      const expired = expires !== undefined && new Date(expires.slice(8)).getTime() <= Date.now();
      if (value === "" || expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}

export interface TestServer {
  config: ServerConfig;
  db: Database;
  url: string;
  client(headers?: Record<string, string>): TestClient;
  stop(): Promise<void>;
}

export interface StartOptions {
  env?: Env;
  db?: Database;
  uiDistDir?: string;
  /** Keep the database open on stop (for tests that restart the server on the same database). */
  keepDb?: boolean;
}

/** Starts the real app on an ephemeral port against an in-memory database (unless one is supplied). */
export async function startTestServer({
  env = {},
  db = openDatabase(":memory:"),
  uiDistDir,
  keepDb = false,
}: StartOptions = {}): Promise<TestServer> {
  const config = loadConfig({ PUBLIC_SERVER_URL: "http://localhost:8787", ...env }, { uiDistDir });
  const app = createApp(config, db);
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.express.listen(0, "127.0.0.1", () => resolve(s));
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    config,
    db,
    url,
    client: (headers) => new TestClient(url, headers),
    async stop() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      app.close();
      if (!keepDb) db.close();
    },
  };
}
