import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  it,
  expect,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { generateSync } from "otplib";
import {
  createDatabase,
  bootstrapIdentity,
  createIdentityService,
  loadWorkConfig,
  createWorkService,
  publicWorkError,
} from "@helios/backend";
import { createTodoistReader } from "../../packages/backend/src/work/todoist";
import { fixture, token, projects } from "../fixtures/todoist";
import type { ContextInput } from "@helios/contracts";
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
  const boot = await bootstrapIdentity(db, config, "synthetic_user", password);
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
  vi.setSystemTime(new Date());
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
it("provisions exactly one private context under concurrency, arbitrary employers persist across service restart", async () => {
  await Promise.all([work.snapshot(headers()), work.snapshot(headers())]);
  for (const name of ["Atelier Nord", "Studio West", "Labor Süd"])
    await work.handle("context-save", headers(), employer(name));
  const restarted = createWorkService(
    db,
    config,
    createTodoistReader(f.fetcher),
  );
  const snap = await restarted.snapshot(headers());
  expect(snap.contexts).toHaveLength(4);
  expect(snap.contexts.filter((c) => c.kind === "private")).toHaveLength(1);
  expect(snap.contexts.map((c) => c.name)).toEqual(
    expect.arrayContaining(["Atelier Nord", "Studio West", "Labor Süd"]),
  );
  expect(f.calls).toHaveLength(0);
});
it("enforces real MFA, origin, revocation, foreign context IDs and fresh step-up", async () => {
  await expect(work.snapshot(headers(""))).rejects.toThrow();
  const login = await identity.handle("login", headers(""), {
    username: "synthetic_user",
    password,
  });
  await expect(work.snapshot(headers(absorb("", login)))).rejects.toThrow();
  const bad = headers();
  bad.set("origin", "https://evil.invalid");
  await expect(
    work.handle("context-save", bad, employer()),
  ).rejects.toMatchObject({ status: 403 });
  await expect(work.tasks(headers(), randomUUID())).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    work.handle("token-save", headers(), { revision: 0, token }),
  ).rejects.toMatchObject({ code: "STEP_UP_REQUIRED" });
  await identity.handle("logout", headers(), {});
  await expect(work.snapshot(headers())).rejects.toThrow();
});
it("encrypts credentials, redacts all responses and prevents stale token updates", async () => {
  const snap = await connect();
  const r = await db.pool.query("SELECT encrypted_token FROM integrations");
  expect(r.rows[0].encrypted_token).not.toContain(token);
  expect(JSON.stringify(snap)).not.toContain(token);
  expect(JSON.stringify(snap)).not.toContain("encryptedToken");
  await expect(
    work.handle("token-save", headers(), {
      revision: 0,
      token: "another-synthetic-token",
    }),
  ).rejects.toMatchObject({ status: 409 });
  const wrong = createWorkService(
    db,
    { ...config, INTEGRATION_KEY: "c".repeat(64) },
    createTodoistReader(f.fetcher),
  );
  try {
    await wrong.handle("catalog-refresh", headers(), {});
  } catch (e) {
    expect(JSON.stringify(publicWorkError(e))).not.toContain(token);
  }
});
it("maps exactly one project per active context and guards all remaps", async () => {
  const snap = await connect();
  const privateContext = snap.contexts[0]!;
  await db.pool.query("UPDATE auth_session_policy SET step_up_at=NULL");
  await expect(
    work.handle(
      "context-save",
      headers(),
      input(privateContext, { projectId: projects[0]!.id }),
    ),
  ).rejects.toMatchObject({ code: "STEP_UP_REQUIRED" });
  await step();
  await work.handle(
    "context-save",
    headers(),
    input(privateContext, { projectId: projects[0]!.id }),
  );
  await expect(
    work.handle(
      "context-save",
      headers(),
      employer("Doppelt", projects[0]!.id),
    ),
  ).rejects.toMatchObject({ code: "PROJECT_ALREADY_ASSIGNED" });
  await expect(
    work.handle(
      "context-save",
      headers(),
      employer("Eingang", projects[4]!.id),
    ),
  ).rejects.toMatchObject({ code: "PROJECT_NOT_ASSIGNABLE" });
  const races = await Promise.allSettled([
    work.handle("context-save", headers(), employer("A", projects[1]!.id)),
    work.handle("context-save", headers(), employer("B", projects[1]!.id)),
  ]);
  expect(races.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    (await db.pool.query("SELECT count(*) FROM context_project_history"))
      .rows[0].count,
  ).toBe("2");
});
it("detects concurrent revisions and preserves context history on deactivation without network writes", async () => {
  await work.snapshot(headers());
  const created = (await work.handle(
    "context-save",
    headers(),
    employer(),
  )) as { id: string };
  let c = (await work.snapshot(headers())).contexts.find(
    (c) => c.id === created.id,
  )!;
  const before = f.calls.length;
  const changed = await Promise.allSettled([
    work.handle(
      "context-save",
      headers(),
      input(c, { name: "Geändert", theme: "gold" }),
    ),
    work.handle(
      "context-save",
      headers(),
      input(c, { name: "Konflikt", theme: "green" }),
    ),
  ]);
  expect(changed.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  c = (await work.snapshot(headers())).contexts.find(
    (c) => c.id === created.id,
  )!;
  await work.handle("context-save", headers(), input(c, { active: false }));
  expect(
    (await work.snapshot(headers())).contexts.find((c) => c.id === created.id)
      ?.active,
  ).toBe(false);
  expect(
    (
      await db.pool.query("SELECT count(*) FROM contexts WHERE id=$1", [
        created.id,
      ])
    ).rows[0].count,
  ).toBe("1");
  await expect(
    work.handle("tasks-refresh", headers(), { contextId: created.id }),
  ).rejects.toMatchObject({ code: "NOT_CONNECTED" });
  expect(f.calls.length).toBe(before);
});
it("keeps planned date, deadline, parents, comments and unknown external moves read-only", async () => {
  let snap = await connect();
  const c = snap.contexts[0]!;
  await work.handle(
    "context-save",
    headers(),
    input(c, { projectId: projects[0]!.id }),
  );
  await work.handle("tasks-refresh", headers(), { contextId: c.id });
  let list = await work.tasks(headers(), c.id);
  expect(list.tasks).toHaveLength(2);
  expect(list.tasks.find((t) => t.data.parent_id)?.data.deadline).toBeNull();
  expect(
    list.tasks.find((t) => t.data.id === f.state.tasks[0]!.id)!.data.due?.date,
  ).toBe("2026-10-20");
  expect(
    list.tasks.find((t) => t.data.id === f.state.tasks[0]!.id)!.data.deadline
      ?.date,
  ).toBe("2026-10-23");
  advance();
  const comments = (await work.handle("comments-read", headers(), {
    contextId: c.id,
    taskId: f.state.tasks[0]!.id,
  })) as { comments: unknown[] };
  expect(comments.comments).toHaveLength(1);
  advance();
  f.state.tasks[1]!.project_id = "foreign-project";
  await work.handle("tasks-refresh", headers(), { contextId: c.id });
  list = await work.tasks(headers(), c.id);
  expect(
    list.tasks.find((t) => t.data.id === f.state.tasks[1]!.id)!.state,
  ).toBe("unknown");
  expect(list.tasks.some((t) => t.state === "completed")).toBe(false);
  expect(f.calls.every((c) => c.method === "GET")).toBe(true);
  expect(
    f.calls
      .filter((c) => new URL(c.url).pathname === "/api/v1/tasks")
      .every(
        (c) =>
          new URL(c.url).searchParams.get("project_id") === projects[0]!.id,
      ),
  ).toBe(true);
  expect(
    (await db.pool.query("SELECT count(*) FROM technical_probes")).rows[0]
      .count,
  ).toBeDefined();
  snap = await work.snapshot(headers());
  expect(snap.contexts[0]!.configured).toBe(true);
});
it("will not expose comments after an external move outside the authorized context", async () => {
  const snap = await connect();
  const c = snap.contexts[0]!;
  await work.handle(
    "context-save",
    headers(),
    input(c, { projectId: projects[0]!.id }),
  );
  await work.handle("tasks-refresh", headers(), { contextId: c.id });
  advance();
  f.state.tasks[0]!.project_id = "foreign-project";
  await expect(
    work.handle("comments-read", headers(), {
      contextId: c.id,
      taskId: f.state.tasks[0]!.id,
    }),
  ).rejects.toMatchObject({ code: "TASK_NO_LONGER_IN_CONTEXT" });
  expect(
    f.calls.some((c) => new URL(c.url).pathname === "/api/v1/comments"),
  ).toBe(false);
  expect(
    (await work.tasks(headers(), c.id)).tasks.find(
      (t) => t.data.id === f.state.tasks[0]!.id,
    )!.state,
  ).toBe("unknown");
});
it.each([
  "auth_error",
  "expired",
  "network",
  "timeout",
  "rate_limit",
  "unexpected",
] as const)(
  "records safe recurring %s problems; checked never means resolved",
  async (mode) => {
    await connect();
    f.state.mode = mode;
    await expect(
      work.handle("catalog-refresh", headers(), {}),
    ).rejects.toThrow();
    let snap = await work.snapshot(headers());
    const p = snap.problems.find(
      (p) => p.code === (mode === "expired" ? "auth_error" : mode),
    )!;
    expect(p).toBeDefined();
    expect(JSON.stringify(snap)).not.toContain(token);
    await work.handle("problem-check", headers(), {
      id: p.id,
      revision: p.revision,
    });
    snap = await work.snapshot(headers());
    expect(snap.problems.find((v) => v.id === p.id)!.status).toBe("checked");
    const restarted = createWorkService(
      db,
      config,
      createTodoistReader(f.fetcher),
    );
    await expect(
      restarted.handle("catalog-refresh", headers(), {}),
    ).rejects.toMatchObject({ code: "RETRY_LATER" });
    advance(100000);
    f.state.mode = "ok";
    await work.handle("catalog-refresh", headers(), {});
    snap = await work.snapshot(headers());
    expect(snap.problems.find((v) => v.id === p.id)!.status).toBe("resolved");
    advance();
    f.state.mode = mode;
    await expect(
      work.handle("catalog-refresh", headers(), {}),
    ).rejects.toThrow();
    snap = await work.snapshot(headers());
    expect(snap.problems.find((v) => v.id === p.id)!.status).toBe("open");
    expect(snap.problems.find((v) => v.id === p.id)!.occurrences).toBe(2);
  },
);
it("recognizes missing projects and stale cache without claiming completion", async () => {
  const snap = await connect();
  const c = snap.contexts[0]!;
  await work.handle(
    "context-save",
    headers(),
    input(c, { projectId: projects[0]!.id }),
  );
  await work.handle("tasks-refresh", headers(), { contextId: c.id });
  advance(301000);
  expect((await work.tasks(headers(), c.id)).stale).toBe(true);
  let current = await work.snapshot(headers());
  expect(
    current.problems.some(
      (p) => p.code === "stale_cache" && p.status === "open",
    ),
  ).toBe(true);
  f.state.projects = f.state.projects.filter((p) => p.id !== projects[0]!.id);
  await work.handle("catalog-refresh", headers(), {});
  current = await work.snapshot(headers());
  expect(current.contexts[0]!.configured).toBe(false);
  expect(current.problems.some((p) => p.code === "project_missing")).toBe(true);
  expect(
    (await db.pool.query("SELECT count(*) FROM task_projections")).rows[0]
      .count,
  ).toBe("2");
});
it.each(["token", "deactivation", "logout"])(
  "rejects in-flight results after %s",
  async (mode) => {
    await connect();
    const created = (await work.handle(
      "context-save",
      headers(),
      employer("Race context", projects[0]!.id),
    )) as { id: string };
    const c = (await work.snapshot(headers())).contexts.find(
      (c) => c.id === created.id,
    )!;
    let entered!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((r) => (entered = r));
    const gate = new Promise<void>((r) => (release = r));
    const base = createTodoistReader(f.fetcher);
    const blocked = createWorkService(db, config, {
      ...base,
      tasks: async (t, p) => {
        entered();
        await gate;
        return base.tasks(t, p);
      },
    });
    const pending = blocked.handle("tasks-refresh", headers(), {
      contextId: c.id,
    });
    await ready;
    const latest = await work.snapshot(headers());
    if (mode === "token")
      await work.handle("token-remove", headers(), {
        revision: latest.integration.revision,
      });
    else if (mode === "deactivation")
      await work.handle("context-save", headers(), input(c, { active: false }));
    else await identity.handle("logout", headers(), {});
    release();
    await expect(pending).rejects.toMatchObject({
      status: mode === "logout" ? 401 : 409,
    });
    expect(
      (await db.pool.query("SELECT count(*) FROM task_projections")).rows[0]
        .count,
    ).toBe("0");
    if (mode === "token")
      expect((await work.snapshot(headers())).integration.hasToken).toBe(false);
    expect(f.calls.every((c) => c.method === "GET")).toBe(true);
  },
);

it("preserves a full catalog and task snapshot when a later page fails", async () => {
  const snap = await connect();
  const c = snap.contexts[0]!;
  await work.handle(
    "context-save",
    headers(),
    input(c, { projectId: projects[0]!.id }),
  );
  await work.handle("tasks-refresh", headers(), { contextId: c.id });
  const before = await work.tasks(headers(), c.id);
  advance();
  const brokenFetch: typeof fetch = async (url, init) =>
    new URL(String(url)).searchParams.has("cursor")
      ? Response.json({ error: token }, { status: 503 })
      : f.fetcher(url, init);
  const broken = createWorkService(
    db,
    config,
    createTodoistReader(brokenFetch),
  );
  f.state.projects[0]!.name = "Incomplete new name";
  await expect(
    broken.handle("catalog-refresh", headers(), {}),
  ).rejects.toThrow();
  expect(
    (await work.snapshot(headers())).projects.find(
      (p) => p.id === projects[0]!.id,
    )!.name,
  ).toBe("Privater Raum");
  advance(31000);
  f.state.tasks[0]!.content = "Incomplete new title";
  await expect(
    broken.handle("tasks-refresh", headers(), { contextId: c.id }),
  ).rejects.toThrow();
  const after = await work.tasks(headers(), c.id);
  expect(after.tasks).toEqual(before.tasks);
  expect(after.lastSyncAt).toBe(before.lastSyncAt);
});
it("rotates credential generations without exposing previous-account task caches", async () => {
  const snap = await connect();
  const c = snap.contexts[0]!;
  await work.handle(
    "context-save",
    headers(),
    input(c, { projectId: projects[0]!.id }),
  );
  await work.handle("tasks-refresh", headers(), { contextId: c.id });
  const old = (
    await db.pool.query(
      "SELECT encrypted_token,credential_version FROM integrations",
    )
  ).rows[0];
  const latest = await work.snapshot(headers());
  await work.handle("token-save", headers(), {
    revision: latest.integration.revision,
    token,
  });
  const current = (
    await db.pool.query(
      "SELECT encrypted_token,credential_version FROM integrations",
    )
  ).rows[0];
  expect(current.encrypted_token).not.toBe(old.encrypted_token);
  expect(current.credential_version).not.toBe(old.credential_version);
  expect((await work.snapshot(headers())).projects).toEqual([]);
  expect((await work.tasks(headers(), c.id)).tasks).toEqual([]);
  expect(
    (await db.pool.query("SELECT count(*) FROM task_projections")).rows[0]
      .count,
  ).toBe("2");
  await work.handle("catalog-refresh", headers(), {});
  expect((await work.tasks(headers(), c.id)).tasks).toEqual([]);
});
it("treats a task 404 as unknown without invalidating its whole project", async () => {
  const snap = await connect();
  const c = snap.contexts[0]!;
  await work.handle(
    "context-save",
    headers(),
    input(c, { projectId: projects[0]!.id }),
  );
  await work.handle("tasks-refresh", headers(), { contextId: c.id });
  advance();
  const id = f.state.tasks[0]!.id;
  f.state.tasks = f.state.tasks.filter((t) => t.id !== id);
  await expect(
    work.handle("comments-read", headers(), { contextId: c.id, taskId: id }),
  ).rejects.toMatchObject({ code: "task_unavailable" });
  expect((await work.snapshot(headers())).contexts[0]!.configured).toBe(true);
  expect(
    (await work.tasks(headers(), c.id)).tasks.find((t) => t.data.id === id)!
      .state,
  ).toBe("unknown");
});
it("rejects an older read result after a newer claim has completed", async () => {
  const snap = await connect();
  const c = snap.contexts[0]!;
  await work.handle(
    "context-save",
    headers(),
    input(c, { projectId: projects[0]!.id }),
  );
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((r) => (entered = r)),
    gate = new Promise<void>((r) => (release = r));
  const base = createTodoistReader(f.fetcher);
  const older = createWorkService(db, config, {
    ...base,
    tasks: async (t, p) => {
      const result = await base.tasks(t, p);
      entered();
      await gate;
      return result;
    },
  });
  const pending = older.handle("tasks-refresh", headers(), { contextId: c.id });
  await ready;
  advance(61000);
  f.state.tasks[0]!.content = "Newer verified title";
  await work.handle("tasks-refresh", headers(), { contextId: c.id });
  release();
  await expect(pending).rejects.toMatchObject({ status: 409 });
  expect(
    (await work.tasks(headers(), c.id)).tasks.find(
      (t) => t.data.id === f.state.tasks[0]!.id,
    )!.data.content,
  ).toBe("Newer verified title");
});
