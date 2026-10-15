import { it, expect } from "vitest";
import {
  createEpicService,
  createTaskService,
  createPlanExecutor,
  createAiService,
  createAiWorker,
  createQueue,
  aiDrafts,
  contexts,
} from "@helios/backend";
import { eq } from "drizzle-orm";
import type { AiDraftView, AiOutput } from "@helios/contracts";
import { createTodoistReader } from "../../packages/backend/src/work/todoist";
import { createTodoistMover } from "../../packages/backend/src/planning/todoist";
import { createTaskWriter } from "../../packages/backend/src/tasks/todoist";
import { taskFixture } from "../fixtures/tasks";
import { createWorkHarness } from "../fixtures/integration-work";
import { projects } from "../fixtures/todoist";
const h = createWorkHarness(taskFixture),
  { db, config, headers, connect, advance, input } = h;
const reader = () => createTodoistReader(h.f.fetcher);
const epics = () => createEpicService(db, config, reader(), profile);
const tasks = () => createTaskService(db, config, reader());
const executor = () =>
  createPlanExecutor(
    db,
    config,
    reader(),
    createTodoistMover(h.f.fetcher),
    createTaskWriter(h.f.fetcher),
  );
const profile = {
  enabled: true,
  base: "http://127.0.0.1:11434",
  model: "synthetic-local",
  timeout: 5000,
};
const ai = () => createAiService(db, config, reader(), profile);
const boss = createQueue(config.DATABASE_URL);
const out = (extra: Partial<AiOutput> = {}): AiOutput => ({
  clarity: "clear",
  feasibility: "executable",
  missing: [],
  reason: "Synthetisch belegte Bewertung",
  nextStep: null,
  estimatedMinutes: null,
  uncertainty: "Unbekanntes bleibt unbekannt",
  patches: [],
  ...extra,
});
async function prepare(children = false) {
  await connect();
  const c = (await h.work.snapshot(headers())).contexts[0]!;
  await h.work.handle(
    "context-save",
    headers(),
    input(c, { projectId: projects[0]!.id }),
  );
  advance();
  const template = structuredClone(h.f.state.tasks[1]!);
  h.f.state.tasks = [
    {
      ...template,
      id: "epic-root",
      parent_id: null,
      labels: ["epic"],
      content: "Handbuch veröffentlichen",
      description:
        "Unverändert\n\n## Ziel\nHandbuch veröffentlichen\n\n## Checkliste\n- [ ] Quellen sammeln\n\n## Notizen\n[Dokument](https://example.com/a)",
    },
  ];
  if (children)
    h.f.state.tasks.push(
      {
        ...template,
        id: "child",
        parent_id: "epic-root",
        content: "Kapitel fertigstellen",
        description: "Kindinhalt erhalten",
        labels: [],
      },
      {
        ...template,
        id: "grandchild",
        parent_id: "child",
        content: "Quellen prüfen",
        description: "Enkelinhalt erhalten",
        labels: [],
      },
    );
  await h.work.handle("tasks-refresh", headers(), { contextId: c.id });
  advance();
  return c;
}
async function submit(contextId: string, extra: Record<string, unknown> = {}) {
  const i = await tasks().inspect(headers(), contextId, "epic-root");
  return (await tasks().handle("submit", headers(), {
    key: crypto.randomUUID(),
    action: "close",
    contextId,
    taskId: i.task.id,
    basis: i.basis,
    acknowledgeDestructive: true,
    acknowledgeHierarchy: true,
    ...extra,
  })) as { operationId: string };
}
async function op(id: string) {
  return (await tasks().operations(headers())).find((r) => r.id === id)!;
}
async function start(c: string, kind: string, original = "") {
  return (await ai().handle("start", headers(), {
    key: crypto.randomUUID(),
    kind,
    contextId: c,
    taskId: "epic-root",
    input: original,
  })) as AiDraftView;
}
async function runDraft(d: AiDraftView, output: AiOutput) {
  await createAiWorker(
    db,
    config,
    boss,
    profile,
    reader(),
    async () => output,
  ).run(d.id);
  return (await ai().list(headers(), { id: d.id })).drafts[0]!;
}
it("lists only native epic labels in the owned context and exposes multi-level hierarchy", async () => {
  const c = await prepare(true);
  expect((await epics().list(headers(), c.id)).map((r) => r.task.id)).toEqual([
    "epic-root",
  ]);
  const d = await epics().detail(headers(), c.id, "epic-root");
  expect(d.children.map((t) => t.id)).toEqual(["child", "grandchild"]);
  expect(d.goal).toBe("Handbuch veröffentlichen");
  expect(d.cache).toBeNull();
});
it("never interprets disappearance as native completion", async () => {
  const c = await prepare(true);
  h.f.state.tasks = h.f.state.tasks.filter((t) => t.id !== "grandchild");
  const d = await epics().detail(headers(), c.id, "epic-root");
  expect(d.unknownChildren.map((t) => t.id)).toContain("grandchild");
  expect(d.children.some((t) => t.id === "grandchild")).toBe(false);
});
it("proves known native completed children through individual reads", async () => {
  const c = await prepare(true);
  h.f.state.tasks.find((t) => t.id === "grandchild")!.checked = true;
  const d = await epics().detail(headers(), c.id, "epic-root");
  expect(d.children.find((t) => t.id === "grandchild")?.checked).toBe(true);
});
it("preview is read-only; explicit confirmation uses the existing journal and preserves unrelated Markdown", async () => {
  const c = await prepare();
  const change = { kind: "goal", value: "Prüfbares Handbuch liefern" };
  const p = (await epics().handle("preview", headers(), {
    contextId: c.id,
    taskId: "epic-root",
    change,
  })) as { basis: string; after: string };
  expect(h.f.control.calls).toHaveLength(0);
  const a = await submit(c.id, {
    action: "document",
    document: change,
    basis: p.basis,
  });
  await executor().runNext();
  expect((await op(a.operationId)).status).toBe("succeeded");
  expect(h.f.state.tasks[0]!.description).toBe(p.after);
  expect(p.after).toContain("## Notizen\n[Dokument](https://example.com/a)");
});
it("rejects stale preview before queueing and stale source between queue and execution", async () => {
  const c = await prepare();
  const i = await tasks().inspect(headers(), c.id, "epic-root");
  h.f.state.tasks[0]!.description += "\nExterne Notiz";
  await expect(
    submit(c.id, {
      action: "document",
      document: { kind: "goal", value: "Neu" },
      basis: i.basis,
    }),
  ).rejects.toMatchObject({ code: "TASK_SOURCE_CONFLICT" });
  const a = await submit(c.id, {
    action: "document",
    document: { kind: "goal", value: "Neu" },
  });
  h.f.state.tasks[0]!.description += "\nNoch eine Notiz";
  await executor().runNext();
  expect((await op(a.operationId)).code).toBe("TASK_SOURCE_CONFLICT");
  expect(h.f.control.calls).toHaveLength(0);
});
it("persists user corrections with revision checks and passes them to subsequent AI sources", async () => {
  const c = await prepare();
  const i = await tasks().inspect(headers(), c.id, "epic-root");
  const value = {
    contextId: c.id,
    taskId: "epic-root",
    basis: i.basis,
    revision: 0,
    value: "Das Handbuch braucht keine Abgabefrist.",
  };
  await epics().handle("correct", headers(), value);
  await expect(
    epics().handle("correct", headers(), value),
  ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  const d = await start(c.id, "epic");
  const [row] = await db.db
    .select()
    .from(aiDrafts)
    .where(eq(aiDrafts.id, d.id));
  expect(row?.source?.userCorrection).toBe(value.value);
});
it("never queues open-child Epic closure without explicit detach selection", async () => {
  const c = await prepare(true);
  await expect(submit(c.id)).rejects.toMatchObject({
    code: "EPIC_CHILDREN_POLICY",
  });
  expect(h.f.control.calls).toHaveLength(0);
});
it("detaches the open subtree preserving IDs, descriptions and multilevel parent links before closing only the Epic", async () => {
  const c = await prepare(true);
  const a = await submit(c.id, { epicClosePolicy: "detach" });
  await executor().runNext();
  expect((await op(a.operationId)).status).toBe("succeeded");
  const root = h.f.state.tasks.find((t) => t.id === "epic-root")!,
    child = h.f.state.tasks.find((t) => t.id === "child")!,
    grand = h.f.state.tasks.find((t) => t.id === "grandchild")!;
  expect(root.checked).toBe(true);
  expect(child.checked).toBe(false);
  expect(grand.checked).toBe(false);
  expect(child.parent_id).toBeNull();
  expect(grand.parent_id).toBe(child.id);
  expect(child.description).toBe("Kindinhalt erhalten");
  expect(h.f.control.calls.map((c) => c.path)).toEqual([
    "tasks/child/move",
    "tasks/epic-root/move",
    "tasks/epic-root/close",
  ]);
});
it("can manually close an Epic without open children and never auto closes through analysis", async () => {
  const c = await prepare();
  const a = await submit(c.id);
  expect(h.f.state.tasks[0]!.checked).toBe(false);
  await executor().runNext();
  expect((await op(a.operationId)).status).toBe("succeeded");
  expect(h.f.state.tasks[0]!.checked).toBe(true);
});
it("rejects repeating Epic close before any native mutation", async () => {
  const c = await prepare(true);
  h.f.state.tasks[0]!.due = {
    date: "2026-10-20",
    is_recurring: true,
    string: "every day",
  };
  await expect(
    submit(c.id, { epicClosePolicy: "detach" }),
  ).rejects.toMatchObject({ code: "EPIC_RECURRENCE_UNSAFE" });
  expect(h.f.control.calls).toHaveLength(0);
});
it("unknown detachment stops before Epic close and is never blindly replayed", async () => {
  const c = await prepare(true);
  const a = await submit(c.id, { epicClosePolicy: "detach" });
  h.f.control.fail = "unknown";
  await executor().runNext();
  expect((await op(a.operationId)).status).toBe("unknown");
  expect(h.f.state.tasks[0]!.checked).toBe(false);
  h.f.control.fail = "";
  await tasks().handle("resume", headers(), { operationId: a.operationId });
  await executor().runNext();
  expect(h.f.control.calls.map((c) => c.path)).toEqual(["tasks/child/move"]);
  expect(h.f.state.tasks[0]!.checked).toBe(false);
});
it("partial detach success followed by a new child never closes the Epic", async () => {
  const c = await prepare(true);
  const a = await submit(c.id, { epicClosePolicy: "detach" });
  h.f.control.afterWrite = () => {
    h.f.control.afterWrite = undefined;
    h.f.state.tasks.push({
      ...structuredClone(h.f.state.tasks[1]!),
      id: "new-child",
      parent_id: "epic-root",
    });
  };
  await executor().runNext();
  expect((await op(a.operationId)).status).toBe("unknown");
  expect(h.f.state.tasks[0]!.checked).toBe(false);
  expect(h.f.control.calls.every((c) => !c.path.endsWith("/close"))).toBe(true);
});
it("source conflict before first detach executes no mutation", async () => {
  const c = await prepare(true);
  const a = await submit(c.id, { epicClosePolicy: "detach" });
  h.f.state.tasks[1]!.content = "Extern geändert";
  await executor().runNext();
  expect((await op(a.operationId)).code).toBe("TASK_SOURCE_CONFLICT");
  expect(h.f.control.calls).toHaveLength(0);
});
it("SMART analysis alone never writes and selected goal uses the existing draft journal", async () => {
  const c = await prepare();
  const d = await start(c.id, "smart", "Handbuch veröffentlichen");
  const smart = ["S", "M", "A", "R", "T"].map((component) => ({
    component: component as "S" | "M" | "A" | "R" | "T",
    status: "missing" as const,
    assessment: "Noch offen",
    evidence: null,
    question: "Was ist hierzu bekannt?",
  }));
  let ready = await runDraft(
    d,
    out({
      smart,
      patches: [
        {
          kind: "goal",
          value: "Handbuch als Ergebnis veröffentlichen",
          target: null,
          evidence: "Handbuch veröffentlichen",
          reason: "Das bekannte Ergebnis konkret formulieren",
        },
      ],
    }),
  );
  expect(ready.status).toBe("ready");
  expect(h.f.control.calls).toHaveLength(0);
  ready = (await ai().handle("edit", headers(), {
    id: d.id,
    revision: ready.revision,
    patches: ready.patches.map((p) => ({
      id: p.id,
      selected: true,
      rejected: false,
      value: p.edited,
    })),
  })) as AiDraftView;
  const a = (await ai().handle("apply", headers(), {
    id: d.id,
    revision: ready.revision,
    key: crypto.randomUUID(),
    projectId: null,
    confirmProject: false,
  })) as { operationId: string };
  await executor().runNext();
  expect((await op(a.operationId)).status).toBe("succeeded");
  expect(h.f.state.tasks[0]!.description).toContain(
    "Handbuch als Ergebnis veröffentlichen",
  );
});
it("source-bound Epic understanding becomes stale after a native change or user correction", async () => {
  const c = await prepare(true);
  const d = await start(c.id, "epic");
  const ready = await runDraft(
    d,
    out({
      understanding: {
        summary: "Das Handbuch entsteht durch Kapitelarbeit.",
        contributions: [
          {
            taskId: "child",
            evidence: "Kapitel fertigstellen",
            reason: "Liefert einen Inhalt des Handbuchs",
          },
        ],
        dependencies: [],
        nextSteps: [],
      },
    }),
  );
  expect(ready.status).toBe("ready");
  expect(
    (await epics().detail(headers(), c.id, "epic-root")).cache?.fresh,
  ).toBe(true);
  h.f.state.tasks[1]!.content = "Kapitel extern korrigieren";
  expect(
    (await epics().detail(headers(), c.id, "epic-root")).cache?.fresh,
  ).toBe(false);
});
it("rejects AI contributions or dependencies to invented tasks", async () => {
  const c = await prepare(true);
  const d = await start(c.id, "epic");
  const ready = await runDraft(
    d,
    out({
      understanding: {
        summary: "Unbelegt",
        contributions: [
          {
            taskId: "foreign",
            evidence: "Kapitel fertigstellen",
            reason: "Fremde Aufgabe",
          },
        ],
        dependencies: [],
        nextSteps: [],
      },
    }),
  );
  expect(ready.status).toBe("failed");
  expect(h.f.control.calls).toHaveLength(0);
});
it("semantic decomposition discards existing child/checklist duplicate suggestions", async () => {
  const c = await prepare(true);
  const d = await start(c.id, "decomposition", "Kapitel fertigstellen");
  const ready = await runDraft(
    d,
    out({
      patches: [
        {
          kind: "subtask",
          value: "Kapitel fertigstellen",
          target: null,
          evidence: "Kapitel fertigstellen",
          reason: "Ein unabhängig planbares eigenes Kapitel-Ergebnis",
        },
        {
          kind: "check-add",
          value: "Quellen sammeln",
          target: null,
          evidence: "Quellen sammeln",
          reason: "Vorhandener kleiner Schritt",
        },
      ],
    }),
  );
  expect(ready.status).toBe("ready");
  expect(ready.patches).toHaveLength(0);
  expect(h.f.control.calls).toHaveLength(0);
});
it("denies foreign project, removed context mapping and wrong Origin", async () => {
  const c = await prepare();
  const other = h.f.state.tasks[0]!;
  other.project_id = projects[1]!.id;
  await expect(epics().detail(headers(), c.id, other.id)).rejects.toMatchObject(
    { code: "TASK_SCOPE_CONFLICT" },
  );
  other.project_id = projects[0]!.id;
  const bad = headers();
  bad.set("origin", "https://evil.example");
  await expect(
    epics().handle("preview", bad, {
      contextId: c.id,
      taskId: other.id,
      change: { kind: "goal", value: "X" },
    }),
  ).rejects.toMatchObject({ status: 403 });
  await db.db
    .update(contexts)
    .set({ projectId: null })
    .where(eq(contexts.id, c.id));
  await expect(epics().list(headers(), c.id)).rejects.toMatchObject({
    code: "CONTEXT_NOT_FOUND",
  });
});
it("preserves comments and stops after one proved detach when the next write is rejected", async () => {
  const c = await prepare(true);
  h.f.comments.push({
    id: "child-comment",
    item_id: "child",
    content: "Kommentar erhalten",
    posted_at: "2026-10-15T10:00:00Z",
    is_deleted: false,
  });
  h.f.state.tasks.push({
    ...structuredClone(h.f.state.tasks[1]!),
    id: "second-child",
    parent_id: "epic-root",
  });
  const a = await submit(c.id, { epicClosePolicy: "detach" });
  h.f.control.afterWrite = () => {
    h.f.control.afterWrite = undefined;
    h.f.control.fail = "403";
  };
  await executor().runNext();
  expect((await op(a.operationId)).status).toBe("partial");
  expect(h.f.state.tasks[0]!.checked).toBe(false);
  expect(h.f.state.tasks.find((t) => t.id === "child")!.parent_id).toBeNull();
  expect(h.f.comments.find((c) => c.id === "child-comment")?.content).toBe(
    "Kommentar erhalten",
  );
  expect(h.f.control.calls.some((c) => c.path.endsWith("/close"))).toBe(false);
});
it("changed child comments before detachment cause conflict without a write", async () => {
  const c = await prepare(true);
  const a = await submit(c.id, { epicClosePolicy: "detach" });
  h.f.comments.push({
    id: "new-comment",
    item_id: "child",
    content: "Neue externe Information",
    posted_at: "2026-10-15T10:00:00Z",
    is_deleted: false,
  });
  await executor().runNext();
  expect((await op(a.operationId)).code).toBe("TASK_SOURCE_CONFLICT");
  expect(h.f.control.calls).toHaveLength(0);
  expect(h.f.state.tasks[0]!.checked).toBe(false);
});
it("a lost successful detach response requires explicit reconciliation and is not resent", async () => {
  const c = await prepare(true);
  const a = await submit(c.id, { epicClosePolicy: "detach" });
  h.f.control.fail = "applied";
  await executor().runNext();
  expect((await op(a.operationId)).status).toBe("unknown");
  expect(h.f.state.tasks[0]!.checked).toBe(false);
  h.f.control.fail = "";
  await tasks().handle("resume", headers(), { operationId: a.operationId });
  await executor().runNext();
  expect((await op(a.operationId)).status).toBe("succeeded");
  expect(
    h.f.control.calls.filter((c) => c.path === "tasks/child/move"),
  ).toHaveLength(1);
});
it("passes an explicit Epic correction into a child analysis", async () => {
  const c = await prepare(true),
    i = await tasks().inspect(headers(), c.id, "epic-root");
  await epics().handle("correct", headers(), {
    contextId: c.id,
    taskId: "epic-root",
    basis: i.basis,
    revision: 0,
    value: "Das Kapitel braucht keine externe Freigabe.",
  });
  const d = (await ai().handle("start", headers(), {
    key: crypto.randomUUID(),
    kind: "analysis",
    contextId: c.id,
    taskId: "grandchild",
    input: "",
  })) as AiDraftView;
  const [row] = await db.db
    .select()
    .from(aiDrafts)
    .where(eq(aiDrafts.id, d.id));
  expect(row?.source?.ancestorCorrections?.[0]?.text).toBe(
    "Das Kapitel braucht keine externe Freigabe.",
  );
});
it("API checklist values roundtrip through the strict preview/confirmation contract", async () => {
  const c = await prepare(),
    d = await epics().detail(headers(), c.id, "epic-root");
  expect(Object.keys(d.checklist[0]!).sort()).toEqual(["checked", "text"]);
  const items = [
    { ...d.checklist[0]!, checked: true },
    { text: "Eigenen Punkt ergänzen", checked: false },
  ];
  const p = (await epics().handle("preview", headers(), {
    contextId: c.id,
    taskId: "epic-root",
    change: { kind: "checklist", items },
  })) as { basis: string; after: string };
  const a = await submit(c.id, {
    action: "document",
    document: { kind: "checklist", items },
    basis: p.basis,
  });
  await executor().runNext();
  expect((await op(a.operationId)).status).toBe("succeeded");
  expect(h.f.state.tasks[0]!.description).toBe(p.after);
});
it("keeps manual goal/checklist details usable when AI context exceeds its bound", async () => {
  const c = await prepare(true);
  h.f.state.tasks[1]!.description = "Synthetischer Kontext ".repeat(500);
  h.f.state.tasks[2]!.description = "Weiterer Kontext ".repeat(700);
  const d = await epics().detail(headers(), c.id, "epic-root");
  expect(d.goal).toBe("Handbuch veröffentlichen");
  expect(d.checklist[0]?.text).toBe("Quellen sammeln");
  expect(d.cache).toBeNull();
  await expect(start(c.id, "smart")).rejects.toMatchObject({
    code: "AI_SOURCE_TOO_LARGE",
  });
});
it("does not revive an older Epic assessment after the latest one is explicitly rejected", async () => {
  const c = await prepare(true);
  const understanding = {
    summary: "Synthetische Einschätzung",
    contributions: [],
    dependencies: [],
    nextSteps: [],
  };
  await runDraft(
    await start(c.id, "epic", "Erste Einschätzung"),
    out({ understanding }),
  );
  advance(1);
  const latest = await runDraft(
    await start(c.id, "epic", "Zweite Einschätzung"),
    out({ understanding }),
  );
  await ai().handle("reject", headers(), {
    id: latest.id,
    revision: latest.revision,
  });
  expect((await epics().detail(headers(), c.id, "epic-root")).cache).toBeNull();
  expect(h.f.control.calls).toHaveLength(0);
});
