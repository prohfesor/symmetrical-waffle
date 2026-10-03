import cors from "cors";
import express, { Express, NextFunction, Request, Response } from "express";
import session from "express-session";
import * as path from "node:path";
import { createPassport } from "./auth";
import type { ServerConfig } from "./config";
import type { Database } from "./db";
import { createAuthRouter } from "./routes/auth";
import { createDrawingsRouter } from "./routes/drawings";
import { SqliteSessionStore } from "./sessionStore";

const SESSION_COOKIE_NAME = "pcad.sid";
const SESSION_SECRET_SETTING = "session_secret";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const JSON_BODY_LIMIT = "5mb";

/**
 * Content-Security-Policy for the SPA this server hosts: scripts and
 * connections only from this origin; inline styles are allowed because the UI
 * sets a few element styles at runtime; images may be data: URIs (favicon) or
 * https (Google profile photos).
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  next();
}

function originOf(url: string): string {
  return new URL(url).origin;
}

export interface App {
  express: Express;
  /** Releases timers held by the app (session pruning). The caller closes the database. */
  close(): void;
}

/** Everything the server does, assembled from explicit dependencies so tests can run it against an in-memory database. */
export function createApp(config: ServerConfig, db: Database): App {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // behind a TLS-terminating proxy, req.secure must follow X-Forwarded-Proto
  app.use(securityHeaders);

  // CORS only matters in split dev mode (UI on another origin); with one origin there's nothing to allow.
  if (originOf(config.frontendUrl) !== originOf(config.publicServerUrl)) {
    app.use(cors({ origin: originOf(config.frontendUrl), credentials: true }));
  }
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  const sessionStore = new SqliteSessionStore(db.sessions, SESSION_MAX_AGE_MS);
  app.use(
    session({
      name: SESSION_COOKIE_NAME,
      store: sessionStore,
      // An explicit secret wins; otherwise one is generated once and kept in the database,
      // so sessions survive restarts without ever falling back to a well-known default.
      secret: config.sessionSecret ?? db.secret(SESSION_SECRET_SETTING),
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: "lax", secure: config.secureCookies, maxAge: SESSION_MAX_AGE_MS },
    }),
  );

  const passport = createPassport(config, db);
  app.use(passport.initialize());
  app.use(passport.session());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", createAuthRouter({ config, passport, db }));
  app.use("/api/drawings", createDrawingsRouter(db));
  app.use("/api", (_req, res) => res.status(404).json({ error: "not found" }));

  // Single-process deployment: also serve the built UI (same origin, so no CORS).
  if (config.uiDistDir) {
    const dist = config.uiDistDir;
    app.use("/assets", express.static(path.join(dist, "assets"), { immutable: true, maxAge: "1y" })); // content-hashed filenames
    app.use(express.static(dist, { index: false }));
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(dist, "index.html"));
    });
  }

  app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    const status = typeof err.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500) console.error("[server] unhandled error:", err);
    const message =
      err.type === "entity.parse.failed" ? "request body is not valid JSON" : status >= 500 ? "internal server error" : err.message;
    res.status(status).json({ error: message });
  });

  return { express: app, close: () => sessionStore.close() };
}
