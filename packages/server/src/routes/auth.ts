import { Request, Response, Router } from "express";
import type { PassportInstance } from "../auth";
import type { ServerConfig } from "../config";
import type { Database, UserRow } from "../db";

/** What the client is allowed to know about a user (no internal ids/timestamps beyond what it needs). */
export function toPublicUser(user: UserRow) {
  return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatar_url };
}

const DEV_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

interface AuthRouterDeps {
  config: ServerConfig;
  passport: PassportInstance;
  db: Database;
}

export function createAuthRouter({ config, passport, db }: AuthRouterDeps): Router {
  const router = Router();
  const { frontendUrl } = config;

  router.get("/me", (req, res) => {
    res.json({ user: req.user ? toPublicUser(req.user) : null, loginMode: config.loginMode });
  });

  if (config.loginMode === "google") {
    router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));
    router.get(
      "/google/callback",
      passport.authenticate("google", { failureRedirect: `${frontendUrl}/?authError=1` }),
      (_req: Request, res: Response) => res.redirect(frontendUrl),
    );
  }

  if (config.loginMode === "dev") {
    /**
     * Development stub: logs in (creating on first use) whoever the `email`
     * query parameter names -- no password, no verification. Only mounted when
     * no Google credentials are configured and the config allows it (see
     * loadConfig); it never exists alongside real Google sign-in.
     */
    router.get("/dev-login", (req, res) => {
      const email = String(req.query.email ?? "dev@example.com")
        .trim()
        .slice(0, 254);
      const name = String(req.query.name ?? "Dev User")
        .trim()
        .slice(0, 100);
      if (!DEV_EMAIL_PATTERN.test(email)) {
        res.status(400).json({ error: "email is invalid" });
        return;
      }
      const user = db.users.upsert({ id: `dev:${email}`, email, name });
      req.login(user, (err) => {
        if (err) {
          res.status(500).json({ error: "login failed" });
          return;
        }
        res.redirect(frontendUrl);
      });
    });
  }

  router.post("/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => res.json({ ok: true }));
    });
  });

  return router;
}
