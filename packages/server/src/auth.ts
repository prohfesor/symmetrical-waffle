import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import type { ServerConfig } from "./config";
import type { Database, UserRow } from "./db";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // Declaration merging: makes req.user a UserRow.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends UserRow {}
  }
}

/** One Passport instance per app (rather than the global singleton). */
export type PassportInstance = InstanceType<typeof passport.Passport>;

export const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";

/**
 * Builds a Passport instance for this app (not the global singleton, so tests
 * and multiple apps in one process can't share strategies or session wiring).
 */
export function createPassport(config: ServerConfig, db: Database): PassportInstance {
  const instance = new passport.Passport();

  instance.serializeUser((user: Express.User, done) => done(null, user.id));
  instance.deserializeUser((id: string, done) => done(null, db.users.findById(id) ?? false));

  if (config.google) {
    instance.use(
      new GoogleStrategy(
        {
          clientID: config.google.clientId,
          clientSecret: config.google.clientSecret,
          callbackURL: `${config.publicServerUrl}${GOOGLE_CALLBACK_PATH}`,
        },
        (_accessToken, _refreshToken, profile, done) => {
          done(
            null,
            db.users.upsert({
              id: `google:${profile.id}`,
              email: profile.emails?.[0]?.value ?? `${profile.id}@google`,
              name: profile.displayName,
              avatarUrl: profile.photos?.[0]?.value,
            }),
          );
        },
      ),
    );
  }

  return instance;
}
