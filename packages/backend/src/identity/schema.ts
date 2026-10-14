import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  bigint,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
export const user = pgTable(
  "auth_user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    username: text("username").unique(),
    displayUsername: text("display_username"),
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    singleton: boolean("singleton").notNull().default(true),
  },
  (t) => [
    uniqueIndex("auth_single_user").on(t.singleton),
    check("auth_singleton_true", sql`${t.singleton}=true`),
  ],
);
export const session = pgTable(
  "auth_session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("auth_session_user").on(t.userId)],
);
export const account = pgTable(
  "auth_account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("auth_credential_identity").on(t.providerId, t.accountId),
    index("auth_account_user").on(t.userId),
  ],
);
export const verification = pgTable(
  "auth_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("auth_verification_identifier").on(t.identifier)],
);
export const twoFactor = pgTable("auth_two_factor", {
  id: text("id").primaryKey(),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes").notNull(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  verified: boolean("verified").notNull().default(false),
  failedVerificationCount: integer("failed_verification_count")
    .notNull()
    .default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});
export const identityState = pgTable("auth_identity_state", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["pending", "active", "recovery"] }).notNull(),
  recoveryAcknowledgedAt: timestamp("recovery_acknowledged_at", {
    withTimezone: true,
  }),
});
export const sessionPolicy = pgTable("auth_session_policy", {
  sessionId: text("session_id")
    .primaryKey()
    .references(() => session.id, { onDelete: "cascade" }),
  purpose: text("purpose", {
    enum: ["enrollment", "full", "recovery"],
  }).notNull(),
  trusted: boolean("trusted").notNull().default(false),
  absoluteExpiresAt: timestamp("absolute_expires_at", {
    withTimezone: true,
  }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  mfaAt: timestamp("mfa_at", { withTimezone: true }),
  stepUpAt: timestamp("step_up_at", { withTimezone: true }),
  device: text("device").notNull(),
});
export const identityFlows = pgTable("auth_flows", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["bootstrap", "login"] }).notNull(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  trusted: boolean("trusted").notNull().default(false),
  returnTo: text("return_to").notNull().default("/"),
});
export const totpUses = pgTable("auth_totp_uses", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const authLimits = pgTable("auth_limits", {
  id: text("id").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
export const securityEvents = pgTable("security_events", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const rateLimit = pgTable("auth_rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
