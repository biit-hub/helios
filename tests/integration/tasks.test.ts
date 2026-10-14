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
import { taskFixture as fixture } from "../fixtures/tasks";
import { createTaskService, createPlanExecutor } from "@helios/backend";
import { createTodoistMover } from "../../packages/backend/src/planning/todoist";
import { createTaskWriter } from "../../packages/backend/src/tasks/todoist";
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

const tasks = () =>
  createTaskService(db, config, createTodoistReader(f.fetcher));
const executor = () =>
  createPlanExecutor(
    db,
    config,
    createTodoistReader(f.fetcher),
    createTodoistMover(f.fetcher),
    createTaskWriter(f.fetcher),
  );
async function prepare() {
  await connect();
  const snap = await work.snapshot(headers());
  const c = snap.contexts[0]!;
  await work.handle(
    "context-save",
    headers(),
    input(c, { projectId: projects[0]!.id }),
  );
  advance();
  f.state.tasks = [
    {
      ...structuredClone(f.state.tasks[1]!),
      id: "synthetic-root",
      parent_id: null,
    },
  ];
  await work.handle("tasks-refresh", headers(), { contextId: c.id });
  advance();
  return (await work.snapshot(headers())).contexts.find((x) => x.id === c.id)!;
}
async function change(
  c: Awaited<ReturnType<typeof prepare>>,
  action: string,
  extra: Record<string, unknown> = {},
) {
  const inspection = await tasks().inspect(headers(), c.id, "synthetic-root");
  return tasks().handle("submit", headers(), {
    key: crypto.randomUUID(),
    action,
    contextId: c.id,
    taskId: inspection.task.id,
    basis: inspection.basis,
    acknowledgeDestructive: true,
    ...extra,
  }) as Promise<{ operationId: string }>;
}
async function result(id: string) {
  const rows = await tasks().operations(headers());
  return rows.find((r) => r.id === id)!;
}
it.each([false, true])(
  "creates explicitly with project=%s; absence means Inbox without any analysis",
  async (explicit) => {
    const c = await prepare();
    const n = f.state.tasks.length;
    const op = (await tasks().handle("submit", headers(), {
      key: crypto.randomUUID(),
      action: "create",
      contextId: explicit ? c.id : null,
      projectId: explicit ? projects[0]!.id : null,
      fields: { content: "Synthetic minimal" },
    })) as { operationId: string };
    await executor().runNext();
    expect((await result(op.operationId)).status).toBe("succeeded");
    expect(f.state.tasks[n]?.project_id).toBe(projects[explicit ? 0 : 4]!.id);
    expect(f.control.calls).toHaveLength(1);
  },
);
it("updates only confirmed fields and clears due, deadline and labels independently", async () => {
  const c = await prepare();
  Object.assign(f.state.tasks[0]!, {
    description: "Keep original description",
    due: { date: "2026-10-20" },
    deadline: { date: "2026-10-22" },
    labels: ["other"],
  });
  const a = await change(c, "update", {
    fields: { content: "Edited", due: "2026-10-21T10:00:00Z" },
  });
  await executor().runNext();
  expect((await result(a.operationId)).status).toBe("succeeded");
  expect(f.state.tasks[0]!.description).toBe("Keep original description");
  expect(f.state.tasks[0]!.deadline?.date).toBe("2026-10-22");
  const b = await change(c, "update", {
    fields: { due: null, deadline: null, labels: [] },
  });
  await executor().runNext();
  expect((await result(b.operationId)).status).toBe("succeeded");
  expect(f.state.tasks[0]!.due).toBeNull();
  expect(f.state.tasks[0]!.deadline).toBeNull();
});
it("adds a comment once across duplicate accepted requests", async () => {
  const c = await prepare();
  const inspection = await tasks().inspect(headers(), c.id, "synthetic-root");
  const body = {
    key: crypto.randomUUID(),
    action: "comment",
    contextId: c.id,
    taskId: "synthetic-root",
    basis: inspection.basis,
    comment: "Synthetic comment",
  };
  const a = await tasks().handle("submit", headers(), body);
  expect(await tasks().handle("submit", headers(), body)).toEqual(a);
  await executor().runNext();
  expect(
    f.comments.filter((x) => x.content === "Synthetic comment"),
  ).toHaveLength(1);
  await expect(
    tasks().handle("submit", headers(), { ...body, comment: "Changed" }),
  ).rejects.toMatchObject({ status: 409 });
});
it.each(["create", "comment"])(
  "never replays an unknown %s even after explicit resume",
  async (action) => {
    const c = await prepare();
    f.control.fail = "applied";
    const op =
      action === "create"
        ? ((await tasks().handle("submit", headers(), {
            key: crypto.randomUUID(),
            action,
            contextId: c.id,
            projectId: c.projectId,
            fields: { content: "Synthetic unknown" },
          })) as { operationId: string })
        : await change(c, action, { comment: "Synthetic unknown" });
    await executor().runNext();
    expect((await result(op.operationId)).status).toBe("unknown");
    const count = f.control.calls.length;
    f.control.fail = "";
    await tasks().handle("resume", headers(), { operationId: op.operationId });
    await executor().runNext();
    expect((await result(op.operationId)).status).toBe("unknown");
    expect(f.control.calls).toHaveLength(count);
  },
);
it("rejects a stale edit before queueing and detects remote changes after queueing", async () => {
  const c = await prepare();
  const i = await tasks().inspect(headers(), c.id, "synthetic-root");
  f.state.tasks[0]!.content = "External edit";
  await expect(
    tasks().handle("submit", headers(), {
      key: crypto.randomUUID(),
      action: "update",
      contextId: c.id,
      taskId: i.task.id,
      basis: i.basis,
      fields: { content: "Old edit" },
    }),
  ).rejects.toMatchObject({ code: "TASK_SOURCE_CONFLICT" });
  const op = await change(c, "update", { fields: { content: "Queued" } });
  f.state.tasks[0]!.description = "New external edit";
  await executor().runNext();
  expect((await result(op.operationId)).code).toBe("TASK_SOURCE_CONFLICT");
  expect(f.control.calls).toHaveLength(0);
});
it("stores waiting details without touching foreign description and excludes waiting from planning", async () => {
  const c = await prepare();
  f.state.tasks[0]!.description =
    "## Ziel\nExactly preserved.\n\n## Checkliste\n- [ ] Keep";
  const op = await change(c, "wait", {
    waiting: {
      who: "Synthetic team",
      subject: "Reply",
      followUp: "2026-10-20",
    },
  });
  await executor().runNext();
  expect((await result(op.operationId)).status).toBe("succeeded");
  expect(
    f.state.tasks[0]!.description.startsWith(
      "## Ziel\nExactly preserved.\n\n## Checkliste\n- [ ] Keep",
    ),
  ).toBe(true);
  expect(f.state.tasks[0]!.section_id).toBe(
    f.sections.find((s) => s.project_id === c.projectId && s.name === "Wartet")!
      .id,
  );
  const { createPlanningService } = await import("@helios/backend");
  const p = createPlanningService(db, config);
  const v = await p.snapshot(headers(), c.id);
  await p.handle("propose", headers(), {
    contextId: c.id,
    day: v.day,
    revision: 0,
  });
  expect((await p.snapshot(headers(), c.id)).plan?.entries).toHaveLength(0);
});
it.each(["move", "close", "delete", "wait"])(
  "requires explicit hierarchy approval for %s",
  async (action) => {
    const c = await prepare();
    f.state.tasks.push({
      ...structuredClone(f.state.tasks[0]!),
      id: "synthetic-child",
      parent_id: "synthetic-root",
    });
    await expect(
      change(c, action, {
        sectionId: f.sections[1]!.id,
        waiting: { who: "Test", subject: "Test", followUp: null },
      }),
    ).rejects.toMatchObject({ code: "HIERARCHY_CONFIRMATION_REQUIRED" });
    expect(f.control.calls).toHaveLength(0);
  },
);
it("moves via native operation and preserves hierarchy unless explicitly acknowledged", async () => {
  const c = await prepare();
  const target = f.sections.find(
    (s) => s.project_id === c.projectId && s.name === "In Arbeit",
  )!;
  const op = await change(c, "move", { sectionId: target.id });
  await executor().runNext();
  expect((await result(op.operationId)).status).toBe("succeeded");
  expect(f.control.calls[0]!.path.endsWith("/move")).toBe(true);
  expect(f.state.tasks[0]!.section_id).toBe(target.id);
});
it("checks target project and uses native project move", async () => {
  const c = await prepare();
  await work.handle(
    "context-save",
    headers(),
    employer("Synthetic second", projects[1]!.id),
  );
  const op = await change(c, "move", { projectId: projects[1]!.id });
  await executor().runNext();
  expect((await result(op.operationId)).status).toBe("succeeded");
  expect(f.state.tasks[0]!.project_id).toBe(projects[1]!.id);
});
it("closes normally only after proven Abgeschlossen move, then removes the projection from active candidates", async () => {
  const c = await prepare();
  const op = await change(c, "close");
  await executor().runNext();
  expect((await result(op.operationId)).status).toBe("succeeded");
  expect(f.control.calls.map((c) => c.path.split("/").pop())).toEqual([
    "move",
    "close",
  ]);
  expect(f.state.tasks[0]!.checked).toBe(true);
});
it("advances one recurring occurrence and restores its next active occurrence to Offen", async () => {
  const c = await prepare();
  f.state.tasks[0]!.due = { date: "2026-10-20", is_recurring: true };
  const op = await change(c, "close");
  await executor().runNext();
  expect((await result(op.operationId)).status).toBe("succeeded");
  expect(f.state.tasks[0]!.due?.date).toBe("2026-10-21");
  expect(f.state.tasks[0]!.section_id).toBe(
    f.sections.find((s) => s.project_id === c.projectId && s.name === "Offen")!
      .id,
  );
  expect(f.control.calls.filter((c) => c.path.endsWith("/close"))).toHaveLength(
    1,
  );
});
it("reconciles a lost recurring close response without closing the next occurrence", async () => {
  const c = await prepare();
  f.state.tasks[0]!.due = { date: "2026-10-20", is_recurring: true };
  f.control.afterWrite = () => {
    if (f.control.calls.at(-1)?.path.endsWith("/close"))
      f.control.fail = "applied";
  };
  const op = await change(c, "close");
  await executor().runNext();
  expect((await result(op.operationId)).status).toBe("unknown");
  f.control.fail = "";
  f.control.afterWrite = undefined;
  await tasks().handle("resume", headers(), { operationId: op.operationId });
  await executor().runNext();
  expect((await result(op.operationId)).status).toBe("succeeded");
  expect(f.state.tasks[0]!.due?.date).toBe("2026-10-21");
  expect(f.control.calls.filter((c) => c.path.endsWith("/close"))).toHaveLength(
    1,
  );
});
it("deletes only after explicit confirmation and verifies its absence", async () => {
  const c = await prepare();
  await expect(
    change(c, "delete", { acknowledgeDestructive: false }),
  ).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
  const op = await change(c, "delete");
  await executor().runNext();
  expect((await result(op.operationId)).status).toBe("succeeded");
  expect(f.state.tasks).toHaveLength(0);
});
it("persists rate limit and resumes only after backoff", async () => {
  const c = await prepare();
  f.control.fail = "429";
  const op = await change(c, "update", { fields: { priority: 4 } });
  await executor().runNext();
  expect((await result(op.operationId)).code).toBe("rate_limit");
  await expect(
    tasks().handle("resume", headers(), { operationId: op.operationId }),
  ).rejects.toMatchObject({ code: "RETRY_LATER" });
  advance(41000);
  f.control.fail = "";
  await tasks().handle("resume", headers(), { operationId: op.operationId });
  await executor().runNext();
  expect((await result(op.operationId)).status).toBe("succeeded");
});
it("guards malformed inputs, Origin and foreign context before mutation", async () => {
  const c = await prepare();
  await expect(
    tasks().handle("submit", headers(""), null),
  ).rejects.toMatchObject({ status: 401 });
  const h = headers();
  h.set("origin", "https://foreign.invalid");
  await expect(tasks().handle("submit", h, null)).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    tasks().inspect(headers(), crypto.randomUUID(), "synthetic-root"),
  ).rejects.toMatchObject({ status: 404 });
  const op = await change(c, "update", { fields: { priority: 4 } });
  await identity.handle("logout", headers(), {});
  await executor().runNext();
  const row = await db.pool.query(
    "select status from plan_operations where id=$1",
    [op.operationId],
  );
  expect(row.rows[0].status).toBe("failed");
  expect(f.control.calls).toHaveLength(0);
});
it("rejects fun on employer tasks and only creates sections by deliberate command", async () => {
  await prepare();
  await work.handle(
    "context-save",
    headers(),
    employer("Synthetic second", projects[1]!.id),
  );
  const snap = await work.snapshot(headers());
  const c = snap.contexts.find((c) => c.kind === "employer")!;
  await expect(
    tasks().handle("submit", headers(), {
      key: crypto.randomUUID(),
      action: "create",
      contextId: c.id,
      projectId: c.projectId,
      fields: { content: "Synthetic", labels: ["fun"] },
    }),
  ).rejects.toMatchObject({ code: "FUN_PRIVATE_ONLY" });
  f.sections.splice(0, f.sections.length);
  const op = (await tasks().handle("submit", headers(), {
    key: crypto.randomUUID(),
    action: "sections",
    contextId: c.id,
  })) as { operationId: string };
  await executor().runNext();
  expect((await result(op.operationId)).status).toBe("succeeded");
  expect(f.sections).toHaveLength(4);
});

it("E3 regression: waiting invalidates executable focus without rewriting confirmed plan history", async () => {
  const c = await prepare();
  const { createPlanningService } = await import("@helios/backend");
  const p = createPlanningService(db, config);
  const original = await p.snapshot(headers(), c.id);
  await p.handle("propose", headers(), {
    contextId: c.id,
    day: original.day,
    revision: 0,
  });
  const draft = await p.snapshot(headers(), c.id);
  await p.handle("confirm", headers(), {
    contextId: c.id,
    day: draft.day,
    revision: draft.plan!.revision,
    key: crypto.randomUUID(),
    taskIds: ["synthetic-root"],
  });
  await executor().runNext();
  const confirmed = await p.snapshot(headers(), c.id);
  expect(confirmed.plan?.status).toBe("confirmed");
  const source = JSON.stringify(confirmed.plan!.entries);
  const op = await change(c, "wait", {
    waiting: { who: "Synthetic", subject: "Waiting", followUp: null },
  });
  const pending = await p.snapshot(headers(), c.id);
  expect(pending.availability?.["synthetic-root"]).toBe(false);
  await executor().runNext();
  expect((await result(op.operationId)).status).toBe("succeeded");
  const after = await p.snapshot(headers(), c.id);
  expect(after.availability?.["synthetic-root"]).toBe(false);
  expect(JSON.stringify(after.plan!.entries)).toBe(source);
  expect(after.plan!.revision).toBe(confirmed.plan!.revision);
  await expect(
    p.handle("focus", headers(), {
      contextId: c.id,
      day: after.day,
      revision: after.plan!.revision,
      taskId: "synthetic-root",
    }),
  ).rejects.toMatchObject({ code: "PLAN_CONFLICT" });
});
it("refuses to close an unacknowledged child appearing between the move and close", async () => {
  const c = await prepare();
  f.control.afterWrite = () => {
    if (f.control.calls.at(-1)?.path.endsWith("/move"))
      f.state.tasks.push({
        ...structuredClone(f.state.tasks[0]!),
        id: "late-child",
        parent_id: "synthetic-root",
      });
  };
  const op = await change(c, "close");
  await executor().runNext();
  expect((await result(op.operationId)).status).toBe("unknown");
  expect(f.control.calls.filter((x) => x.path.endsWith("/close"))).toHaveLength(
    0,
  );
  expect(f.state.tasks.find((t) => t.id === "late-child")?.checked).toBe(false);
});
it("records a definite permission rejection without claiming an external success and keeps original input", async () => {
  const c = await prepare();
  f.control.fail = "403";
  const op = await change(c, "update", { fields: { deadline: "2026-10-23" } });
  await executor().runNext();
  const r = await result(op.operationId);
  expect(r.status).toBe("failed");
  expect(r.code).toBe("TODOIST_PERMISSION");
  expect(r.result?.effects ?? []).toHaveLength(0);
  const raw = await db.pool.query(
    "select payload from plan_operations where id=$1",
    [op.operationId],
  );
  expect(raw.rows[0].payload.command.fields.deadline).toBe("2026-10-23");
});
it("stops after session revocation between close workflow steps", async () => {
  const c = await prepare();
  f.control.afterWrite = async () => {
    if (f.control.calls.at(-1)?.path.endsWith("/move"))
      await db.pool.query("delete from auth_session");
  };
  await change(c, "close");
  await executor().runNext();
  expect(f.control.calls.filter((x) => x.path.endsWith("/close"))).toHaveLength(
    0,
  );
  expect(f.state.tasks[0]?.checked).toBe(false);
});
it("does not replay a crash marker even if the worker restarts after an unrecorded create result", async () => {
  const c = await prepare();
  f.control.fail = "applied";
  const op = (await tasks().handle("submit", headers(), {
    key: crypto.randomUUID(),
    action: "create",
    contextId: c.id,
    projectId: c.projectId,
    fields: { content: "Synthetic crash" },
  })) as { operationId: string };
  await executor().runNext();
  await db.pool.query(
    "update plan_operations set status='running' where id=$1",
    [op.operationId],
  );
  const n = f.control.calls.length;
  f.control.fail = "";
  await executor().runNext();
  expect(f.control.calls).toHaveLength(n);
  expect((await result(op.operationId)).status).toBe("unknown");
});
