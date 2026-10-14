import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { generateSync } from "otplib";
import {
  createDatabase,
  bootstrapIdentity,
  adminRecovery,
  createIdentityService,
  loadIdentityConfig,
} from "@helios/backend";
import { makeAuth } from "../../packages/backend/src/identity/engine";
const config = loadIdentityConfig({
  ...process.env,
  HELIOS_ENV: "test",
  AUTH_SECRET: "e".repeat(64),
  AUTH_ORIGIN: "http://127.0.0.1:3100",
});
const db = createDatabase(config.DATABASE_URL);
const service = createIdentityService(db, config);
const username = "synthetic_user";
const password = "Synthetic passphrase 72!";
function headers(cookie = "") {
  return new Headers({
    host: "127.0.0.1:3100",
    origin: config.AUTH_ORIGIN,
    "content-type": "application/json",
    cookie,
    "user-agent": "Chrome Windows",
  });
}
function jar(cookie: string, result: { cookies?: string[] }) {
  const map = new Map(
    cookie
      .split(";")
      .filter(Boolean)
      .map((c) => {
        const i = c.indexOf("=");
        return [c.slice(0, i).trim(), c.slice(i + 1)] as const;
      }),
  );
  for (const c of result.cookies ?? []) {
    const value = c.split(";")[0]!;
    const i = value.indexOf("=");
    if (/Max-Age=0/i.test(c)) map.delete(value.slice(0, i));
    else map.set(value.slice(0, i), value.slice(i + 1));
  }
  return [...map].map(([k, v]) => k + "=" + v).join("; ");
}
type R = Awaited<ReturnType<typeof service.handle>>;
const ok = (r: R) => {
  expect(r.status ?? 200, JSON.stringify(r.body)).toBe(200);
};
function totp(secret: string, offset = 0) {
  return generateSync({
    secret,
    epoch: Math.floor(Date.now() / 1000) + offset,
  });
}
async function enroll() {
  const boot = await bootstrapIdentity(db, config, username, password);
  const setup = await service.handle("setup", headers(), {
    token: boot.proof,
    password,
  });
  ok(setup);
  let cookie = jar("", setup);
  const secret = new URL(setup.body.totpURI as string).searchParams.get(
    "secret",
  )!;
  const verified = await service.handle("verify-enrollment", headers(cookie), {
    code: totp(secret),
  });
  ok(verified);
  cookie = jar(cookie, verified);
  const codes = verified.body.backupCodes as string[];
  const activation = await service.handle("activate", headers(cookie), {
    saved: true,
  });
  ok(activation);
  cookie = jar(cookie, activation);
  return { cookie, secret, codes };
}
async function login(secret: string, trusted = false) {
  vi.setSystemTime(new Date(Date.now() + 30000));
  const first = await service.handle("login", headers(), {
    username,
    password,
    trusted,
    returnTo: "/mobile",
  });
  ok(first);
  const challenge = jar("", first);
  const second = await service.handle("mfa", headers(challenge), {
    code: totp(secret),
  });
  ok(second);
  return { cookie: jar(challenge, second), challenge, result: second };
}
beforeAll(async () => {
  await migrate(db.db, {
    migrationsFolder: fileURLToPath(
      new URL("../../packages/backend/migrations", import.meta.url),
    ),
  });
});
beforeEach(async () => {
  vi.useRealTimers();
  const now = new Date();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  await db.pool.query(
    "TRUNCATE auth_user,auth_flows,auth_limits,auth_verification,auth_totp_uses,security_events CASCADE",
  );
});
afterEach(() => vi.useRealTimers());
afterAll(() => db.close());
describe("real PostgreSQL identity lifecycle", () => {
  it("bootstraps once, requires TOTP and explicit recovery acknowledgement", async () => {
    const boot = await bootstrapIdentity(db, config, username, password);
    const stored = await db.pool.query("SELECT password FROM auth_account");
    expect(stored.rows[0].password).toMatch(
      /^\$argon2id\$v=19\$m=65536,p=1,t=3/,
    );
    const setup = await service.handle("setup", headers(), {
      token: boot.proof,
      password,
    });
    ok(setup);
    let cookie = jar("", setup);
    await expect(service.requireActive(headers(cookie))).rejects.toThrow();
    expect(
      (await service.handle("activate", headers(cookie), { saved: true }))
        .status,
    ).toBe(401);
    const secret = new URL(setup.body.totpURI as string).searchParams.get(
      "secret",
    )!;
    const verified = await service.handle(
      "verify-enrollment",
      headers(cookie),
      { code: totp(secret) },
    );
    ok(verified);
    cookie = jar(cookie, verified);
    await expect(service.requireActive(headers(cookie))).rejects.toThrow();
    expect(
      (
        await service.handle("verify-enrollment", headers(cookie), {
          code: totp(secret),
        })
      ).status,
    ).toBe(401);
    expect(
      (await service.handle("activate", headers(cookie), { saved: false }))
        .status,
    ).toBe(400);
    ok(await service.handle("activate", headers(cookie), { saved: true }));
    await expect(service.requireActive(headers(cookie))).resolves.toBeDefined();
    await expect(
      bootstrapIdentity(db, config, "other_user", password),
    ).rejects.toThrow();
    expect(
      (await db.pool.query("SELECT count(*) FROM auth_user")).rows[0].count,
    ).toBe("1");
    expect(JSON.stringify(verified.body)).not.toContain("token");
  });
  it("serializes parallel bootstrap and leaves no partial second account", async () => {
    const outcomes = await Promise.allSettled([
      bootstrapIdentity(db, config, username, password),
      bootstrapIdentity(db, config, "other_user", password),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await db.pool.query("SELECT count(*) FROM auth_user")).rows[0].count,
    ).toBe("1");
  });
  it("rejects expired setup proof and expired enrollment without activating", async () => {
    const boot = await bootstrapIdentity(db, config, username, password);
    await db.pool.query(
      "UPDATE auth_flows SET expires_at=now()-interval '1 second'",
    );
    expect(
      (
        await service.handle("setup", headers(), {
          token: boot.proof,
          password,
        })
      ).status,
    ).toBe(401);
    expect(
      (await db.pool.query("SELECT status FROM auth_identity_state")).rows[0]
        .status,
    ).toBe("pending");
  });
  it("requires fresh password plus TOTP and rejects direct library registration", async () => {
    const enrolled = await enroll();
    expect(
      (
        await service.handle("login", headers(), {
          username,
          password: "Wrong synthetic password",
        })
      ).status,
    ).toBe(401);
    const unknown = await service.handle("login", headers(), {
      username: "missing_user",
      password: "Wrong synthetic password",
    });
    const wrong = await service.handle("login", headers(), {
      username,
      password: "Wrong synthetic password",
    });
    expect(unknown.body).toEqual(wrong.body);
    const auth = makeAuth(db.db, config);
    const signup = await auth.api.signUpEmail({
      body: { name: "Other", email: "other@helios.invalid", password },
      asResponse: true,
    });
    expect(signup.ok).toBe(false);
    const first = await service.handle("login", headers(), {
      username,
      password,
      trusted: false,
    });
    ok(first);
    const cookie = jar("", first);
    await expect(service.requireActive(headers(cookie))).rejects.toThrow();
    expect(
      (await service.handle("mfa", headers(cookie), { code: "000000" })).status,
    ).toBe(401);
    vi.setSystemTime(new Date(Date.now() + 30000));
    const mfa = await service.handle("mfa", headers(cookie), {
      code: totp(enrolled.secret),
    });
    ok(mfa);
    const full = jar(cookie, mfa);
    await expect(service.requireActive(headers(full))).resolves.toBeDefined();
    expect(mfa.body.next).toBe("/");
    expect(
      mfa.cookies?.some((c) => /HttpOnly/.test(c) && /SameSite=Strict/.test(c)),
    ).toBe(true);
  });
  it("expires MFA challenges and blocks brute force persistently", async () => {
    await enroll();
    const first = await service.handle("login", headers(), {
      username,
      password,
    });
    ok(first);
    await db.pool.query(
      "UPDATE auth_flows SET expires_at=now()-interval '1 second'",
    );
    expect(
      (await service.handle("mfa", headers(jar("", first)), { code: "000000" }))
        .status,
    ).toBe(401);
    for (let i = 0; i < 4; i++)
      await service.handle("login", headers(), { username, password: "bad" });
    const restarted = createIdentityService(db, config);
    expect(
      (
        await restarted.handle("login", headers(), {
          username,
          password: "bad",
        })
      ).status,
    ).toBe(429);
  });
  it("enforces normal absolute and idle limits and trust without extending expiry", async () => {
    const enrolled = await enroll();
    const valid = await service.requireActive(headers(enrolled.cookie));
    await db.pool.query(
      "UPDATE auth_session_policy SET absolute_expires_at=now()-interval '1 second' WHERE session_id=$1",
      [valid.current.session.id],
    );
    await expect(
      service.requireActive(headers(enrolled.cookie)),
    ).rejects.toThrow();
    const second = await login(enrolled.secret, false);
    const normal = await service.requireActive(headers(second.cookie));
    expect(
      normal.policy.absoluteExpiresAt.getTime() -
        normal.current.session.createdAt.getTime(),
    ).toBeLessThanOrEqual(12 * 3600000 + 2000);
    await db.pool.query(
      "UPDATE auth_session_policy SET last_seen_at=now()-interval '31 minutes' WHERE session_id=$1",
      [normal.current.session.id],
    );
    await expect(
      service.requireActive(headers(second.cookie)),
    ).rejects.toThrow();
    vi.setSystemTime(new Date(Date.now() + 30000));
    const trusted = await login(enrolled.secret, true);
    const t = await service.requireActive(headers(trusted.cookie));
    const before = t.policy.absoluteExpiresAt.getTime();
    await db.pool.query(
      "UPDATE auth_session_policy SET last_seen_at=now()-interval '1 day' WHERE session_id=$1",
      [t.current.session.id],
    );
    const after = await service.requireActive(headers(trusted.cookie));
    expect(after.policy.absoluteExpiresAt.getTime()).toBe(before);
    expect(before - t.current.session.createdAt.getTime()).toBeLessThanOrEqual(
      30 * 86400000 + 2000,
    );
    await db.pool.query(
      "UPDATE auth_session_policy SET absolute_expires_at=now()-interval '1 second' WHERE session_id=$1",
      [t.current.session.id],
    );
    await expect(
      service.requireActive(headers(trusted.cookie)),
    ).rejects.toThrow();
  });
  it("revokes sessions immediately, protects step-up and rejects replay", async () => {
    const enrolled = await enroll();
    const another = await login(enrolled.secret, false);
    expect(
      (await service.handle("revoke-others", headers(enrolled.cookie), {}))
        .status,
    ).toBe(403);
    vi.setSystemTime(new Date(Date.now() + 30000));
    const step = await service.handle("step-up", headers(enrolled.cookie), {
      password,
      code: totp(enrolled.secret),
    });
    ok(step);
    expect(
      (
        await service.handle("step-up", headers(enrolled.cookie), {
          password,
          code: totp(enrolled.secret),
        })
      ).body.error,
    ).toBeDefined();
    const target = await service.requireActive(headers(another.cookie));
    ok(
      await service.handle("revoke", headers(enrolled.cookie), {
        id: target.current.session.id,
      }),
    );
    await expect(
      service.requireActive(headers(another.cookie)),
    ).rejects.toThrow();
    await db.pool.query(
      "UPDATE auth_session_policy SET step_up_at=now()-interval '6 minutes'",
    );
    expect(
      (
        await service.handle("rotate-recovery", headers(enrolled.cookie), {
          password,
        })
      ).status,
    ).toBe(403);
    ok(await service.handle("logout", headers(enrolled.cookie), {}));
    await expect(
      service.requireActive(headers(enrolled.cookie)),
    ).rejects.toThrow();
  });
  it("allows one concurrent recovery consumer and requires controlled reenrollment", async () => {
    const enrolled = await enroll();
    const a = await service.handle("login", headers(), { username, password });
    const b = await service.handle("login", headers(), { username, password });
    ok(a);
    ok(b);
    const outcomes = await Promise.all([
      service.handle("recover", headers(jar("", a)), {
        code: enrolled.codes[0],
      }),
      service.handle("recover", headers(jar("", b)), {
        code: enrolled.codes[0],
      }),
    ]);
    expect(outcomes.filter((r) => !r.status)).toHaveLength(1);
    const success = outcomes.find((r) => !r.status)!;
    const recovery = jar("", success);
    await expect(
      service.requireActive(headers(enrolled.cookie)),
    ).rejects.toThrow();
    await expect(service.requireActive(headers(recovery))).rejects.toThrow();
    expect(
      (await db.pool.query("SELECT status FROM auth_identity_state")).rows[0]
        .status,
    ).toBe("recovery");
    const setup = await service.handle("setup", headers(recovery), {
      password,
    });
    ok(setup);
    const secret = new URL(setup.body.totpURI as string).searchParams.get(
      "secret",
    )!;
    let cookie = jar(recovery, setup);
    const verified = await service.handle(
      "verify-enrollment",
      headers(cookie),
      { code: totp(secret) },
    );
    ok(verified);
    cookie = jar(cookie, verified);
    ok(await service.handle("activate", headers(cookie), { saved: true }));
    await expect(service.requireActive(headers(cookie))).resolves.toBeDefined();
  });
  it("denies CSRF, spoofed hosts and unsafe return paths", async () => {
    const enrolled = await enroll();
    const evil = headers(enrolled.cookie);
    evil.set("origin", "https://attacker.invalid");
    expect((await service.handle("logout", evil, {})).status).toBe(403);
    evil.set("origin", config.AUTH_ORIGIN);
    evil.set("host", "attacker.invalid");
    expect((await service.handle("logout", evil, {})).status).toBe(403);
    const forwarded = headers(enrolled.cookie);
    forwarded.set("x-forwarded-host", "attacker.invalid");
    forwarded.set("x-forwarded-for", "1.2.3.4");
    await expect(service.requireActive(forwarded)).resolves.toBeDefined();
    const first = await service.handle("login", headers(), {
      username,
      password,
      returnTo: "//attacker.invalid",
    });
    ok(first);
    vi.setSystemTime(new Date(Date.now() + 30000));
    const completed = await service.handle("mfa", headers(jar("", first)), {
      code: totp(enrolled.secret),
    });
    ok(completed);
    expect(completed.body.next).toBe("/");
    expect((await service.handle("sign-up/email", headers(), {})).status).toBe(
      404,
    );
  });
  it("supports audited local recovery without a second account", async () => {
    const enrolled = await enroll();
    const recovered = await adminRecovery(
      db,
      config,
      "Another synthetic passphrase 73!",
    );
    await expect(
      service.requireActive(headers(enrolled.cookie)),
    ).rejects.toThrow();
    expect(recovered.proof).toHaveLength(64);
    expect(
      (await db.pool.query("SELECT count(*) FROM auth_user")).rows[0].count,
    ).toBe("1");
    expect(
      (
        await db.pool.query(
          "SELECT code FROM security_events WHERE code='local_admin_recovery'",
        )
      ).rowCount,
    ).toBe(1);
  });
});

it("replaces recovery codes only after step-up and keeps them encrypted", async () => {
  const enrolled = await enroll();
  expect(
    (
      await service.handle("rotate-recovery", headers(enrolled.cookie), {
        password,
      })
    ).status,
  ).toBe(403);
  vi.setSystemTime(new Date(Date.now() + 30000));
  ok(
    await service.handle("step-up", headers(enrolled.cookie), {
      password,
      code: totp(enrolled.secret),
    }),
  );
  const rotated = await service.handle(
    "rotate-recovery",
    headers(enrolled.cookie),
    { password },
  );
  ok(rotated);
  const codes = rotated.body.backupCodes as string[];
  expect(codes).toHaveLength(10);
  expect(codes).not.toEqual(enrolled.codes);
  const stored = await db.pool.query(
    "SELECT backup_codes FROM auth_two_factor",
  );
  expect(stored.rows[0].backup_codes).not.toContain(codes[0]);
  const login = await service.handle("login", headers(), {
    username,
    password,
  });
  ok(login);
  const challenge = jar("", login);
  expect(
    (
      await service.handle("recover", headers(challenge), {
        code: enrolled.codes[0],
      })
    ).status,
  ).toBe(401);
  ok(await service.handle("recover", headers(challenge), { code: codes[0] }));
});
it("changes the password and requires a complete new login", async () => {
  const enrolled = await enroll();
  vi.setSystemTime(new Date(Date.now() + 30000));
  ok(
    await service.handle("step-up", headers(enrolled.cookie), {
      password,
      code: totp(enrolled.secret),
    }),
  );
  const next = "Another synthetic passphrase 73!";
  ok(
    await service.handle("password", headers(enrolled.cookie), {
      password,
      newPassword: next,
    }),
  );
  await expect(
    service.requireActive(headers(enrolled.cookie)),
  ).rejects.toThrow();
  expect(
    (await service.handle("login", headers(), { username, password })).status,
  ).toBe(401);
  const first = await service.handle("login", headers(), {
    username,
    password: next,
  });
  ok(first);
  const challenge = jar("", first);
  await expect(service.requireActive(headers(challenge))).rejects.toThrow();
  vi.setSystemTime(new Date(Date.now() + 30000));
  ok(
    await service.handle("mfa", headers(challenge), {
      code: totp(enrolled.secret),
    }),
  );
});
it("rotates TOTP through a restricted state and revokes all previous sessions", async () => {
  const enrolled = await enroll();
  const second = await login(enrolled.secret, true);
  vi.setSystemTime(new Date(Date.now() + 30000));
  ok(
    await service.handle("step-up", headers(enrolled.cookie), {
      password,
      code: totp(enrolled.secret),
    }),
  );
  const rotated = await service.handle(
    "rotate-totp",
    headers(enrolled.cookie),
    { password },
  );
  ok(rotated);
  expect(rotated.body.next).toBe("/setup");
  await expect(
    service.requireActive(headers(enrolled.cookie)),
  ).rejects.toThrow();
  await expect(service.requireActive(headers(second.cookie))).rejects.toThrow();
  let cookie = jar("", rotated);
  await expect(service.requireActive(headers(cookie))).rejects.toThrow();
  const setup = await service.handle("setup", headers(cookie), { password });
  ok(setup);
  cookie = jar(cookie, setup);
  const secret = new URL(setup.body.totpURI as string).searchParams.get(
    "secret",
  )!;
  const verified = await service.handle("verify-enrollment", headers(cookie), {
    code: totp(secret),
  });
  ok(verified);
  cookie = jar(cookie, verified);
  ok(await service.handle("activate", headers(cookie), { saved: true }));
  await expect(service.requireActive(headers(cookie))).resolves.toBeDefined();
});
it("consumes a login challenge once under simultaneous MFA requests", async () => {
  const enrolled = await enroll();
  const first = await service.handle("login", headers(), {
    username,
    password,
  });
  ok(first);
  const challenge = jar("", first);
  vi.setSystemTime(new Date(Date.now() + 30000));
  const code = totp(enrolled.secret);
  const outcomes = await Promise.all([
    service.handle("mfa", headers(challenge), { code }),
    service.handle("mfa", headers(challenge), { code }),
  ]);
  expect(outcomes.filter((r) => !r.status)).toHaveLength(1);
  expect(
    (
      await db.pool.query(
        "SELECT count(*) FROM auth_session_policy WHERE purpose='full'",
      )
    ).rows[0].count,
  ).toBe("2");
});
it("uses secure, host-only cookies and no MFA/session caching under HTTPS", async () => {
  const tls = loadIdentityConfig({
    ...process.env,
    HELIOS_ENV: "test",
    AUTH_SECRET: "e".repeat(64),
    AUTH_ORIGIN: "https://helios.example.invalid",
  });
  const secure = createIdentityService(db, tls);
  const h = new Headers({
    host: "helios.example.invalid",
    origin: tls.AUTH_ORIGIN,
    "content-type": "application/json",
  });
  const boot = await bootstrapIdentity(db, tls, username, password);
  const setup = await secure.handle("setup", h, {
    token: boot.proof,
    password,
  });
  ok(setup);
  expect(
    setup.cookies?.every(
      (c) =>
        c.includes("Secure") &&
        c.includes("HttpOnly") &&
        c.includes("SameSite=Strict") &&
        !c.includes("Domain="),
    ),
  ).toBe(true);
  expect(
    setup.cookies?.some(
      (c) => c.includes("session_data") || c.includes("trust_device"),
    ),
  ).toBe(false);
  const noOrigin = new Headers(h);
  noOrigin.delete("origin");
  expect(
    (await secure.handle("setup", noOrigin, { token: boot.proof, password }))
      .status,
  ).toBe(403);
});
