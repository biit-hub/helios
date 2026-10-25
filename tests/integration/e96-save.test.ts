import { it, expect } from "vitest";
import { createTaskService, createPlanExecutor } from "@helios/backend";
import { createTodoistReader } from "../../packages/backend/src/work/todoist";
import { createTodoistMover } from "../../packages/backend/src/planning/todoist";
import { createTaskWriter } from "../../packages/backend/src/tasks/todoist";
import { createWorkHarness } from "../fixtures/integration-work";
import { taskFixture } from "../fixtures/tasks";
import { projects } from "../fixtures/todoist";
import type { TaskSavePreview } from "@helios/contracts";
const h = createWorkHarness(taskFixture);
async function prepare() {
  const f = h.f,
    work = h.work;
  await h.connect();
  const c = (await work.snapshot(h.headers())).contexts[0]!;
  await work.handle(
    "context-save",
    h.headers(),
    h.input(c, { projectId: projects[0]!.id }),
  );
  h.advance();
  f.state.tasks = [
    {
      ...structuredClone(f.state.tasks[1]!),
      id: "synthetic-e96",
      parent_id: null,
      description:
        "Originalnotiz.\n\n## Ziel\nAlt\n\n## Checkliste\n- [ ] Bestehend",
    },
  ];
  await work.handle("tasks-refresh", h.headers(), { contextId: c.id });
  h.advance();
  const service = createTaskService(
    h.db,
    h.config,
    createTodoistReader(f.fetcher),
  );
  const inspection = await service.inspect(
    h.headers(),
    c.id,
    f.state.tasks[0]!.id,
  );
  const input = {
    contextId: c.id,
    taskId: inspection.task.id,
    basis: inspection.basis,
    fields: { content: "Gemeinsam gespeichert" },
    documents: [
      { kind: "goal", value: "Neu" },
      {
        kind: "checklist",
        items: [
          { text: "Bestehend", checked: true },
          { text: "Zusätzlich", checked: false },
        ],
      },
      {
        kind: "link-add",
        label: "Dokument",
        url: "https://example.com/document",
      },
    ],
  };
  const command = { ...input, key: crypto.randomUUID(), action: "update" };
  const executor = createPlanExecutor(
    h.db,
    h.config,
    createTodoistReader(f.fetcher),
    createTodoistMover(f.fetcher),
    createTaskWriter(f.fetcher),
  );
  const result = async (id: string) =>
    (await service.operations(h.headers())).find((x) => x.id === id)!;
  return { f, c, service, input, command, executor, result, inspection };
}
it("previews without writes then persists one idempotent journal command for the whole task", async () => {
  const { f, service, input, command, executor, result, inspection } =
    await prepare();
  const preview = (await service.handle(
    "preview",
    h.headers(),
    input,
  )) as TaskSavePreview;
  expect(f.control.calls).toHaveLength(0);
  expect(await service.operations(h.headers())).toHaveLength(0);
  const op = (await service.handle("submit", h.headers(), command)) as {
    operationId: string;
  };
  expect(await service.handle("submit", h.headers(), command)).toEqual(op);
  await executor.runNext();
  expect((await result(op.operationId)).status).toBe("succeeded");
  expect(f.control.calls).toHaveLength(1);
  expect(f.control.calls[0]!.body).toEqual(preview.fields);
  expect(f.state.tasks[0]!.description).toContain("Originalnotiz.");
  expect(f.state.tasks[0]!.description).toContain("## Ziel\nNeu");
  expect(f.state.tasks[0]!.description).toContain("[x] Bestehend");
  expect(f.state.tasks[0]!.due).toEqual(inspection.task.due);
  expect(f.state.tasks[0]!.deadline).toEqual(inspection.task.deadline);
  expect(f.state.tasks[0]!.labels).toEqual(inspection.task.labels);
  expect((await result(op.operationId)).input?.documents).toEqual(
    input.documents,
  );
});
it("rejects stale source at preview, admission and execution without writing", async () => {
  const { f, service, input, command, executor, result } = await prepare();
  const op = (await service.handle("submit", h.headers(), command)) as {
    operationId: string;
  };
  f.state.tasks[0]!.description += "\nExterne Änderung";
  await expect(
    service.handle("preview", h.headers(), input),
  ).rejects.toMatchObject({ code: "TASK_SOURCE_CONFLICT" });
  await expect(
    service.handle("submit", h.headers(), {
      ...command,
      key: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "TASK_SOURCE_CONFLICT" });
  await executor.runNext();
  expect((await result(op.operationId)).code).toBe("TASK_SOURCE_CONFLICT");
  expect(f.control.calls).toHaveLength(0);
});
it("retains per-field evidence and never replays an acknowledged partial native patch", async () => {
  const { f, service, input, command, executor, result, inspection } =
    await prepare();
  const preview = (await service.handle(
    "preview",
    h.headers(),
    input,
  )) as TaskSavePreview;
  const op = (await service.handle("submit", h.headers(), command)) as {
    operationId: string;
  };
  f.control.afterWrite = () => {
    f.state.tasks[0]!.description = inspection.task.description;
  };
  await executor.runNext();
  let row = await result(op.operationId);
  expect(row.status).toBe("unknown");
  expect(row.code).toBe("TODOIST_FIELDS_UNCONFIRMED");
  expect(row.result?.verification).toMatchObject({
    matched: ["content"],
    unmatched: ["description"],
  });
  f.control.afterWrite = undefined;
  await service.handle("resume", h.headers(), { operationId: op.operationId });
  await executor.runNext();
  expect((await result(op.operationId)).status).toBe("unknown");
  expect(f.control.calls).toHaveLength(1);
  f.state.tasks[0]!.description = preview.fields.description!;
  await service.handle("resume", h.headers(), { operationId: op.operationId });
  await executor.runNext();
  row = await result(op.operationId);
  expect(row.status).toBe("succeeded");
  expect(f.control.calls).toHaveLength(1);
});
it("reconciles a lost combined-update response by reading without a second native write", async () => {
  const { f, service, command, executor, result } = await prepare();
  f.control.fail = "applied";
  const op = (await service.handle("submit", h.headers(), command)) as {
    operationId: string;
  };
  await executor.runNext();
  expect((await result(op.operationId)).status).toBe("unknown");
  f.control.fail = "";
  await service.handle("resume", h.headers(), { operationId: op.operationId });
  await executor.runNext();
  expect((await result(op.operationId)).status).toBe("succeeded");
  expect(f.control.calls).toHaveLength(1);
});
it("keeps authentication, scope and structured/raw overlap guards on previews and journal admission", async () => {
  const { f, service, input, command } = await prepare();
  await expect(
    service.handle("preview", h.headers(""), input),
  ).rejects.toThrow();
  await expect(
    service.handle("preview", h.headers(), {
      ...input,
      taskId: "foreign-task",
    }),
  ).rejects.toThrow();
  const overlap = {
    ...input,
    fields: {
      description: f.state.tasks[0]!.description.replace(
        "\nAlt",
        "\nWiderspruch",
      ),
    },
  };
  await expect(
    service.handle("preview", h.headers(), overlap),
  ).rejects.toMatchObject({ code: "TASK_SAVE_OVERLAP" });
  await expect(
    service.handle("submit", h.headers(), { ...command, ...overlap }),
  ).rejects.toMatchObject({ code: "TASK_SAVE_OVERLAP" });
  await expect(
    service.handle("submit", h.headers(), {
      ...command,
      action: "comment",
      comment: "Synthetisch",
    }),
  ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  expect(f.control.calls).toHaveLength(0);
});
