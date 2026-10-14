import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username, twoFactor } from "better-auth/plugins";
import argon2 from "argon2";
import * as authSchema from "./schema";
import type { createDatabase } from "../db";
import type { IdentityConfig } from "./config";
export const passwordOptions: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
};
// The engine is never mounted as a public handler. Only the guarded facade invokes it.
// Its adapter uses the caller's PostgreSQL transaction/lock, not an independent pool.
export function makeAuth(
  db: Omit<ReturnType<typeof createDatabase>["db"], "$client">,
  config: IdentityConfig,
  provision = false,
) {
  return betterAuth({
    appName: "Helios",
    baseURL: config.AUTH_ORIGIN,
    basePath: "/api/auth",
    secret: config.AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: authSchema,
      transaction: false,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !provision,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      password: {
        hash: (password) => argon2.hash(password, passwordOptions),
        verify: ({ hash, password }) => argon2.verify(hash, password),
      },
    },
    session: {
      expiresIn: 30 * 86400,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
      freshAge: 300,
    },
    advanced: {
      useSecureCookies: config.secure,
      cookiePrefix: "helios",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "strict",
        secure: config.secure,
        path: "/",
      },
      ipAddress: { disableIpTracking: true },
    },
    trustedOrigins: [config.AUTH_ORIGIN],
    rateLimit: { enabled: true, storage: "database", window: 60, max: 20 },
    logger: { disabled: true },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
        usernameValidator: (v) => /^[a-zA-Z0-9_.-]+$/.test(v),
      }),
      twoFactor({
        issuer: "Helios",
        skipVerificationOnEnable: false,
        twoFactorCookieMaxAge: 300,
        allowPasswordless: false,
        backupCodeOptions: {
          amount: 10,
          length: 20,
          storeBackupCodes: "encrypted",
        },
        accountLockout: {
          enabled: true,
          maxFailedAttempts: 10,
          durationSeconds: 300,
        },
      }),
    ],
  });
}
