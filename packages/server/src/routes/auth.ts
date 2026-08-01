import { Router } from "express";
import passport from "passport";
import { hasRealGoogleCredentials } from "../auth";
import { upsertUser } from "../db";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

export const authRouter = Router();

authRouter.get("/me", (req, res) => {
  res.json({ user: req.user ?? null, devMode: !hasRealGoogleCredentials });
});

if (hasRealGoogleCredentials) {
  authRouter.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));
  authRouter.get(
    "/google/callback",
    passport.authenticate("google", { failureRedirect: `${FRONTEND_URL}/?authError=1` }),
    (_req, res) => res.redirect(FRONTEND_URL),
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
      res.redirect(FRONTEND_URL);
    });
  });
}

authRouter.post("/logout", (req, res) => {
  req.logout(() => {
    res.json({ ok: true });
  });
});
