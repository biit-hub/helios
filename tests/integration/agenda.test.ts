import { beforeEach, it, expect } from "vitest";
import { generateSync } from "otplib";
import { createPlanningService, createPlanExecutor } from "@helios/backend";
import { createAgendaService } from "../../packages/backend/src/planning/agenda-service";
import { createTodoistReader } from "../../packages/backend/src/work/todoist";
import { createTodoistMover } from "../../packages/backend/src/planning/todoist";
import { createTaskWriter } from "../../packages/backend/src/tasks/todoist";
import { createTaskService } from "../../packages/backend/src/tasks/service";
import { agendaEntries, agendaState, entryKey } from "@helios/contracts";
import { createWorkHarness } from "../fixtures/integration-work";
import { taskFixture } from "../fixtures/tasks";
import { projects } from "../fixtures/todoist";
const h = createWorkHarness(taskFixture);
let f = h.f;
let work = h.work;
beforeEach(() => {
  f = h.f;
  work = h.work;
});
const { db, config, headers, connect, input, advance } = h;
const plans = () => createPlanningService(db, config);
const reader = () => createTodoistReader(f.fetcher);
const agenda = () => createAgendaService(db, config, "Europe/Zurich", reader());
const tasks = () => createTaskService(db, config, reader());
const executor = () =>
  createPlanExecutor(
    db,
    config,
    reader(),
    createTodoistMover(f.fetcher),
    createTaskWriter(f.fetcher),
  );
async function prepare(count = 6, recurring = false) {
  await connect();
  const c = (await work.snapshot(headers())).contexts[0]!;
  await work.handle(
    "context-save",
    headers(),
    input(c, { projectId: projects[0]!.id }),
  );
  advance();
  const template = structuredClone(f.state.tasks[1]!);
  f.state.tasks = Array.from({ length: count }, (_, n) => ({
    ...template,
    id: "agenda-" + n,
    content: "Synthetic agenda " + n,
    parent_id: null,
    labels: [],
    due: null,
    deadline: null,
    priority: 1,
    section_id: f.sections.find(
      (s) => s.project_id === projects[0]!.id && s.name === "Offen",
    )!.id,
  }));
  if (recurring)
    f.state.tasks[4]!.due = {
      date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      is_recurring: true,
      string: "every day",
    };
  await work.handle("tasks-refresh", headers(), { contextId: c.id });
  advance();
  let v = await plans().snapshot(headers(), c.id);
  await plans().handle("propose", headers(), {
    contextId: c.id,
    day: v.day,
    revision: 0,
  });
  v = await plans().snapshot(headers(), c.id);
  await plans().handle("confirm", headers(), {
    contextId: c.id,
    day: v.day,
    revision: v.plan!.revision,
    key: crypto.randomUUID(),
    taskIds: v.plan!.entries.map((e) => e.taskId),
  });
  await executor().runNext();
  v = await plans().snapshot(headers(), c.id);
  expect(v.plan!.status).toBe("confirmed");
  if (recurring) {
    await action(v, "agenda-focus", { taskId: "agenda-0" });
    v = await plans().snapshot(headers(), c.id);
  }
  return v;
}
type View = Awaited<ReturnType<typeof prepare>>;
async function action(
  v: View,
  name: string,
  extra: Record<string, unknown> = {},
) {
  if (name === "admit" && extra.taskId && !extra.entryKey) {
    const task = f.state.tasks.find((t) => t.id === extra.taskId);
    if (task)
      extra = {
        ...extra,
        entryKey: entryKey({ taskId: task.id, source: task }),
      };
  }
  return agenda().handle(name, headers(), {
    contextId: v.plan!.contextId,
    day: v.day,
    revision: v.plan!.revision,
    key: crypto.randomUUID(),
    ...extra,
  });
}
const reload = (v: View) => plans().snapshot(headers(), v.plan!.contextId);
it("persists main ordering atomically without rewriting source snapshots or moving focus", async () => {
  const v = await prepare();
  const old = JSON.stringify(v.plan!.entries);
  const keys = agendaState(v.plan!).main;
  const writes = f.control.calls.length;
  await action(v, "reorder", { area: "main", order: [...keys].reverse() });
  const next = await reload(v);
  expect(agendaState(next.plan!).main).toEqual([...keys].reverse());
  expect(next.plan!.focusTaskId).toBe(v.plan!.focusTaskId);
  expect(JSON.stringify(next.plan!.entries)).toBe(old);
  expect(f.control.calls).toHaveLength(writes);
  expect(
    next.history.find((p) => p.revision === v.plan!.revision)?.entries,
  ).toEqual(v.plan!.entries);
});
it("rejects simultaneous stale reorder and never saves a partial permutation", async () => {
  const v = await prepare();
  const keys = agendaState(v.plan!).main;
  const results = await Promise.allSettled([
    action(v, "reorder", { area: "main", order: [...keys].reverse() }),
    action(v, "reorder", { area: "main", order: [...keys.slice(1), keys[0]] }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const next = await reload(v);
  expect(next.plan!.revision).toBe(v.plan!.revision + 1);
  await expect(
    action(next, "reorder", { area: "main", order: [keys[0], keys[0]] }),
  ).rejects.toMatchObject({ code: "PLAN_CONFLICT" });
});
it("idempotently records a manual command and rejects key reuse with another body", async () => {
  const v = await prepare();
  const key = crypto.randomUUID();
  const order = agendaState(v.plan!).main.slice().reverse();
  await action(v, "reorder", { key, area: "main", order });
  await action(v, "reorder", { key, area: "main", order });
  const next = await reload(v);
  expect(next.plan!.revision).toBe(v.plan!.revision + 1);
  await expect(
    action(next, "reorder", { key, area: "main", order: order.reverse() }),
  ).rejects.toMatchObject({ code: "PLAN_CONFLICT" });
});
it("transfers explicitly, rotates reserve and pauses the single-card case persistently", async () => {
  let v = await prepare();
  for (const taskId of ["agenda-3", "agenda-4"]) {
    const entry = v.plan!.entries.find((e) => e.taskId === taskId)!;
    await action(v, "transfer", { entryKey: entryKey(entry), area: "reserve" });
    v = await reload(v);
  }
  let state = agendaState(v.plan!);
  const writes = f.control.calls.length;
  await action(v, "reserve-skip", {
    entryKey: state.reserve[0],
    reason: "Later today",
  });
  v = await reload(v);
  expect(agendaState(v.plan!).reserve).toEqual([
    ...state.reserve.slice(1),
    state.reserve[0],
  ]);
  expect(f.control.calls).toHaveLength(writes);
  state = agendaState(v.plan!);
  await action(v, "reorder", {
    area: "reserve",
    order: state.reserve.slice().reverse(),
  });
  v = await reload(v);
  await action(v, "transfer", {
    entryKey: agendaState(v.plan!).reserve[0],
    area: "main",
  });
  v = await reload(v);
  await action(v, "reserve-skip", {
    entryKey: agendaState(v.plan!).reserve[0],
  });
  v = await reload(v);
  expect(agendaState(v.plan!).paused).toBe(true);
  await action(v, "reserve-pause", { paused: false });
  expect(agendaState((await reload(v)).plan!).paused).toBe(false);
});
it("direct focus changes preserve main/reserve order and are idempotent", async () => {
  let v = await prepare();
  const before = agendaState(v.plan!);
  const writes = f.control.calls.length;
  const key = crypto.randomUUID();
  await action(v, "agenda-focus", { key, taskId: "agenda-2" });
  await action(v, "agenda-focus", { key, taskId: "agenda-2" });
  v = await reload(v);
  expect(v.plan!.focusTaskId).toBe("agenda-2");
  expect(agendaState(v.plan!)).toEqual(before);
  expect(f.control.calls).toHaveLength(writes);
});
it("consciously admits an extra task using the existing journal and does not duplicate retries", async () => {
  let v = await prepare();
  const before = agendaState(v.plan!).main;
  const key = crypto.randomUUID();
  const op = (await action(v, "admit", {
    taskId: "agenda-5",
    area: "main",
    key,
  })) as { operationId: string };
  v = await reload(v);
  expect(agendaState(v.plan!).main).toEqual(before);
  expect(agendaState(v.plan!).pending[0]?.operationId).toBe(op.operationId);
  await executor().runNext();
  v = await reload(v);
  expect(agendaEntries(v.plan!, "main").map((e) => e.taskId)).toEqual([
    ...v.plan!.entries.map((e) => e.taskId),
    "agenda-5",
  ]);
  await action(v, "admit", {
    taskId: "agenda-5",
    area: "main",
    key,
    revision: v.plan!.revision - 2,
  });
  expect(
    agendaEntries((await reload(v)).plan!, "main").filter(
      (e) => e.taskId === "agenda-5",
    ),
  ).toHaveLength(1);
  await expect(
    action(v, "admit", { taskId: "agenda-5" }),
  ).rejects.toMatchObject({ code: "PLAN_DUPLICATE" });
});
it("removes a reserve card only after the E4 close result is proven", async () => {
  let v = await prepare();
  const entry = v.plan!.entries[4]!;
  await action(v, "transfer", { entryKey: entryKey(entry), area: "reserve" });
  v = await reload(v);
  const inspection = await tasks().inspect(
    headers(),
    v.plan!.contextId,
    entry.taskId,
  );
  await action(v, "reserve-close", {
    taskId: entry.taskId,
    entryKey: entryKey(entry),
    basis: inspection.basis,
    acknowledgeDestructive: true,
  });
  expect(agendaEntries((await reload(v)).plan!, "reserve")).toHaveLength(1);
  await executor().runNext();
  v = await reload(v);
  expect(agendaEntries(v.plan!, "reserve")).toHaveLength(0);
  expect(agendaState(v.plan!).retired).toContain(entryKey(entry));
  expect(
    f.control.calls.filter((call) => call.path.endsWith("/close")),
  ).toHaveLength(1);
});
it("retains reserve and input after an unknown close and never blindly closes twice", async () => {
  let v = await prepare();
  const entry = v.plan!.entries[4]!;
  await action(v, "transfer", { entryKey: entryKey(entry), area: "reserve" });
  v = await reload(v);
  const inspection = await tasks().inspect(
    headers(),
    v.plan!.contextId,
    entry.taskId,
  );
  f.control.fail = "unknown";
  const op = (await action(v, "reserve-close", {
    taskId: entry.taskId,
    entryKey: entryKey(entry),
    basis: inspection.basis,
    acknowledgeDestructive: true,
  })) as { operationId: string };
  await executor().runNext();
  v = await reload(v);
  expect(agendaEntries(v.plan!, "reserve")).toHaveLength(1);
  expect(v.agendaOperations?.[0]?.status).toBe("unknown");
  f.control.fail = "";
  const calls = f.control.calls.length;
  await executor().runNext();
  expect(f.control.calls).toHaveLength(calls);
  expect(op.operationId).toBeTruthy();
});
it("uses local admission for a child and preserves its parent without extra task moves", async () => {
  let v = await prepare();
  f.state.tasks.find((t) => t.id === "agenda-5")!.parent_id = "agenda-0";
  const writes = f.control.calls.length;
  await action(v, "admit", { taskId: "agenda-5", area: "reserve" });
  await executor().runNext();
  v = await reload(v);
  expect(agendaEntries(v.plan!, "reserve")[0]?.taskId).toBe("agenda-5");
  expect(f.state.tasks.find((t) => t.id === "agenda-5")!.parent_id).toBe(
    "agenda-0",
  );
  expect(f.control.calls).toHaveLength(writes);
});
it("rejects old days, invalid contexts, waiting tasks and cross-origin mutations", async () => {
  const v = await prepare();
  f.state.tasks.find((t) => t.id === "agenda-5")!.section_id = f.sections.find(
    (s) => s.name === "Wartet",
  )!.id;
  await expect(
    action(v, "admit", { taskId: "agenda-5" }),
  ).rejects.toMatchObject({ code: "PLAN_TASK_UNAVAILABLE" });
  await expect(
    action(v, "reserve-pause", { day: "2020-01-01", paused: true }),
  ).rejects.toMatchObject({ code: "PLAN_DAY_CHANGED" });
  const foreign = headers();
  foreign.set("origin", "https://foreign.invalid");
  await expect(
    agenda().handle("reserve-pause", foreign, {
      contextId: v.plan!.contextId,
      day: v.day,
      revision: v.plan!.revision,
      key: crypto.randomUUID(),
      paused: true,
    }),
  ).rejects.toThrow();
});
it("retains database source guards and enforces unique agenda membership", async () => {
  const v = await prepare();
  await action(v, "reorder", {
    area: "main",
    order: agendaState(v.plan!).main.slice().reverse(),
  });
  await expect(
    db.pool.query("update daily_plans set entries='[]' where id=$1", [
      v.plan!.id,
    ]),
  ).rejects.toThrow();
  await expect(
    db.pool.query(
      "update daily_plans set agenda=jsonb_set(agenda,'{main}',jsonb_build_array(agenda->'main'->0,agenda->'main'->0)),revision=revision+1 where id=$1",
      [v.plan!.id],
    ),
  ).rejects.toThrow();
  await expect(
    db.pool.query(
      "update daily_plans set agenda='{}',revision=revision+1 where id=$1",
      [v.plan!.id],
    ),
  ).rejects.toThrow();
  await expect(
    db.pool.query(
      "update plan_history set revision=revision+1 where plan_id=$1",
      [v.plan!.id],
    ),
  ).rejects.toThrow();
});

it("retires only the proven recurring reserve instance and permits a conscious eligible next instance", async () => {
  let v = await prepare(6, true);
  const entry = v.plan!.entries.find((e) => e.taskId === "agenda-4")!;
  await action(v, "transfer", { entryKey: entryKey(entry), area: "reserve" });
  v = await reload(v);
  const inspection = await tasks().inspect(
    headers(),
    v.plan!.contextId,
    entry.taskId,
  );
  await action(v, "reserve-close", {
    taskId: entry.taskId,
    entryKey: entryKey(entry),
    basis: inspection.basis,
    acknowledgeDestructive: true,
  });
  await executor().runNext();
  v = await reload(v);
  expect(agendaEntries(v.plan!, "reserve")).toHaveLength(0);
  expect(
    f.control.calls.filter((call) => call.path.endsWith("/close")),
  ).toHaveLength(1);
  expect(f.state.tasks.find((t) => t.id === entry.taskId)?.section_id).toBe(
    f.sections.find((s) => s.name === "Offen")!.id,
  );
  await action(v, "admit", { taskId: entry.taskId, area: "reserve" });
  await executor().runNext();
  v = await reload(v);
  const next = agendaEntries(v.plan!, "reserve")[0]!;
  expect(entryKey(next)).not.toBe(entryKey(entry));
  expect(v.instanceAvailability?.[entryKey(next)]).toBe(true);
  expect(agendaState(v.plan!).retired).toContain(entryKey(entry));
});
it("refuses to close a later recurring instance that changed outside Helios", async () => {
  let v = await prepare(6, true);
  const entry = v.plan!.entries.find((e) => e.taskId === "agenda-4")!;
  await action(v, "transfer", { entryKey: entryKey(entry), area: "reserve" });
  v = await reload(v);
  f.state.tasks.find((t) => t.id === entry.taskId)!.due!.date = new Date()
    .toISOString()
    .slice(0, 10);
  const inspection = await tasks().inspect(
    headers(),
    v.plan!.contextId,
    entry.taskId,
  );
  const writes = f.control.calls.length;
  await expect(
    action(v, "reserve-close", {
      taskId: entry.taskId,
      entryKey: entryKey(entry),
      basis: inspection.basis,
      acknowledgeDestructive: true,
    }),
  ).rejects.toMatchObject({ code: "PLAN_INSTANCE_CHANGED" });
  expect(f.control.calls).toHaveLength(writes);
});
it("reconciles a lost close response once and removes reserve only after explicit safe resume", async () => {
  let v = await prepare();
  const entry = v.plan!.entries[4]!;
  await action(v, "transfer", { entryKey: entryKey(entry), area: "reserve" });
  v = await reload(v);
  f.control.afterWrite = () => {
    if (f.control.calls.at(-1)?.path.endsWith("/close"))
      f.control.fail = "applied";
  };
  const inspection = await tasks().inspect(
    headers(),
    v.plan!.contextId,
    entry.taskId,
  );
  const op = (await action(v, "reserve-close", {
    taskId: entry.taskId,
    entryKey: entryKey(entry),
    basis: inspection.basis,
    acknowledgeDestructive: true,
  })) as { operationId: string };
  await executor().runNext();
  v = await reload(v);
  expect(v.agendaOperations?.[0]?.status).toBe("unknown");
  expect(agendaEntries(v.plan!, "reserve")).toHaveLength(1);
  f.control.fail = "";
  f.control.afterWrite = undefined;
  await tasks().handle("resume", headers(), { operationId: op.operationId });
  await executor().runNext();
  v = await reload(v);
  expect(agendaEntries(v.plan!, "reserve")).toHaveLength(0);
  expect(
    f.control.calls.filter((call) => call.path.endsWith("/close")),
  ).toHaveLength(1);
});
it("keeps failed completion visible and permits safe recovery after a definite permission failure", async () => {
  let v = await prepare();
  const entry = v.plan!.entries[4]!;
  await action(v, "transfer", { entryKey: entryKey(entry), area: "reserve" });
  v = await reload(v);
  f.control.fail = "403";
  const inspection = await tasks().inspect(
    headers(),
    v.plan!.contextId,
    entry.taskId,
  );
  const op = (await action(v, "reserve-close", {
    taskId: entry.taskId,
    entryKey: entryKey(entry),
    basis: inspection.basis,
    acknowledgeDestructive: true,
  })) as { operationId: string };
  await executor().runNext();
  v = await reload(v);
  expect(v.agendaOperations?.[0]?.code).toBe("TODOIST_PERMISSION");
  expect(agendaEntries(v.plan!, "reserve")).toHaveLength(1);
  f.control.fail = "";
  await tasks().handle("resume", headers(), { operationId: op.operationId });
  await executor().runNext();
  expect(agendaEntries((await reload(v)).plan!, "reserve")).toHaveLength(0);
});
it("keeps order unchanged after a failed database write", async () => {
  const v = await prepare();
  const before = JSON.stringify(v.plan);
  await db.pool.query(
    "CREATE FUNCTION e5_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic write failure'; END $$; CREATE TRIGGER e5_test_failure BEFORE UPDATE ON daily_plans FOR EACH ROW EXECUTE FUNCTION e5_test_failure()",
  );
  try {
    await expect(
      action(v, "reorder", {
        area: "main",
        order: agendaState(v.plan!).main.slice().reverse(),
      }),
    ).rejects.toThrow();
  } finally {
    await db.pool.query(
      "DROP TRIGGER e5_test_failure ON daily_plans; DROP FUNCTION e5_test_failure()",
    );
  }
  expect(JSON.stringify((await reload(v)).plan)).toBe(before);
});
it("preserves per-context and per-day orders without automatically adding urgent tasks", async () => {
  let v = await prepare();
  const contextId = v.plan!.contextId;
  const day = v.day;
  const order = agendaState(v.plan!).main.slice().reverse();
  await action(v, "reorder", { area: "main", order });
  v = await reload(v);
  f.state.tasks.push({
    ...structuredClone(f.state.tasks[0]!),
    id: "new-urgent",
    priority: 4,
    deadline: { date: day },
  });
  await work.handle("tasks-refresh", headers(), { contextId });
  advance();
  expect(agendaState((await reload(v)).plan!).main).toEqual(order);
  advance(86400000);
  const login = await h.identity.handle("login", headers(""), {
    username: "synthetic_user",
    password: h.password,
  });
  h.cookie = h.absorb("", login);
  const mfa = await h.identity.handle("mfa", headers(), {
    code: generateSync({ secret: h.secret }),
  });
  expect(mfa.status ?? 200).toBe(200);
  h.cookie = h.absorb(h.cookie, mfa);
  await work.handle("tasks-refresh", headers(), { contextId });
  advance();
  let next = await plans().snapshot(headers(), contextId);
  expect(next.plan).toBeNull();
  await plans().handle("propose", headers(), {
    contextId,
    day: next.day,
    revision: 0,
  });
  next = await plans().snapshot(headers(), contextId);
  expect(next.plan!.entries[0]?.taskId).toBe("new-urgent");
  const old = await plans().snapshot(headers(), contextId, day);
  expect(agendaState(old.plan!).main).toEqual(order);
  expect(old.editable).toBe(false);
});
it("keeps skip reasons as append-only contextual observations rather than negative preferences", async () => {
  let v = await prepare();
  const entry = v.plan!.entries[4]!;
  await action(v, "transfer", { entryKey: entryKey(entry), area: "reserve" });
  v = await reload(v);
  await action(v, "reserve-skip", {
    entryKey: entryKey(entry),
    reason: "A quiet break",
  });
  const result = await db.pool.query(
    "select context_id,revision,detail from planning_observations where plan_id=$1 and event='reserve-skip'",
    [v.plan!.id],
  );
  expect(result.rows[0].context_id).toBe(v.plan!.contextId);
  expect(result.rows[0].detail).toMatchObject({
    sourceRevision: v.plan!.revision,
    reason: "A quiet break",
  });
  await expect(
    db.pool.query(
      "update planning_observations set event='dislike' where plan_id=$1",
      [v.plan!.id],
    ),
  ).rejects.toThrow();
});

it("keeps context orders and focus independent", async () => {
  let first = await prepare();
  await work.handle(
    "context-save",
    headers(),
    h.employer("Synthetic employer", projects[1]!.id),
  );
  const secondContext = (await work.snapshot(headers())).contexts.find(
    (c) => c.kind === "employer",
  )!;
  f.state.tasks.push({
    ...structuredClone(f.state.tasks[0]!),
    id: "second-context-task",
    project_id: projects[1]!.id,
    section_id: f.sections.find(
      (s) => s.project_id === projects[1]!.id && s.name === "Offen",
    )!.id,
  });
  await work.handle("tasks-refresh", headers(), {
    contextId: secondContext.id,
  });
  advance();
  let second = await plans().snapshot(headers(), secondContext.id);
  await plans().handle("propose", headers(), {
    contextId: secondContext.id,
    day: second.day,
    revision: 0,
  });
  second = await plans().snapshot(headers(), secondContext.id);
  await plans().handle("confirm", headers(), {
    contextId: secondContext.id,
    day: second.day,
    revision: second.plan!.revision,
    key: crypto.randomUUID(),
    taskIds: second.plan!.entries.map((e) => e.taskId),
  });
  await executor().runNext();
  second = await plans().snapshot(headers(), secondContext.id);
  const untouched = JSON.stringify(second.plan);
  await action(first, "reorder", {
    area: "main",
    order: agendaState(first.plan!).main.slice().reverse(),
  });
  first = await reload(first);
  await action(first, "agenda-focus", { taskId: "agenda-2" });
  expect(
    JSON.stringify((await plans().snapshot(headers(), secondContext.id)).plan),
  ).toBe(untouched);
  expect((await reload(first)).plan!.focusTaskId).toBe("agenda-2");
});
it("rejects unavailable focus and foreign task admission without any cloud mutation", async () => {
  const v = await prepare();
  f.state.tasks[0]!.checked = true;
  f.state.tasks[5]!.project_id = projects[1]!.id;
  advance();
  await work.handle("tasks-refresh", headers(), {
    contextId: v.plan!.contextId,
  });
  advance();
  const writes = f.control.calls.length;
  await expect(
    action(v, "agenda-focus", { taskId: "agenda-0" }),
  ).rejects.toMatchObject({ code: "PLAN_TASK_UNAVAILABLE" });
  await expect(
    action(v, "admit", { taskId: "agenda-5" }),
  ).rejects.toMatchObject({ code: "TASK_SCOPE_CONFLICT" });
  expect(f.control.calls).toHaveLength(writes);
  expect((await reload(v)).availability?.["agenda-0"]).toBe(false);
});

it("does not silently switch focus when transferring its card", async () => {
  const v = await prepare();
  const entry = v.plan!.entries[0]!;
  await expect(
    action(v, "transfer", { entryKey: entryKey(entry), area: "reserve" }),
  ).rejects.toMatchObject({ code: "FOCUS_TRANSFER_REQUIRED" });
  expect((await reload(v)).plan!.focusTaskId).toBe(entry.taskId);
});

it.each(["credential", "context"])(
  "rejects a %s change between fresh eligibility and final journal linking",
  async (kind) => {
    const v = await prepare();
    let taskReads = 0;
    const fetcher: typeof fetch = async (input, init) => {
      const response = await f.fetcher(input, init);
      if (
        new URL(String(input)).pathname.endsWith("/tasks") &&
        (init?.method ?? "GET") === "GET" &&
        ++taskReads === 2
      ) {
        if (kind === "context")
          await db.pool.query(
            "update contexts set revision=revision+1 where id=$1",
            [v.plan!.contextId],
          );
        else {
          const credential = crypto.randomUUID();
          await db.pool.query(
            "update integrations set credential_version=$1,revision=revision+1",
            [credential],
          );
          await db.pool.query(
            "update project_catalog set credential_version=$1",
            [credential],
          );
        }
      }
      return response;
    };
    const body = {
      contextId: v.plan!.contextId,
      day: v.day,
      revision: v.plan!.revision,
      key: crypto.randomUUID(),
      taskId: "agenda-5",
      entryKey: entryKey({ taskId: "agenda-5", source: f.state.tasks[5]! }),
      area: "main",
    };
    const service = createAgendaService(
      db,
      config,
      "Europe/Zurich",
      createTodoistReader(fetcher),
    );
    const writes = f.control.calls.length;
    await expect(
      service.handle("admit", headers(), body),
    ).rejects.toMatchObject({ code: "TASK_SCOPE_CONFLICT" });
    expect(f.control.calls).toHaveLength(writes);
    const raw = await db.pool.query(
      "select count(*) from plan_operations where kind='task'",
    );
    expect(Number(raw.rows[0].count)).toBe(0);
  },
);
