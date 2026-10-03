import * as fs from "node:fs";
import * as path from "node:path";

export type LoginMode = "google" | "dev" | "none";

export interface ServerConfig {
  port: number;
  /** Public origin of this server (used for the OAuth callback URL and as the default frontend origin). */
  publicServerUrl: string;
  /** Origin the UI is served from. Defaults to this server's own origin (single-process deployment). */
  frontendUrl: string;
  /** Explicit session secret, or undefined to use one generated and persisted in the database. */
  sessionSecret: string | undefined;
  /** Whether session cookies carry the Secure attribute. Follows the public URL's scheme, not NODE_ENV. */
  secureCookies: boolean;
  dbPath: string;
  google: { clientId: string; clientSecret: string } | null;
  loginMode: LoginMode;
  /** Built UI bundle to serve from this process, if present. */
  uiDistDir: string | null;
}

type Env = Record<string, string | undefined>;

function isLoopbackUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function parseBool(value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

/**
 * Reads every environment variable the server cares about, in one place, and
 * derives the settings that depend on combinations of them -- so the rest of
 * the code takes a plain config object instead of reading process.env itself.
 *
 * Deliberate choices:
 * - `secureCookies` follows the *public URL's scheme*. Tying it to NODE_ENV
 *   broke login entirely for the Docker image (NODE_ENV=production, but served
 *   over plain http://localhost): the browser never received a session cookie.
 * - The dev-login stub exists only when no Google credentials are configured,
 *   and on a non-loopback production deployment it additionally requires an
 *   explicit ALLOW_DEV_LOGIN=true, so a real deployment can't leave a
 *   "log in as anyone" endpoint open by forgetting to set credentials.
 */
export function loadConfig(env: Env = process.env, defaults: { uiDistDir?: string } = {}): ServerConfig {
  const port = Number(env.PORT ?? 8787);
  const publicServerUrl = (env.PUBLIC_SERVER_URL || `http://localhost:${port}`).replace(/\/+$/, "");
  const frontendUrl = (env.FRONTEND_URL || publicServerUrl).replace(/\/+$/, "");

  const google = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } : null;

  const isProduction = env.NODE_ENV === "production";
  const devLoginAllowed = parseBool(env.ALLOW_DEV_LOGIN) ?? (!isProduction || isLoopbackUrl(publicServerUrl));
  const loginMode: LoginMode = google ? "google" : devLoginAllowed ? "dev" : "none";

  const uiDistDir = defaults.uiDistDir && fs.existsSync(path.join(defaults.uiDistDir, "index.html")) ? defaults.uiDistDir : null;

  return {
    port,
    publicServerUrl,
    frontendUrl,
    sessionSecret: env.SESSION_SECRET || undefined,
    secureCookies: parseBool(env.COOKIE_SECURE) ?? publicServerUrl.startsWith("https://"),
    dbPath: env.DB_PATH || path.join(__dirname, "../data/pcad.sqlite"),
    google,
    loginMode,
    uiDistDir,
  };
}
