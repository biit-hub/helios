import { it, expect } from "vitest";
import {
  createTaskService,
  createPlanExecutor,
  createPlanningService,
} from "@helios/backend";
import { createTodoistReader } from "../../packages/backend/src/work/todoist";
import { createTodoistMover } from "../../packages/backend/src/planning/todoist";
import { createTaskWriter } from "../../packages/backend/src/tasks/todoist";
import { projects } from "../fixtures/todoist";
import { taskFixture } from "../fixtures/tasks";
import { createWorkHarness } from "../fixtures/integration-work";
const h = createWorkHarness(taskFixture);
const reader = () => createTodoistReader(h.f.fetcher);
const tasks = () => createTaskService(h.db, h.config, reader());
const executor = () =>
  createPlanExecutor(
    h.db,
    h.config,
    reader(),
    createTodoistMover(h.f.fetcher),
    createTaskWriter(h.f.fetcher),
  );
async function prepare() {
  const snap = await h.connect();
  const c = snap.contexts[0]!;
  await h.work.handle(
    "context-save",
    h.headers(),
    h.input(c, { projectId: projects[0]!.id }),
  );
  const template = structuredClone(h.f.state.tasks[1]!);
  h.f.state.tasks = [
    {
      ...template,
      id: "scope-root",
      parent_id: null,
      due: null,
      deadline: null,
    },
  ];
  h.advance();
  await h.work.handle("tasks-refresh", h.headers(), { contextId: c.id });
  h.advance();
  return (await h.work.snapshot(h.headers())).contexts.find(
    (x) => x.id === c.id,
  )!;
}
it.each(["removed", "moved"])(
  "separates an empty project from preserved %s projections and refuses all stale writes",
  async (kind) => {
    const c = await prepare();
    const inspection = await tasks().inspect(h.headers(), c.id, "scope-root");
    const plans = createPlanningService(h.db, h.config);
    const v = await plans.snapshot(h.headers(), c.id);
    await plans.handle("propose", h.headers(), {
      contextId: c.id,
      day: v.day,
      revision: 0,
    });
    const draft = await plans.snapshot(h.headers(), c.id);
    await plans.handle("confirm", h.headers(), {
      contextId: c.id,
      day: v.day,
      revision: draft.plan!.revision,
      key: crypto.randomUUID(),
      taskIds: ["scope-root"],
    });
    await executor().runNext();
    const history = (
      await h.db.pool.query(
        "SELECT row_to_json(h) AS row FROM plan_history h ORDER BY id",
      )
    ).rows;
    h.f.control.calls.length = 0;
    if (kind === "removed") h.f.state.tasks = [];
    else h.f.state.tasks[0]!.project_id = projects[1]!.id;
    await h.work.handle("tasks-refresh", h.headers(), { contextId: c.id });
    const list = await h.work.tasks(h.headers(), c.id);
    expect(list.stale).toBe(false);
    expect(list.tasks).toEqual([]);
    expect(list.historicalTasks).toMatchObject([
      { state: "unknown", data: { id: "scope-root" } },
    ]);
    for (const action of ["update", "move", "close", "delete"]) {
      await expect(
        tasks().handle("submit", h.headers(), {
          key: crypto.randomUUID(),
          contextId: c.id,
          taskId: "scope-root",
          basis: inspection.basis,
          action,
          fields:
            action === "update" ? { content: "Must not write" } : undefined,
          sectionId:
            action === "move" ? projects[0]!.id + ":section:1" : undefined,
          acknowledgeDestructive: true,
        }),
      ).rejects.toBeInstanceOf(Error);
    }
    expect(h.f.control.calls).toEqual([]);
    expect(
      (
        await h.db.pool.query(
          "SELECT row_to_json(h) AS row FROM plan_history h ORDER BY id",
        )
      ).rows,
    ).toEqual(history);
    expect(
      (await h.db.pool.query("SELECT count(*)::int AS n FROM task_projections"))
        .rows[0].n,
    ).toBe(1);
  },
);
it("projects a verified create without a full refresh and duplicate submission does not create twice", async () => {
  const c = await prepare();
  const body = {
    key: crypto.randomUUID(),
    action: "create",
    contextId: c.id,
    projectId: c.projectId,
    fields: { content: "Synthetic verified new task" },
  };
  const first = (await tasks().handle("submit", h.headers(), body)) as {
    operationId: string;
  };
  expect((await h.work.tasks(h.headers(), c.id)).tasks).toHaveLength(1);
  await executor().runNext();
  expect(
    (await tasks().operations(h.headers())).find(
      (o) => o.id === first.operationId,
    )?.status,
  ).toBe("succeeded");
  const second = await tasks().handle("submit", h.headers(), body);
  expect(second).toEqual(first);
  expect(
    (await h.work.tasks(h.headers(), c.id)).tasks.map((t) => t.data.content),
  ).toContain("Synthetic verified new task");
  expect(h.f.control.calls.filter((x) => x.path === "tasks")).toHaveLength(1);
});
it("never projects an unknown create as successful", async () => {
  const c = await prepare();
  h.f.control.fail = "unknown";
  const op = (await tasks().handle("submit", h.headers(), {
    key: crypto.randomUUID(),
    action: "create",
    contextId: c.id,
    projectId: c.projectId,
    fields: { content: "Uncertain synthetic task" },
  })) as { operationId: string };
  await executor().runNext();
  expect(
    (await tasks().operations(h.headers())).find((o) => o.id === op.operationId)
      ?.status,
  ).toBe("unknown");
  expect((await h.work.tasks(h.headers(), c.id)).tasks).toHaveLength(1);
});
it("only creates the previewed missing Kanban sections and leaves every task unchanged", async () => {
  const c = await prepare();
  h.f.sections.splice(
    h.f.sections.findIndex(
      (s) => s.project_id === c.projectId && s.name === "Wartet",
    ),
    1,
  );
  const preview = await tasks().kanban(h.headers(), c.id);
  expect(preview.missing).toEqual(["Wartet"]);
  const originalTasks = structuredClone(h.f.state.tasks);
  const body = {
    key: crypto.randomUUID(),
    action: "sections",
    contextId: c.id,
    sectionSetup: {
      projectId: preview.projectId,
      contextRevision: preview.contextRevision,
      missing: preview.missing,
    },
  };
  const op = (await tasks().handle("submit", h.headers(), body)) as {
    operationId: string;
  };
  await executor().runNext();
  expect(
    (await tasks().operations(h.headers())).find((o) => o.id === op.operationId)
      ?.status,
  ).toBe("succeeded");
  expect((await tasks().kanban(h.headers(), c.id)).missing).toEqual([]);
  expect(h.f.state.tasks).toEqual(originalTasks);
  expect(h.f.control.calls.map((x) => x.body?.name)).toEqual(["Wartet"]);
  expect(await tasks().handle("submit", h.headers(), body)).toEqual(op);
  expect(
    h.f.sections.filter(
      (s) => s.project_id === c.projectId && s.name === "Wartet",
    ),
  ).toHaveLength(1);
});
it("rejects a Kanban setup after its context mapping revision changed", async () => {
  const c = await prepare();
  const preview = await tasks().kanban(h.headers(), c.id);
  await h.step();
  await h.work.handle(
    "context-save",
    h.headers(),
    h.input(c, { projectId: projects[1]!.id }),
  );
  await expect(
    tasks().handle("submit", h.headers(), {
      key: crypto.randomUUID(),
      action: "sections",
      contextId: c.id,
      sectionSetup: {
        projectId: preview.projectId,
        contextRevision: preview.contextRevision,
        missing: ["Wartet"],
      },
    }),
  ).rejects.toMatchObject({ code: "TASK_SCOPE_CONFLICT" });
  expect(h.f.control.calls).toEqual([]);
});
it("refuses invented labels and preserves original labels when the catalogue fails", async () => {
  const c = await prepare();
  const source = await tasks().inspect(h.headers(), c.id, "scope-root");
  await expect(
    tasks().handle("submit", h.headers(), {
      key: crypto.randomUUID(),
      action: "update",
      contextId: c.id,
      taskId: source.task.id,
      basis: source.basis,
      fields: { labels: ["invented-label"] },
    }),
  ).rejects.toMatchObject({ code: "LABEL_NOT_AVAILABLE" });
  expect(h.f.control.calls).toEqual([]);
  expect((await tasks().labels(h.headers())).labels).toContain("Shared sample");
});
it("rejects a selected label removed after enqueue before the first write", async () => {
  const c = await prepare();
  const op = (await tasks().handle("submit", h.headers(), {
    key: crypto.randomUUID(),
    action: "create",
    contextId: c.id,
    projectId: c.projectId,
    fields: { content: "Synthetic labelled task", labels: ["Dokumentation"] },
  })) as { operationId: string };
  h.f.state.labels = h.f.state.labels.filter(
    (name) => name !== "Dokumentation",
  );
  await executor().runNext();
  const result = (await tasks().operations(h.headers())).find(
    (o) => o.id === op.operationId,
  )!;
  expect(result.status).toBe("failed");
  expect(result.code).toBe("LABEL_NOT_AVAILABLE");
  expect(result.input.fields?.labels).toEqual(["Dokumentation"]);
  expect(h.f.control.calls).toEqual([]);
});
