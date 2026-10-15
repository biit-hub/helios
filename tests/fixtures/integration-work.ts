import { beforeAll, beforeEach, afterAll, afterEach, expect, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { generateSync } from "otplib";
import {
  createDatabase,
  bootstrapIdentity,
  createIdentityService,
  loadWorkConfig,
  createWorkService,
} from "@helios/backend";
import { createTodoistReader } from "../../packages/backend/src/work/todoist";
import { token } from "./todoist";
import type { ContextInput } from "@helios/contracts";
export function createWorkHarness<F extends { fetcher: typeof fetch }>(
  fixture: () => F,
  clockStart?: string,
) {
  const config = loadWorkConfig({
    ...process.env,
    HELIOS_ENV: "test",
    AUTH_SECRET: "e".repeat(64),
    AUTH_ORIGIN: "http://127.0.0.1:3100",
    INTEGRATION_KEY: "b".repeat(64),
  });
  const db = createDatabase(config.DATABASE_URL);
  const identity = createIdentityService(db, config);
  let f = fixture();
  let work = createWorkService(db, config, createTodoistReader(f.fetcher));
  let cookie = "",
    secret = "";
  const password = "Synthetic passphrase 72!";
  function headers(c = cookie) {
    return new Headers({
      host: "127.0.0.1:3100",
      origin: config.AUTH_ORIGIN,
      "content-type": "application/json",
      cookie: c,
    });
  }
  function absorb(c: string, r: { cookies?: string[] }) {
    const map = new Map(
      c
        .split(";")
        .filter(Boolean)
        .map((v) => {
          const i = v.indexOf("=");
          return [v.slice(0, i).trim(), v.slice(i + 1)];
        }),
    );
    for (const raw of r.cookies ?? []) {
      const v = raw.split(";")[0]!;
      const i = v.indexOf("=");
      if (/Max-Age=0/i.test(raw)) map.delete(v.slice(0, i));
      else map.set(v.slice(0, i), v.slice(i + 1));
    }
    return [...map].map(([k, v]) => k + "=" + v).join("; ");
  }
  const advance = (ms = 16000) => vi.setSystemTime(new Date(Date.now() + ms));
  async function enroll() {
    const boot = await bootstrapIdentity(
      db,
      config,
      "synthetic_user",
      password,
    );
    const setup = await identity.handle("setup", headers(""), {
      token: boot.proof,
      password,
    });
    expect(setup.status ?? 200).toBe(200);
    cookie = absorb("", setup);
    secret = new URL(setup.body.totpURI as string).searchParams.get("secret")!;
    const verified = await identity.handle("verify-enrollment", headers(), {
      code: generateSync({ secret }),
    });
    expect(verified.status ?? 200).toBe(200);
    cookie = absorb(cookie, verified);
    const activated = await identity.handle("activate", headers(), {
      saved: true,
    });
    expect(activated.status ?? 200).toBe(200);
    cookie = absorb(cookie, activated);
  }
  async function step() {
    advance(30000);
    const result = await identity.handle("step-up", headers(), {
      password,
      code: generateSync({ secret }),
    });
    expect(result.status ?? 200).toBe(200);
  }
  async function connect() {
    await step();
    const snap = await work.snapshot(headers());
    await work.handle("token-save", headers(), {
      revision: snap.integration.revision,
      token,
    });
    await work.handle("catalog-refresh", headers(), {});
    advance();
    return work.snapshot(headers());
  }
  const input = (
    c: {
      id: string;
      revision: number;
      name: string;
      theme: ContextInput["theme"];
      active: boolean;
      projectId: string | null;
      termihubEmployerId: string | null;
      termihubInstanceRef: string | null;
    },
    patch: Partial<ContextInput> = {},
  ): ContextInput => ({
    id: c.id,
    revision: c.revision,
    name: c.name,
    theme: c.theme,
    active: c.active,
    projectId: c.projectId,
    termihubEmployerId: c.termihubEmployerId,
    termihubInstanceRef: c.termihubInstanceRef,
    ...patch,
  });
  const employer = (
    name = "Freier Arbeitgeber",
    projectId: string | null = null,
  ): ContextInput => ({
    revision: 0,
    name,
    theme: "blue",
    active: true,
    projectId,
    termihubEmployerId: "opaque:employer",
    termihubInstanceRef: "local-reference",
  });
  beforeAll(() =>
    migrate(db.db, {
      migrationsFolder: fileURLToPath(
        new URL("../../packages/backend/migrations", import.meta.url),
      ),
    }),
  );
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(clockStart ? new Date(clockStart) : new Date());
    await db.pool.query(
      "TRUNCATE auth_user,auth_flows,auth_limits,auth_rate_limit,auth_verification,auth_totp_uses,security_events CASCADE",
    );
    f = fixture();
    work = createWorkService(db, config, createTodoistReader(f.fetcher));
    cookie = "";
    await enroll();
  });
  afterEach(() => vi.useRealTimers());
  afterAll(() => db.close());

  return {
    config,
    db,
    identity,
    headers,
    advance,
    connect,
    input,
    employer,
    step,
    password,
    absorb,
    get f() {
      return f;
    },
    get work() {
      return work;
    },
    get cookie() {
      return cookie;
    },
    set cookie(value: string) {
      cookie = value;
    },
    get secret() {
      return secret;
    },
  };
}
