import "dotenv/config";
import cors from "cors";
import express from "express";
import session from "express-session";
import passport from "passport";
import * as fs from "node:fs";
import * as path from "node:path";
import { configurePassport } from "./auth";
import { authRouter } from "./routes/auth";
import { drawingsRouter } from "./routes/drawings";

const PORT = Number(process.env.PORT ?? 8787);
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";
const PUBLIC_SERVER_URL = process.env.PUBLIC_SERVER_URL ?? `http://localhost:${PORT}`;
const isProd = process.env.NODE_ENV === "production";

if (!process.env.SESSION_SECRET) {
  // eslint-disable-next-line no-console
  console.warn("[server] SESSION_SECRET not set -- using an insecure default. Set it before deploying for real.");
}

configurePassport(PUBLIC_SERVER_URL);

const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(
  session({
    secret: process.env.SESSION_SECRET ?? "dev-only-insecure-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", secure: isProd, maxAge: 30 * 24 * 60 * 60 * 1000 },
  }),
);
app.use(passport.initialize());
app.use(passport.session());

app.use("/api/auth", authRouter);
app.use("/api/drawings", drawingsRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// In production, serve the built ui bundle from the same server (same-origin,
// no CORS needed) so the whole app is a single deployable process.
const uiDist = path.join(__dirname, "../../ui/dist");
if (fs.existsSync(uiDist)) {
  app.use(express.static(uiDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(path.join(uiDist, "index.html"));
  });
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${PORT}`);
});
