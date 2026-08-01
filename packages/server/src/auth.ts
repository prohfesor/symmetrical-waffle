import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { findUserById, upsertUser, UserRow } from "./db";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User extends UserRow {}
  }
}

const CALLBACK_PATH = "/api/auth/google/callback";

export const hasRealGoogleCredentials = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function configurePassport(publicServerUrl: string): void {
  passport.serializeUser((user: Express.User, done) => done(null, user.id));
  passport.deserializeUser((id: string, done) => {
    const user = findUserById(id);
    done(null, user ?? false);
  });

  if (hasRealGoogleCredentials) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          callbackURL: `${publicServerUrl}${CALLBACK_PATH}`,
        },
        (_accessToken, _refreshToken, profile, done) => {
          const email = profile.emails?.[0]?.value ?? `${profile.id}@google`;
          const user = upsertUser({
            id: `google:${profile.id}`,
            email,
            name: profile.displayName,
            avatarUrl: profile.photos?.[0]?.value,
          });
          done(null, user);
        },
      ),
    );
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      "[auth] GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set -- real Google sign-in is disabled. " +
        "Using the /api/auth/dev-login stub instead. See README for how to add real credentials.",
    );
  }
}
