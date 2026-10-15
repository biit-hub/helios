import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, ne, lt } from "drizzle-orm";
import { z } from "zod";
import qrcode from "qrcode";
import argon2 from "argon2";
import { makeSignature } from "better-auth/crypto";
import type { createDatabase } from "../db";
import * as appSchema from "../schema";
import * as s from "./schema";
import { makeAuth, passwordOptions } from "./engine";
import type { IdentityConfig } from "./config";
import {
  AuthFault,
  DURATIONS,
  safeReturnTo,
  assertRequest,
  assertSessionPolicy,
  credentials,
  passwordInput,
  codeInput,
  deviceLabel,
} from "./policy";
type Database = ReturnType<typeof createDatabase>;
type Db = Omit<Database["db"], "$client">;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
type Result = {
  body: Record<string, unknown>;
  status?: number;
  cookies?: string[];
};
const error = (fault: AuthFault): Result => ({
  body: {
    error: {
      code: fault.code,
      message:
        fault.code === "STEP_UP_REQUIRED"
          ? "Bitte mit Passwort und neuem Authenticator-Code bestätigen."
          : fault.status === 429
            ? "Zu viele Versuche. Bitte später erneut versuchen."
            : "Die Anfrage konnte nicht bestätigt werden.",
    },
  },
  status: fault.status,
});
function cookieValue(headers: Headers, name: string) {
  const cookies = headers.get("cookie") ?? "";
  return (
    cookies
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(name + "="))
      ?.slice(name.length + 1) ?? ""
  );
}
function prefix(config: IdentityConfig) {
  return config.secure ? "__Secure-helios" : "helios";
}
function baseHeaders(headers: Headers, config: IdentityConfig) {
  const clean = new Headers({
    host: new URL(config.AUTH_ORIGIN).host,
    origin: config.AUTH_ORIGIN,
    "content-type": "application/json",
  });
  const cookie = headers.get("cookie");
  if (cookie)
    clean.set(
      "cookie",
      cookie
        .split(";")
        .filter((v) => v.trim().startsWith(prefix(config) + "."))
        .join(";"),
    );
  clean.set("user-agent", deviceLabel(headers.get("user-agent")));
  return clean;
}
function absorb(headers: Headers, response: Response, cookies: string[]) {
  const values = response.headers.getSetCookie();
  const jar = new Map(
    (headers.get("cookie") ?? "")
      .split(";")
      .filter(Boolean)
      .map((v) => {
        const i = v.indexOf("=");
        return [v.slice(0, i).trim(), v.slice(i + 1)] as const;
      }),
  );
  for (const value of values) {
    cookies.push(value);
    const part = value.split(";")[0]!;
    const i = part.indexOf("=");
    const name = part.slice(0, i);
    if (/Max-Age=0/i.test(value)) jar.delete(name);
    else jar.set(name, part.slice(i + 1));
  }
  headers.set("cookie", [...jar].map(([k, v]) => k + "=" + v).join("; "));
}
// All identity transitions share a DB advisory lock. This serializes a single user's
// bootstrap, enrollment, MFA/recovery consumption, policy checks and revocations.
async function transaction<T>(
  database: Database,
  config: IdentityConfig,
  fn: (db: Db, auth: ReturnType<typeof makeAuth>) => Promise<T>,
  provision = false,
) {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = 10000");
    await client.query("SELECT pg_advisory_xact_lock(1748012)");
    const db = drizzle(client, { schema: appSchema });
    let result: T;
    try {
      result = await fn(db, makeAuth(db, config, provision));
    } catch (e) {
      if (e instanceof AuthFault) {
        await client.query("COMMIT");
        throw e;
      }
      throw e;
    }
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
async function event(db: Db, code: string) {
  await db.insert(s.securityEvents).values({ id: randomUUID(), code });
}
async function call(
  response: Promise<Response>,
  headers: Headers,
  cookies: string[],
) {
  const r = await response;
  if (!r.ok) throw new AuthFault();
  const body = (await r.json()) as Record<string, unknown>;
  absorb(headers, r, cookies);
  return body;
}
async function passwordCheck(db: Db, userId: string, password: string) {
  const [account] = await db
    .select()
    .from(s.account)
    .where(
      and(eq(s.account.userId, userId), eq(s.account.providerId, "credential")),
    );
  if (!account?.password || !(await argon2.verify(account.password, password)))
    throw new AuthFault();
}
async function consumeTotp(
  db: Db,
  config: IdentityConfig,
  userId: string,
  code: string,
) {
  await db.delete(s.totpUses).where(lt(s.totpUses.expiresAt, new Date()));
  const id = createHmac("sha256", config.AUTH_SECRET)
    .update(userId + ":" + code)
    .digest("hex");
  const rows = await db
    .insert(s.totpUses)
    .values({ id, expiresAt: new Date(Date.now() + 90000) })
    .onConflictDoNothing()
    .returning();
  if (!rows.length) throw new AuthFault("CODE_ALREADY_USED", 401);
}
async function policyFor(
  db: Db,
  auth: ReturnType<typeof makeAuth>,
  headers: Headers,
) {
  const current = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!current) throw new AuthFault();
  const [policy] = await db
    .select()
    .from(s.sessionPolicy)
    .where(eq(s.sessionPolicy.sessionId, current.session.id));
  const [state] = await db
    .select()
    .from(s.identityState)
    .where(eq(s.identityState.userId, current.user.id));
  if (!policy || !state || policy.absoluteExpiresAt <= new Date())
    throw new AuthFault();
  return { current, policy, state };
}
async function active(
  db: Db,
  auth: ReturnType<typeof makeAuth>,
  headers: Headers,
  stepUp = false,
) {
  const value = await policyFor(db, auth, headers);
  assertSessionPolicy(
    value.policy,
    value.state.status,
    !!value.current.user.twoFactorEnabled,
    new Date(),
    stepUp,
  );
  await db
    .update(s.sessionPolicy)
    .set({ lastSeenAt: new Date() })
    .where(eq(s.sessionPolicy.sessionId, value.current.session.id));
  return value;
}
async function setPolicy(
  db: Db,
  token: string,
  purpose: "full" | "enrollment" | "recovery",
  trusted: boolean,
  agent: string | null,
  mfa = false,
) {
  const [session] = await db
    .select()
    .from(s.session)
    .where(eq(s.session.token, token));
  if (!session) throw new AuthFault();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() +
      (purpose === "full"
        ? trusted
          ? DURATIONS.trusted
          : DURATIONS.normal
        : DURATIONS.enrollment),
  );
  await db
    .update(s.session)
    .set({ expiresAt, userAgent: deviceLabel(agent), ipAddress: null })
    .where(eq(s.session.id, session.id));
  await db
    .insert(s.sessionPolicy)
    .values({
      sessionId: session.id,
      purpose,
      trusted,
      absoluteExpiresAt: expiresAt,
      lastSeenAt: now,
      mfaAt: mfa ? now : null,
      stepUpAt: null,
      device: deviceLabel(agent),
    })
    .onConflictDoUpdate({
      target: s.sessionPolicy.sessionId,
      set: {
        purpose,
        trusted,
        absoluteExpiresAt: expiresAt,
        lastSeenAt: now,
        mfaAt: mfa ? now : null,
        stepUpAt: null,
        device: deviceLabel(agent),
      },
    });
  return session;
}
async function sessionCookie(
  auth: ReturnType<typeof makeAuth>,
  config: IdentityConfig,
  token: string,
  maxAge: number,
) {
  const context = await auth.$context;
  const signed = token + "." + (await makeSignature(token, config.AUTH_SECRET));
  const name = context.authCookies.sessionToken.name;
  return (
    name +
    "=" +
    encodeURIComponent(signed) +
    "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" +
    maxAge +
    (config.secure ? "; Secure" : "")
  );
}
async function throttle(database: Database, key: string, max: number) {
  const r = await database.pool.query(
    "INSERT INTO auth_limits(id,count,reset_at) VALUES($1,1,now()+interval '1 minute') ON CONFLICT(id) DO UPDATE SET count=CASE WHEN auth_limits.reset_at<=now() THEN 1 ELSE auth_limits.count+1 END,reset_at=CASE WHEN auth_limits.reset_at<=now() THEN now()+interval '1 minute' ELSE auth_limits.reset_at END RETURNING count",
    [digest(key)],
  );
  if (Number(r.rows[0].count) > max) throw new AuthFault("RATE_LIMITED", 429);
}
export async function bootstrapIdentity(
  database: Database,
  config: IdentityConfig,
  username: string,
  password: string,
) {
  const input = z
    .strictObject({
      username: z
        .string()
        .min(3)
        .max(30)
        .regex(/^[a-zA-Z0-9_.-]+$/),
      password: passwordInput,
    })
    .parse({ username, password });
  return transaction(
    database,
    config,
    async (db, auth) => {
      if ((await db.select({ id: s.user.id }).from(s.user)).length)
        throw new AuthFault("ACCOUNT_ALREADY_EXISTS", 409);
      const r = await auth.api.signUpEmail({
        body: {
          name: input.username,
          email: randomUUID() + "@helios.invalid",
          password: input.password,
          username: input.username,
        },
        asResponse: true,
      });
      if (!r.ok) throw new Error("Bootstrap failed");
      const body = await r.json();
      await db
        .insert(s.identityState)
        .values({ userId: body.user.id, status: "pending" });
      const proof = randomBytes(32).toString("hex");
      await db.insert(s.identityFlows).values({
        id: digest(proof),
        kind: "bootstrap",
        userId: body.user.id,
        expiresAt: new Date(Date.now() + DURATIONS.enrollment),
      });
      await event(db, "bootstrap_created");
      return { proof, expiresInMinutes: 10 };
    },
    true,
  );
}
export async function adminRecovery(
  database: Database,
  config: IdentityConfig,
  newPassword: string,
) {
  passwordInput.parse(newPassword);
  return transaction(database, config, async (db, auth) => {
    const [user] = await db.select().from(s.user);
    if (!user) throw new AuthFault();
    await db.delete(s.session).where(eq(s.session.userId, user.id));
    await db.delete(s.verification);
    await db.delete(s.identityFlows);
    const hash = await argon2.hash(newPassword, passwordOptions);
    const ctx = await auth.$context;
    await ctx.internalAdapter.updatePassword(user.id, hash);
    await db
      .update(s.identityState)
      .set({ status: "recovery", recoveryAcknowledgedAt: null })
      .where(eq(s.identityState.userId, user.id));
    const proof = randomBytes(32).toString("hex");
    await db.insert(s.identityFlows).values({
      id: digest(proof),
      kind: "bootstrap",
      userId: user.id,
      expiresAt: new Date(Date.now() + DURATIONS.enrollment),
    });
    await event(db, "local_admin_recovery");
    return { proof, expiresInMinutes: 10 };
  });
}
export function createIdentityService(
  database: Database,
  config: IdentityConfig,
) {
  return {
    async withActive<T>(
      headers: Headers,
      options: { mutation?: boolean; stepUp?: boolean },
      fn: (db: Db, userId: string, sessionId: string) => Promise<T>,
    ): Promise<T> {
      if (config.RESTORE_MODE) throw new AuthFault("RESTORE_BLOCKED", 503);
      assertRequest(headers, config, options.mutation ?? false);
      return transaction(database, config, async (db, auth) => {
        const value = await active(
          db,
          auth,
          baseHeaders(headers, config),
          options.stepUp ?? false,
        );
        return fn(db, value.current.user.id, value.current.session.id);
      });
    },
    // Internal configured read jobs may update derived local data while signed out.
    // This grants no authority to execute native Todoist writes or renew sessions.
    async withBackgroundUser<T>(
      userId: string,
      fn: (db: Db) => Promise<T>,
    ): Promise<T> {
      if (config.RESTORE_MODE) throw new AuthFault("RESTORE_BLOCKED", 503);
      return transaction(database, config, async (db) => {
        const [state] = await db
          .select()
          .from(s.identityState)
          .where(eq(s.identityState.userId, userId));
        const [user] = await db
          .select()
          .from(s.user)
          .where(eq(s.user.id, userId));
        if (state?.status !== "active" || !user?.twoFactorEnabled)
          throw new AuthFault();
        return fn(db);
      });
    },
    // Internal worker guard: session IDs come only from persisted, guarded user intent.
    // Background execution must never renew idle activity or manufacture cookies.
    async withOperationSession<T>(
      sessionId: string,
      userId: string,
      fn: (db: Db) => Promise<T>,
    ): Promise<T> {
      if (config.RESTORE_MODE) throw new AuthFault("RESTORE_BLOCKED", 503);
      return transaction(database, config, async (db) => {
        const [session] = await db
          .select()
          .from(s.session)
          .where(
            and(eq(s.session.id, sessionId), eq(s.session.userId, userId)),
          );
        const [policy] = await db
          .select()
          .from(s.sessionPolicy)
          .where(eq(s.sessionPolicy.sessionId, sessionId));
        const [state] = await db
          .select()
          .from(s.identityState)
          .where(eq(s.identityState.userId, userId));
        const [user] = await db
          .select()
          .from(s.user)
          .where(eq(s.user.id, userId));
        if (
          !session ||
          session.expiresAt <= new Date() ||
          !policy ||
          !state ||
          !user
        )
          throw new AuthFault();
        assertSessionPolicy(
          policy,
          state.status,
          user.twoFactorEnabled,
          new Date(),
        );
        return fn(db);
      });
    },
    async requireActive(headers: Headers, stepUp = false) {
      if (config.RESTORE_MODE) throw new AuthFault("RESTORE_BLOCKED", 503);
      assertRequest(headers, config);
      return transaction(database, config, (db, auth) =>
        active(db, auth, baseHeaders(headers, config), stepUp),
      );
    },
    async enrollmentPurpose(headers: Headers) {
      try {
        return await transaction(database, config, async (db, auth) => {
          const { policy } = await policyFor(
            db,
            auth,
            baseHeaders(headers, config),
          );
          return policy.purpose;
        });
      } catch {
        return null;
      }
    },
    async handle(
      action: string,
      headers: Headers,
      input: unknown,
      method = "POST",
    ): Promise<Result> {
      try {
        if (!["GET", "POST"].includes(method))
          throw new AuthFault("METHOD_NOT_ALLOWED", 405);
        assertRequest(headers, config, method !== "GET");
        if (config.RESTORE_MODE) throw new AuthFault("RESTORE_BLOCKED", 503);
        if (method === "GET" && action !== "sessions")
          throw new AuthFault("NOT_FOUND", 404);
        if (
          ![
            "login",
            "mfa",
            "recover",
            "setup",
            "verify-enrollment",
            "activate",
            "step-up",
            "sessions",
            "revoke",
            "revoke-others",
            "password",
            "rotate-totp",
            "rotate-recovery",
            "logout",
          ].includes(action)
        )
          throw new AuthFault("NOT_FOUND", 404);
        if (method === "POST") {
          await throttle(
            database,
            "global:" + action,
            action === "login" ? 20 : 30,
          );
          await throttle(
            database,
            action +
              ":" +
              (action === "login"
                ? String(
                    (input as { username?: unknown })?.username ?? "",
                  ).toLowerCase()
                : digest(headers.get("cookie") ?? "")),
            5,
          );
        }
        return await transaction(database, config, async (db, auth) => {
          const h = baseHeaders(headers, config);
          const cookies: string[] = [];
          if (action === "login") {
            const data = credentials.parse(input);
            h.delete("cookie");
            const body = await call(
              auth.api.signInUsername({
                body: {
                  username: data.username,
                  password: data.password,
                  rememberMe: true,
                },
                headers: h,
                asResponse: true,
              }),
              h,
              cookies,
            );
            if (body.twoFactorRedirect !== true) throw new AuthFault();
            const key = cookieValue(h, prefix(config) + ".two_factor");
            if (!key) throw new AuthFault();
            await db.insert(s.identityFlows).values({
              id: digest(key),
              kind: "login",
              expiresAt: new Date(Date.now() + DURATIONS.challenge),
              trusted: data.trusted,
              returnTo: safeReturnTo(data.returnTo),
            });
            return { body: { challenge: true }, cookies };
          }
          if (action === "mfa" || action === "recover") {
            const data = z
              .strictObject({
                code: action === "mfa" ? codeInput : z.string().min(1).max(100),
              })
              .parse(input);
            const key = cookieValue(h, prefix(config) + ".two_factor");
            const [flow] = await db
              .select()
              .from(s.identityFlows)
              .where(eq(s.identityFlows.id, digest(key)));
            if (
              !key ||
              !flow ||
              flow.kind !== "login" ||
              flow.expiresAt <= new Date()
            )
              throw new AuthFault();
            h.set(
              "cookie",
              (h.get("cookie") ?? "")
                .split(";")
                .filter(
                  (v) =>
                    !v.trim().startsWith(prefix(config) + ".session_token="),
                )
                .join(";"),
            );
            await call(
              action === "mfa"
                ? auth.api.verifyTOTP({
                    body: { code: data.code, trustDevice: false },
                    headers: h,
                    asResponse: true,
                  })
                : auth.api.verifyBackupCode({
                    body: {
                      code: data.code,
                      trustDevice: false,
                      disableSession: false,
                    },
                    headers: h,
                    asResponse: true,
                  }),
              h,
              cookies,
            );
            const confirmedSession = (
              await auth.api.getSession({
                headers: h,
                query: { disableCookieCache: true },
              })
            )?.session;
            if (!confirmedSession) throw new AuthFault();
            const token = confirmedSession.token;
            const [state] = await db
              .select()
              .from(s.identityState)
              .where(eq(s.identityState.userId, confirmedSession.userId));
            if (state?.status !== "active") throw new AuthFault();
            if (action === "mfa") {
              try {
                await consumeTotp(
                  db,
                  config,
                  confirmedSession.userId,
                  data.code,
                );
              } catch (e) {
                await db
                  .delete(s.session)
                  .where(eq(s.session.id, confirmedSession.id));
                throw e;
              }
            }
            const session = await setPolicy(
              db,
              token,
              action === "mfa" ? "full" : "recovery",
              action === "mfa" && flow.trusted,
              headers.get("user-agent"),
              action === "mfa",
            );
            if (action === "recover") {
              await db
                .delete(s.session)
                .where(
                  and(
                    eq(s.session.userId, session.userId),
                    ne(s.session.id, session.id),
                  ),
                );
              await db.delete(s.verification);
              await db.delete(s.identityFlows);
              await db
                .update(s.identityState)
                .set({ status: "recovery", recoveryAcknowledgedAt: null })
                .where(eq(s.identityState.userId, session.userId));
            }
            await db
              .delete(s.identityFlows)
              .where(eq(s.identityFlows.id, flow.id));
            cookies.push(
              await sessionCookie(
                auth,
                config,
                token,
                action === "mfa"
                  ? flow.trusted
                    ? 30 * 86400
                    : 12 * 3600
                  : 600,
              ),
            );
            await event(
              db,
              action === "mfa"
                ? "login_mfa_completed"
                : "recovery_code_consumed",
            );
            return {
              body: { next: action === "mfa" ? flow.returnTo : "/setup" },
              cookies,
            };
          }
          if (action === "setup") {
            const data = z
              .strictObject({
                token: z.string().length(64).optional(),
                password: z.string().min(1).max(128),
              })
              .parse(input);
            let userId: string;
            if (data.token) {
              const [flow] = await db
                .select()
                .from(s.identityFlows)
                .where(eq(s.identityFlows.id, digest(data.token)));
              if (
                !flow ||
                flow.kind !== "bootstrap" ||
                !flow.userId ||
                flow.expiresAt <= new Date()
              )
                throw new AuthFault();
              userId = flow.userId;
              await passwordCheck(db, userId, data.password);
              const ctx = await auth.$context;
              const bridge = await ctx.internalAdapter.createSession(
                userId,
                false,
              );
              if (!bridge) throw new AuthFault();
              cookies.push(
                await sessionCookie(auth, config, bridge.token, 600),
              );
              h.set("cookie", cookies.at(-1)!.split(";")[0]!);
              await setPolicy(
                db,
                bridge.token,
                "recovery",
                false,
                headers.get("user-agent"),
              );
              await db
                .delete(s.identityFlows)
                .where(eq(s.identityFlows.id, flow.id));
            } else {
              const value = await policyFor(db, auth, h);
              if (
                !["enrollment", "recovery"].includes(value.policy.purpose) ||
                value.state.status === "active"
              )
                throw new AuthFault();
              userId = value.current.user.id;
              await passwordCheck(db, userId, data.password);
            }
            const [state] = await db
              .select()
              .from(s.identityState)
              .where(eq(s.identityState.userId, userId));
            if (!state || state.status === "active") throw new AuthFault();
            const ctx = await auth.$context;
            await ctx.internalAdapter.updateUser(userId, {
              twoFactorEnabled: false,
            });
            await db.delete(s.twoFactor).where(eq(s.twoFactor.userId, userId));
            const body = await call(
              auth.api.enableTwoFactor({
                body: { password: data.password, method: "totp" },
                headers: h,
                asResponse: true,
              }),
              h,
              cookies,
            );
            const session = (await auth.api.getSession({ headers: h }))
              ?.session;
            if (!session) throw new AuthFault();
            await setPolicy(
              db,
              session.token,
              "enrollment",
              false,
              headers.get("user-agent"),
            );
            await db
              .update(s.identityState)
              .set({ recoveryAcknowledgedAt: null })
              .where(eq(s.identityState.userId, userId));
            const uri = new URL(z.string().parse(body.totpURI));
            const [owner] = await db
              .select({ username: s.user.username })
              .from(s.user)
              .where(eq(s.user.id, userId));
            uri.pathname =
              "/" +
              encodeURIComponent("Helios:" + (owner?.username ?? "Konto"));
            const totpURI = uri.toString();
            const qr = await qrcode.toDataURL(totpURI, {
              errorCorrectionLevel: "M",
              margin: 2,
              width: 260,
            });
            await event(db, "enrollment_started");
            return { body: { qr, totpURI }, cookies };
          }
          if (action === "verify-enrollment") {
            const data = z.strictObject({ code: codeInput }).parse(input);
            const value = await policyFor(db, auth, h);
            if (
              value.policy.purpose !== "enrollment" ||
              value.state.status === "active" ||
              value.policy.mfaAt
            )
              throw new AuthFault();
            await call(
              auth.api.verifyTOTP({
                body: { code: data.code, trustDevice: false },
                headers: h,
                asResponse: true,
              }),
              h,
              cookies,
            );
            await consumeTotp(db, config, value.current.user.id, data.code);
            const confirmedSession = (
              await auth.api.getSession({
                headers: h,
                query: { disableCookieCache: true },
              })
            )?.session;
            if (!confirmedSession) throw new AuthFault();
            const token = confirmedSession.token;
            await setPolicy(
              db,
              token,
              "enrollment",
              false,
              headers.get("user-agent"),
              true,
            );
            const codes = await auth.api.viewBackupCodes({
              body: { userId: value.current.user.id },
            });
            await event(db, "enrollment_totp_verified");
            return { body: { backupCodes: codes.backupCodes }, cookies };
          }
          if (action === "activate") {
            z.strictObject({ saved: z.literal(true) }).parse(input);
            const value = await policyFor(db, auth, h);
            const [factor] = await db
              .select()
              .from(s.twoFactor)
              .where(eq(s.twoFactor.userId, value.current.user.id));
            if (
              value.policy.purpose !== "enrollment" ||
              !value.policy.mfaAt ||
              value.state.status === "active" ||
              !factor?.verified ||
              !value.current.user.twoFactorEnabled
            )
              throw new AuthFault();
            await db
              .delete(s.session)
              .where(
                and(
                  eq(s.session.userId, value.current.user.id),
                  ne(s.session.id, value.current.session.id),
                ),
              );
            await db.delete(s.verification);
            await db.delete(s.identityFlows);
            await db
              .update(s.identityState)
              .set({ status: "active", recoveryAcknowledgedAt: new Date() })
              .where(eq(s.identityState.userId, value.current.user.id));
            await setPolicy(
              db,
              value.current.session.token,
              "full",
              false,
              headers.get("user-agent"),
              true,
            );
            cookies.push(
              await sessionCookie(
                auth,
                config,
                value.current.session.token,
                12 * 3600,
              ),
            );
            await event(db, "account_activated");
            return { body: { next: "/" }, cookies };
          }
          if (action === "logout") {
            const current = await auth.api.getSession({ headers: h });
            if (current) {
              await db
                .delete(s.session)
                .where(eq(s.session.id, current.session.id));
              await event(db, "session_logged_out");
            }
            const name = (await auth.$context).authCookies.sessionToken.name;
            cookies.push(
              name +
                "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" +
                (config.secure ? "; Secure" : ""),
            );
            return { body: { next: "/login" }, cookies };
          }
          const value = await active(
            db,
            auth,
            h,
            [
              "revoke",
              "revoke-others",
              "password",
              "rotate-totp",
              "rotate-recovery",
            ].includes(action),
          );
          if (action === "sessions") {
            const rows = await db
              .select({
                id: s.session.id,
                createdAt: s.session.createdAt,
                expiresAt: s.sessionPolicy.absoluteExpiresAt,
                lastSeenAt: s.sessionPolicy.lastSeenAt,
                trusted: s.sessionPolicy.trusted,
                device: s.sessionPolicy.device,
              })
              .from(s.session)
              .innerJoin(
                s.sessionPolicy,
                eq(s.session.id, s.sessionPolicy.sessionId),
              )
              .where(
                and(
                  eq(s.session.userId, value.current.user.id),
                  eq(s.sessionPolicy.purpose, "full"),
                ),
              );
            return {
              body: {
                sessions: rows
                  .filter(
                    (r) =>
                      r.expiresAt > new Date() &&
                      (r.trusted ||
                        Date.now() - r.lastSeenAt.getTime() < DURATIONS.idle),
                  )
                  .map((r) => ({
                    ...r,
                    current: r.id === value.current.session.id,
                  })),
              },
            };
          }
          if (action === "step-up") {
            const data = z
              .strictObject({
                password: z.string().min(1).max(128),
                code: codeInput,
              })
              .parse(input);
            await passwordCheck(db, value.current.user.id, data.password);
            await call(
              auth.api.verifyTOTP({
                body: { code: data.code, trustDevice: false },
                headers: h,
                asResponse: true,
              }),
              h,
              cookies,
            );
            await consumeTotp(db, config, value.current.user.id, data.code);
            await db
              .update(s.sessionPolicy)
              .set({ stepUpAt: new Date() })
              .where(eq(s.sessionPolicy.sessionId, value.current.session.id));
            await event(db, "step_up_completed");
            return { body: { confirmed: true }, cookies };
          }
          if (action === "revoke") {
            const data = z
              .strictObject({ id: z.string().min(1).max(128) })
              .parse(input);
            if (data.id === value.current.session.id)
              throw new AuthFault("USE_LOGOUT", 400);
            await db
              .delete(s.session)
              .where(
                and(
                  eq(s.session.id, data.id),
                  eq(s.session.userId, value.current.user.id),
                ),
              );
            await event(db, "session_revoked");
            return { body: { ok: true } };
          }
          if (action === "revoke-others") {
            z.strictObject({}).parse(input);
            await db
              .delete(s.session)
              .where(
                and(
                  eq(s.session.userId, value.current.user.id),
                  ne(s.session.id, value.current.session.id),
                ),
              );
            await event(db, "other_sessions_revoked");
            return { body: { ok: true } };
          }
          if (action === "password") {
            const data = z
              .strictObject({
                password: z.string().min(1).max(128),
                newPassword: passwordInput,
              })
              .parse(input);
            await call(
              auth.api.changePassword({
                body: {
                  currentPassword: data.password,
                  newPassword: data.newPassword,
                  revokeOtherSessions: true,
                },
                headers: h,
                asResponse: true,
              }),
              h,
              cookies,
            );
            await db
              .delete(s.session)
              .where(eq(s.session.userId, value.current.user.id));
            await event(db, "password_changed");
            return { body: { next: "/login" }, cookies };
          }
          if (action === "rotate-recovery") {
            const data = z
              .strictObject({ password: z.string().min(1).max(128) })
              .parse(input);
            const body = await call(
              auth.api.generateBackupCodes({
                body: { password: data.password },
                headers: h,
                asResponse: true,
              }),
              h,
              cookies,
            );
            await event(db, "recovery_codes_rotated");
            return { body: { backupCodes: body.backupCodes }, cookies };
          }
          if (action === "rotate-totp") {
            const data = z
              .strictObject({ password: z.string().min(1).max(128) })
              .parse(input);
            await passwordCheck(db, value.current.user.id, data.password);
            await db
              .delete(s.session)
              .where(eq(s.session.userId, value.current.user.id));
            await db.delete(s.verification);
            await db.delete(s.identityFlows);
            await db
              .update(s.identityState)
              .set({ status: "recovery", recoveryAcknowledgedAt: null })
              .where(eq(s.identityState.userId, value.current.user.id));
            const ctx = await auth.$context;
            const bridge = await ctx.internalAdapter.createSession(
              value.current.user.id,
              false,
            );
            if (!bridge) throw new AuthFault();
            await setPolicy(
              db,
              bridge.token,
              "recovery",
              false,
              headers.get("user-agent"),
            );
            cookies.push(await sessionCookie(auth, config, bridge.token, 600));
            await event(db, "totp_rotation_requested");
            return { body: { next: "/setup" }, cookies };
          }
          throw new AuthFault("NOT_FOUND", 404);
        });
      } catch (e) {
        if (e instanceof AuthFault) return error(e);
        if (e instanceof z.ZodError)
          return error(new AuthFault("INVALID_REQUEST", 400));
        console.error(
          JSON.stringify({ level: "error", event: "identity_request_failed" }),
        );
        return error(new AuthFault("SERVICE_UNAVAILABLE", 503));
      }
    },
  };
}
