import { Router } from "express";
import passport from "passport";
import { hasRealGoogleCredentials } from "../auth";
import { upsertUser } from "../db";

/** `frontendUrl` is resolved once in index.ts (see its comment) and threaded through here so there's a single source of truth for where a successful/failed login redirects. */
export function createAuthRouter(frontendUrl: string): Router {
  const authRouter = Router();

  authRouter.get("/me", (req, res) => {
    res.json({ user: req.user ?? null, devMode: !hasRealGoogleCredentials });
  });

  if (hasRealGoogleCredentials) {
    authRouter.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));
    authRouter.get(
      "/google/callback",
      passport.authenticate("google", { failureRedirect: `${frontendUrl}/?authError=1` }),
      (_req, res) => res.redirect(frontendUrl),
    );
  } else {
    /**
     * Dev-only stub login, active only while GOOGLE_CLIENT_ID/SECRET are unset.
     * Logs in (creating on first use) a local user identified by the email
     * query param -- no password, no verification. Automatically disabled the
     * moment real Google credentials are configured; see README.
     */
    authRouter.get("/dev-login", (req, res) => {
      const email = String(req.query.email ?? "dev@example.com");
      const name = String(req.query.name ?? "Dev User");
      const user = upsertUser({ id: `dev:${email}`, email, name });
      req.login(user, (err) => {
        if (err) {
          res.status(500).json({ error: "login failed" });
          return;
        }
        res.redirect(frontendUrl);
      });
    });
  }

  authRouter.post("/logout", (req, res) => {
    req.logout(() => {
      res.json({ ok: true });
    });
  });

  return authRouter;
}
