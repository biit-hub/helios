import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
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
  createIdentityService,
  loadWorkConfig,
  createWorkService,
} from "@helios/backend";
import { createTodoistReader } from "../../packages/backend/src/work/todoist";
import { token, projects } from "../fixtures/todoist";
import { planningFixture as fixture } from "../fixtures/planning";
import { createPlanningService, createPlanExecutor } from "@helios/backend";
import { createTodoistMover } from "../../packages/backend/src/planning/todoist";
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

const plans = () => createPlanningService(db, config);
const executor = () =>
  createPlanExecutor(
    db,
    config,
    createTodoistReader(f.fetcher),
    createTodoistMover(f.fetcher),
  );
async function prepare(count = 3) {
  await connect();
  let snap = await work.snapshot(headers());
  const c = snap.contexts.find((c) => c.kind === "private")!;
  await work.handle(
    "context-save",
    headers(),
    input(c, { projectId: projects[0]!.id }),
  );
  advance();
  const template = structuredClone(f.state.tasks[1]!);
  f.state.tasks = Array.from({ length: count }, (_, n) => ({
    ...template,
    id: "root-" + n,
    parent_id: null,
    priority: 4 - (n % 4),
    section_id: "section:open",
  }));
  await work.handle("tasks-refresh", headers(), { contextId: c.id });
  advance();
  snap = await work.snapshot(headers());
  return snap.contexts.find((v) => v.id === c.id)!;
}
async function proposal(count = 3) {
  const c = await prepare(count);
  const v = await plans().snapshot(headers(), c.id);
  await plans().handle("propose", headers(), {
    contextId: c.id,
    day: v.day,
    revision: 0,
  });
  return plans().snapshot(headers(), c.id);
}
async function confirm(
  v: Awaited<ReturnType<ReturnType<typeof plans>["snapshot"]>>,
  key = crypto.randomUUID(),
) {
  return plans().handle("confirm", headers(), {
    contextId: v.plan!.contextId,
    day: v.day,
    revision: v.plan!.revision,
    key,
    taskIds: v.plan!.entries.map((e) => e.taskId),
  });
}
async function resume(
  v: Awaited<ReturnType<ReturnType<typeof plans>["snapshot"]>>,
) {
  return plans().handle("resume", headers(), {
    contextId: v.plan!.contextId,
    day: v.day,
    revision: v.plan!.revision,
    operationId: v.operation!.id,
  });
}
it("persists three independent context plans at the same date with fewer than three tasks allowed", async () => {
  const v = await proposal(2);
  expect(v.plan!.entries).toHaveLength(2);
  for (const [n, p] of projects.slice(1, 3).entries()) {
    await work.handle(
      "context-save",
      headers(),
      employer("Employer " + n, p.id),
    );
    advance();
    const s = await work.snapshot(headers());
    const c = s.contexts.find((c) => c.projectId === p.id)!;
    const t = {
      ...structuredClone(f.state.tasks[0]!),
      id: "work-" + n,
      project_id: p.id,
    };
    f.state.tasks.push(t);
    await work.handle("tasks-refresh", headers(), { contextId: c.id });
    advance();
    const d = await plans().snapshot(headers(), c.id);
    await plans().handle("propose", headers(), {
      contextId: c.id,
      day: d.day,
      revision: 0,
    });
  }
  expect(
    (await db.pool.query("SELECT count(*)::int AS count FROM daily_plans"))
      .rows[0].count,
  ).toBe(3);
  expect(
    (await plans().snapshot(headers(), v.plan!.contextId)).plan!.entries.map(
      (e) => e.taskId,
    ),
  ).toEqual(v.plan!.entries.map((e) => e.taskId));
});
it("confirms several native section moves, stores observations and persists focus without reorder", async () => {
  const v = await proposal();
  await confirm(v);
  expect(f.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  await executor().runNext();
  let now = await plans().snapshot(headers(), v.plan!.contextId);
  expect(now.plan!.status).toBe("confirmed");
  expect(f.state.tasks.every((t) => t.section_id === "section:active")).toBe(
    true,
  );
  const before = now.plan!.entries.map((e) => e.taskId);
  const focus = before[1]!;
  await plans().handle("focus", headers(), {
    contextId: now.plan!.contextId,
    day: now.day,
    revision: now.plan!.revision,
    taskId: focus,
  });
  now = await plans().snapshot(headers(), now.plan!.contextId);
  expect(now.plan!.focusTaskId).toBe(focus);
  expect(now.plan!.entries.map((e) => e.taskId)).toEqual(before);
  expect(
    now.history.some(
      (h) => h.status === "confirmed" && h.focusTaskId === before[0],
    ),
  ).toBe(true);
  const events = (
    await db.pool.query("SELECT event FROM planning_observations")
  ).rows.map((v) => v.event);
  expect(events).toEqual(
    expect.arrayContaining([
      "proposal_selected",
      "plan_confirmed",
      "focus_manually_changed",
      "recommendation_overridden",
    ]),
  );
});
it("keeps native hierarchy for selected children and selected containers without moving unselected children", async () => {
  const c = await prepare(1);
  const parent = { ...structuredClone(f.state.tasks[0]!), id: "parent" };
  const child = {
    ...structuredClone(parent),
    id: "child",
    parent_id: "parent",
  };
  f.state.tasks = [parent, child];
  advance();
  await work.handle("tasks-refresh", headers(), { contextId: c.id });
  advance();
  const initial = await plans().snapshot(headers(), c.id);
  await plans().handle("propose", headers(), {
    contextId: c.id,
    day: initial.day,
    revision: 0,
  });
  const v = await plans().snapshot(headers(), c.id);
  await confirm(v);
  await executor().runNext();
  const result = await plans().snapshot(headers(), c.id);
  expect(result.plan!.status).toBe("confirmed");
  expect(result.operation!.steps.every((s) => s.status === "local")).toBe(true);
  expect(f.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  expect(f.state.tasks[1]!.parent_id).toBe("parent");
});
it("rejects stale revisions and concurrent proposal updates atomically", async () => {
  const v = await proposal();
  const body = {
    contextId: v.plan!.contextId,
    day: v.day,
    revision: v.plan!.revision,
  };
  const results = await Promise.allSettled([
    plans().handle("propose", headers(), body),
    plans().handle("propose", headers(), body),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  await expect(confirm(v)).rejects.toThrow();
});
it("deduplicates identical confirmation intents and rejects key reuse with another body", async () => {
  const v = await proposal();
  const key = crypto.randomUUID();
  const a = await confirm(v, key);
  const b = await confirm(v, key);
  expect(a).toEqual(b);
  await expect(
    plans().handle("confirm", headers(), {
      contextId: v.plan!.contextId,
      day: v.day,
      revision: v.plan!.revision,
      key,
      taskIds: [v.plan!.entries[0]!.taskId],
    }),
  ).rejects.toThrow();
  await executor().runNext();
  expect(f.calls.filter((c) => c.method === "POST")).toHaveLength(3);
});
it("does not overwrite a confirmed plan when a new urgent task appears", async () => {
  const v = await proposal();
  await confirm(v);
  await executor().runNext();
  const after = await plans().snapshot(headers(), v.plan!.contextId);
  f.state.tasks.push({ ...f.state.tasks[0]!, id: "urgent-new", priority: 4 });
  await expect(
    plans().handle("propose", headers(), {
      contextId: after.plan!.contextId,
      day: after.day,
      revision: after.plan!.revision,
    }),
  ).rejects.toThrow();
  expect(
    (await plans().snapshot(headers(), after.plan!.contextId)).plan,
  ).toEqual(after.plan);
});
it("preserves partial success and retries only missing steps after explicit user resume", async () => {
  const v = await proposal();
  f.control.failTask = v.plan!.entries[1]!.taskId;
  await confirm(v);
  await executor().runNext();
  let after = await plans().snapshot(headers(), v.plan!.contextId);
  expect(after.plan!.status).toBe("partial");
  expect(
    after.operation!.steps.filter((s) => s.status === "verified"),
  ).toHaveLength(1);
  expect(await executor().runNext()).toBe(false);
  advance(31000);
  f.control.failTask = "";
  await resume(after);
  await executor().runNext();
  after = await plans().snapshot(headers(), v.plan!.contextId);
  expect(after.plan!.status).toBe("confirmed");
  expect(
    f.calls.filter(
      (c) =>
        c.method === "POST" &&
        decodeURIComponent(c.url).includes(v.plan!.entries[0]!.taskId),
    ),
  ).toHaveLength(1);
});
it("reconciles a timeout that applied the move without repeating the mutation", async () => {
  const v = await proposal(1);
  f.control.timeoutApplied = "root-0";
  await confirm(v);
  await executor().runNext();
  const after = await plans().snapshot(headers(), v.plan!.contextId);
  expect(after.plan!.status).toBe("confirmed");
  expect(f.calls.filter((c) => c.method === "POST")).toHaveLength(1);
});
it("persists an unknown outcome then reads before an explicit retry", async () => {
  const v = await proposal(1);
  f.control.timeoutUnknown = "root-0";
  await confirm(v);
  await executor().runNext();
  let after = await plans().snapshot(headers(), v.plan!.contextId);
  expect(after.operation!.steps[0]!.status).toBe("unknown");
  advance(31000);
  f.control.timeoutUnknown = "";
  await resume(after);
  await executor().runNext();
  after = await plans().snapshot(headers(), v.plan!.contextId);
  expect(after.plan!.status).toBe("confirmed");
});
it("does not create missing sections or report false confirmation", async () => {
  const v = await proposal(1);
  f.control.missingSection = true;
  await confirm(v);
  await executor().runNext();
  const after = await plans().snapshot(headers(), v.plan!.contextId);
  expect(after.operation!.code).toBe("SECTION_MISSING");
  expect(after.plan!.confirmedAt).toBeNull();
  expect(f.calls.filter((c) => c.method === "POST")).toHaveLength(0);
});
it.each(["moved", "changed", "deleted"])(
  "rejects a %s source before any write",
  async (mode) => {
    const v = await proposal();
    if (mode === "moved") f.state.tasks[0]!.project_id = "foreign";
    if (mode === "changed") f.state.tasks[0]!.content = "External change";
    if (mode === "deleted") f.state.tasks.shift();
    await confirm(v);
    await executor().runNext();
    expect(
      (await plans().snapshot(headers(), v.plan!.contextId)).plan!.status,
    ).toBe("partial");
    expect(f.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  },
);
it("guards anonymous, fake origin, foreign context, foreign task and revoked worker sessions", async () => {
  const v = await proposal();
  await expect(
    plans().snapshot(headers(""), v.plan!.contextId),
  ).rejects.toThrow();
  await expect(
    plans().snapshot(headers(), crypto.randomUUID()),
  ).rejects.toThrow();
  const bad = headers();
  bad.set("origin", "http://foreign.invalid");
  await expect(
    plans().handle("propose", bad, {
      contextId: v.plan!.contextId,
      day: v.day,
      revision: 1,
    }),
  ).rejects.toThrow();
  await expect(
    plans().handle("confirm", headers(), {
      contextId: v.plan!.contextId,
      day: v.day,
      revision: 1,
      key: crypto.randomUUID(),
      taskIds: ["foreign"],
    }),
  ).rejects.toThrow();
  await confirm(v);
  await identity.handle("logout", headers(), {});
  await executor().runNext();
  expect(f.calls.filter((c) => c.method === "POST")).toHaveLength(0);
});
it("retains journal evidence when logout follows an external move and does not start later steps", async () => {
  const v = await proposal();
  await confirm(v);
  f.control.afterMove = async () => {
    await identity.handle("logout", headers(), {});
  };
  await executor().runNext();
  expect(f.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  const steps = (await db.pool.query("SELECT status FROM plan_operation_steps"))
    .rows;
  expect(
    steps.some((s) => s.status === "verified" || s.status === "failed"),
  ).toBe(true);
});
it("protects historical revisions and confirmed entry content in PostgreSQL", async () => {
  const v = await proposal();
  await confirm(v);
  await executor().runNext();
  await expect(
    db.pool.query("UPDATE plan_history SET revision=revision+1"),
  ).rejects.toThrow();
  await expect(db.pool.query("DELETE FROM plan_history")).rejects.toThrow();
  await expect(
    db.pool.query("UPDATE daily_plans SET entries='[]'::jsonb"),
  ).rejects.toThrow();
});
it("allows an empty draft but cannot confirm a fabricated selection", async () => {
  const v = await proposal(0);
  expect(v.plan!.entries).toEqual([]);
  await expect(confirm(v)).rejects.toThrow();
});
it("rejects stale sources and wrong calendar days without Ollama dependencies", async () => {
  const c = await prepare();
  advance(301000);
  const v = await plans().snapshot(headers(), c.id);
  await expect(
    plans().handle("propose", headers(), {
      contextId: c.id,
      day: v.day,
      revision: 0,
    }),
  ).rejects.toThrow();
  await expect(
    plans().handle("propose", headers(), {
      contextId: c.id,
      day: "2000-01-01",
      revision: 0,
    }),
  ).rejects.toThrow();
  expect(f.calls.every((c) => !c.url.includes("ollama"))).toBe(true);
});
it.each(["sending", "unknown"])(
  "reconciles a crashed %s step without an automatic second mutation",
  async (status) => {
    const v = await proposal(1);
    await confirm(v);
    await db.pool.query(
      "UPDATE plan_operation_steps SET status=$1,attempts=1,target_section_id='section:active'",
      [status],
    );
    await db.pool.query("UPDATE plan_operations SET status='running'");
    await executor().runNext();
    const after = await plans().snapshot(headers(), v.plan!.contextId);
    expect(after.operation!.steps[0]!.status).toBe("unknown");
    expect(f.calls.filter((c) => c.method === "POST")).toHaveLength(0);
    await resume(after);
    await executor().runNext();
    expect(
      (await plans().snapshot(headers(), v.plan!.contextId)).plan!.status,
    ).toBe("confirmed");
  },
);
it("serializes competing workers so a queued plan is executed once", async () => {
  const v = await proposal();
  await confirm(v);
  await Promise.all([executor().runNext(), executor().runNext()]);
  expect(f.calls.filter((c) => c.method === "POST")).toHaveLength(3);
});
it("requires full MFA for the new plan endpoints and does not renew idle activity from background work", async () => {
  const v = await proposal();
  const before = (
    await db.pool.query("SELECT last_seen_at FROM auth_session_policy")
  ).rows[0].last_seen_at;
  await confirm(v);
  advance(5000);
  await executor().runNext();
  expect(
    (await db.pool.query("SELECT last_seen_at FROM auth_session_policy"))
      .rows[0].last_seen_at,
  ).toEqual(before);
  const login = await identity.handle("login", headers(""), {
    username: "synthetic_user",
    password,
  });
  const preMfa = absorb("", login);
  await expect(
    plans().snapshot(headers(preMfa), v.plan!.contextId),
  ).rejects.toThrow();
});
it.each(["deactivate", "token"])(
  "stops later steps after concurrent %s and keeps a proved external move",
  async (mode) => {
    const v = await proposal();
    await confirm(v);
    f.control.afterMove = async () => {
      const snap = await work.snapshot(headers());
      if (mode === "token")
        await work.handle("token-remove", headers(), {
          revision: snap.integration.revision,
        });
      else {
        const c = snap.contexts.find((c) => c.id === v.plan!.contextId)!;
        await db.pool.query(
          "UPDATE contexts SET project_id=NULL,revision=revision+1 WHERE id=$1",
          [c.id],
        );
      }
    };
    await executor().runNext();
    expect(f.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    const after = await plans().snapshot(headers(), v.plan!.contextId);
    expect(after.plan!.status).toBe("partial");
    expect(after.operation!.steps.some((s) => s.status === "verified")).toBe(
      true,
    );
  },
);
it("retains yesterday confirmed history while creating an independent plan for a new local day", async () => {
  const v = await proposal(1);
  await confirm(v);
  await executor().runNext();
  const yesterday = await plans().snapshot(headers(), v.plan!.contextId);
  advance(86400000);
  const login = await identity.handle("login", headers(""), {
    username: "synthetic_user",
    password,
  });
  cookie = absorb("", login);
  const mfa = await identity.handle("mfa", headers(), {
    code: generateSync({ secret }),
  });
  expect(mfa.status ?? 200).toBe(200);
  cookie = absorb(cookie, mfa);
  await work.handle("tasks-refresh", headers(), {
    contextId: v.plan!.contextId,
  });
  advance();
  const next = await plans().snapshot(headers(), v.plan!.contextId);
  expect(next.day).not.toBe(v.day);
  await plans().handle("propose", headers(), {
    contextId: v.plan!.contextId,
    day: next.day,
    revision: 0,
  });
  expect(
    (await plans().snapshot(headers(), v.plan!.contextId, v.day)).plan,
  ).toEqual(yesterday.plan);
});
it("compares dated source objects canonically after PostgreSQL JSONB key reordering", async () => {
  const c = await prepare(1);
  const initial = await plans().snapshot(headers(), c.id);
  f.state.tasks[0]!.due = {
    date: initial.day,
    datetime: initial.day + "T09:00:00",
    timezone: "Europe/Zurich",
    is_recurring: false,
  };
  f.state.tasks[0]!.duration = { unit: "minute", amount: 15 };
  advance();
  await work.handle("tasks-refresh", headers(), { contextId: c.id });
  await plans().handle("propose", headers(), {
    contextId: c.id,
    day: initial.day,
    revision: 0,
  });
  const v = await plans().snapshot(headers(), c.id);
  await confirm(v);
  await executor().runNext();
  expect((await plans().snapshot(headers(), c.id)).plan!.status).toBe(
    "confirmed",
  );
});
it("confirms a deliberate subset in proposal order and records neutral rejected suggestions", async () => {
  const v = await proposal();
  const entries = v.plan!.entries;
  await plans().handle("confirm", headers(), {
    contextId: v.plan!.contextId,
    day: v.day,
    revision: v.plan!.revision,
    key: crypto.randomUUID(),
    taskIds: [entries[2]!.taskId, entries[0]!.taskId],
  });
  await executor().runNext();
  const after = await plans().snapshot(headers(), v.plan!.contextId);
  expect(after.plan!.entries.map((e) => e.taskId)).toEqual([
    entries[0]!.taskId,
    entries[2]!.taskId,
  ]);
  expect(f.calls.filter((c) => c.method === "POST")).toHaveLength(2);
  expect(
    (
      await db.pool.query(
        "SELECT task_id FROM planning_observations WHERE event='proposal_not_selected'",
      )
    ).rows[0].task_id,
  ).toBe(entries[1]!.taskId);
});
it("does not execute expired intents or run any operation in restore mode", async () => {
  const v = await proposal(1);
  await confirm(v);
  expect(
    await createPlanExecutor(db, { ...config, RESTORE_MODE: true }).runNext(),
  ).toBe(false);
  advance(601000);
  await executor().runNext();
  const after = await plans().snapshot(headers(), v.plan!.contextId);
  expect(after.operation!.code).toBe("INTENT_EXPIRED");
  expect(f.calls.filter((c) => c.method === "POST")).toHaveLength(0);
});
it("authenticates before validating malformed plan requests", async () => {
  await expect(
    plans().snapshot(headers(""), "invalid", "invalid"),
  ).rejects.toMatchObject({ code: "AUTH_FAILED", status: 401 });
  await expect(
    plans().handle("propose", headers(""), {}),
  ).rejects.toMatchObject({ code: "AUTH_FAILED", status: 401 });
});
