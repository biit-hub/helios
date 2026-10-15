import type { AiGenerate } from "../../packages/backend/src/ai/ollama";
import { it, expect } from "vitest";
import { eq } from "drizzle-orm";
import {
  createAiService,
  createAiWorker,
  createPlanExecutor,
  createQueue,
  aiDrafts,
  contexts,
} from "@helios/backend";
import { createTodoistReader } from "../../packages/backend/src/work/todoist";
import { createTodoistMover } from "../../packages/backend/src/planning/todoist";
import { createTaskWriter } from "../../packages/backend/src/tasks/todoist";
import { createTaskService } from "../../packages/backend/src/tasks/service";
import { taskFixture } from "../fixtures/tasks";
import { projects } from "../fixtures/todoist";
import { createWorkHarness } from "../fixtures/integration-work";
import type { AiDraftView, AiOutput } from "@helios/contracts";
const h = createWorkHarness(taskFixture);
const { db, config, headers, connect, input, advance } = h;
const profile = {
  enabled: true,
  base: "http://127.0.0.1:11434",
  model: "synthetic-local",
  timeout: 5000,
};
const reader = () => createTodoistReader(h.f.fetcher);
const service = () => createAiService(db, config, reader(), profile);
const boss = createQueue(config.DATABASE_URL);
const out = (
  patches: AiOutput["patches"] = [],
  extra: Partial<AiOutput> = {},
): AiOutput => ({
  clarity: "clear",
  feasibility: "executable",
  missing: [],
  reason: "Synthetische Analyse",
  nextStep: null,
  estimatedMinutes: null,
  uncertainty: "Nur synthetische Schätzung",
  patches,
  ...extra,
});
const worker = (generate: AiGenerate = async () => out()) =>
  createAiWorker(db, config, boss, profile, reader(), generate);
const executor = () =>
  createPlanExecutor(
    db,
    config,
    reader(),
    createTodoistMover(h.f.fetcher),
    createTaskWriter(h.f.fetcher),
  );
async function prepare() {
  await connect();
  const c = (await h.work.snapshot(headers())).contexts[0]!;
  await h.work.handle(
    "context-save",
    headers(),
    input(c, { projectId: projects[0]!.id }),
  );
  advance();
  h.f.state.tasks = [
    {
      ...structuredClone(h.f.state.tasks[1]!),
      id: "synthetic-root",
      parent_id: null,
      content: "Präsentation erstellen",
      description:
        "Unverändert\n\n## Checkliste\n- [ ] Quellen sammeln\n- [ ] Folien schreiben\n\n## Notizen\nBehalten",
    },
  ];
  await h.work.handle("tasks-refresh", headers(), { contextId: c.id });
  advance();
  return c.id;
}
async function start(
  contextId: string | null,
  kind = "progress",
  text = "Die Quellen habe ich gesammelt.",
) {
  return (await service().handle("start", headers(), {
    key: crypto.randomUUID(),
    kind,
    contextId,
    ...(contextId ? { taskId: "synthetic-root" } : {}),
    input: text,
  })) as AiDraftView;
}
async function get(id: string) {
  return (await service().list(headers(), { id })).drafts[0]!;
}
async function selected(d: AiDraftView) {
  return (await service().handle("edit", headers(), {
    id: d.id,
    revision: d.revision,
    patches: d.patches.map((p) => ({
      id: p.id,
      selected: true,
      rejected: false,
      value: p.edited,
    })),
  })) as AiDraftView;
}
const patch = (
  kind: "comment" | "check-complete" | "check-add",
  value: string,
  target: string | null = null,
) => ({
  kind,
  value,
  target,
  evidence: "Die Quellen habe ich gesammelt.",
  reason: "Synthetisch belegter Fortschritt",
});
it("persists original text before inference and never writes merely by analysing", async () => {
  const c = await prepare();
  const d = await start(c);
  expect(d.input).toBe("Die Quellen habe ich gesammelt.");
  expect(d.status).toBe("queued");
  const w = worker(async () => out([patch("comment", "Quellen gesammelt.")]));
  await w.run(d.id);
  const ready = await get(d.id);
  expect(ready.status).toBe("ready");
  expect(ready.patches[0]?.selected).toBe(false);
  expect(h.f.control.calls).toHaveLength(0);
  expect((await service().list(headers(), { id: d.id })).drafts[0]?.input).toBe(
    d.input,
  );
});
it("edits and saves only a selected patch through E4 journal and proves its external effect", async () => {
  const c = await prepare();
  const d = await start(c);
  await worker(async () =>
    out([
      patch("comment", "Quellen gesammelt."),
      patch("check-complete", "Quellen sammeln", "Quellen sammeln"),
    ]),
  ).run(d.id);
  let ready = await get(d.id);
  ready = (await service().handle("edit", headers(), {
    id: d.id,
    revision: ready.revision,
    patches: ready.patches.map((p, i) => ({
      id: p.id,
      selected: i === 0,
      rejected: i === 1,
      value: i === 0 ? "Manuell korrigierter Fortschritt" : p.edited,
    })),
  })) as AiDraftView;
  const raw = {
    id: d.id,
    revision: ready.revision,
    key: crypto.randomUUID(),
    projectId: null,
    confirmProject: false,
  };
  const op = (await service().handle("apply", headers(), raw)) as {
    operationId: string;
  };
  expect(await service().handle("apply", headers(), raw)).toMatchObject(op);
  expect((await get(d.id)).status).toBe("applying");
  await executor().runNext();
  expect((await get(d.id)).status).toBe("applied");
  expect(
    h.f.comments.some((c) => c.content === "Manuell korrigierter Fortschritt"),
  ).toBe(true);
  expect(h.f.state.tasks[0]!.description).toContain("- [ ] Quellen sammeln");
  expect(h.f.control.calls).toHaveLength(1);
});
it("retains verified first patch and unknown second patch without duplicate comments on resume", async () => {
  const c = await prepare();
  const d = await start(c);
  await worker(async () =>
    out([
      patch("check-complete", "Quellen sammeln", "Quellen sammeln"),
      patch("comment", "Quellen gesammelt."),
    ]),
  ).run(d.id);
  let ready = await selected(await get(d.id));
  await service().handle("apply", headers(), {
    id: d.id,
    revision: ready.revision,
    key: crypto.randomUUID(),
    projectId: null,
    confirmProject: false,
  });
  await executor().runNext();
  ready = await get(d.id);
  expect(ready.patches[0]?.status).toBe("verified");
  expect(ready.status).toBe("ready");
  h.f.control.fail = "applied";
  const op = (await service().handle("apply", headers(), {
    id: d.id,
    revision: ready.revision,
    key: crypto.randomUUID(),
    projectId: null,
    confirmProject: false,
  })) as { operationId: string };
  await executor().runNext();
  const partial = await get(d.id);
  expect(partial.status).toBe("partial");
  expect(partial.input).toBe(d.input);
  const count = h.f.control.calls.length;
  h.f.control.fail = "";
  await createTaskService(db, config, reader()).handle("resume", headers(), {
    operationId: op.operationId,
  });
  await executor().runNext();
  expect(h.f.control.calls).toHaveLength(count);
  expect((await get(d.id)).patches[0]?.status).toBe("verified");
});
it("rejects source changed before apply and before inference", async () => {
  const c = await prepare();
  const d = await start(c);
  h.f.state.tasks[0]!.content = "Externe neuere Fassung";
  await worker().run(d.id);
  expect((await get(d.id)).status).toBe("stale");
  expect(h.f.control.calls).toHaveLength(0);
  const d2 = await start(c);
  await worker(async () => out([patch("comment", "Quellen gesammelt.")])).run(
    d2.id,
  );
  const ready = await selected(await get(d2.id));
  h.f.state.tasks[0]!.description += "\nNeu";
  await expect(
    service().handle("apply", headers(), {
      id: d2.id,
      revision: ready.revision,
      key: crypto.randomUUID(),
      projectId: null,
      confirmProject: false,
    }),
  ).rejects.toMatchObject({ code: "AI_SOURCE_STALE" });
});
it("checks project before enqueue and again before executing", async () => {
  const c = await prepare();
  const d = await start(c);
  h.f.state.tasks[0]!.project_id = projects[4]!.id;
  let calls = 0;
  await worker(async () => {
    calls++;
    return out();
  }).run(d.id);
  expect(calls).toBe(0);
  await expect(start(c)).rejects.toMatchObject({ code: "AI_SCOPE_DENIED" });
  expect(h.f.control.calls).toHaveLength(0);
});
it("rejects foreign task and anonymous access", async () => {
  const c = await prepare();
  await expect(
    service().handle("start", new Headers(), {
      key: crypto.randomUUID(),
      kind: "analysis",
      contextId: c,
      taskId: "synthetic-root",
      input: "",
    }),
  ).rejects.toBeDefined();
  await expect(
    service().handle("start", headers(), {
      key: crypto.randomUUID(),
      kind: "analysis",
      contextId: c,
      taskId: "unknown",
      input: "",
    }),
  ).rejects.toBeDefined();
});
it("caps invalid generation at two attempts and preserves input across explicit retry", async () => {
  const c = await prepare();
  const d = await start(c);
  let calls = 0;
  const w = worker(async () => {
    calls++;
    return out([{ ...patch("comment", "Invalid"), evidence: "invented" }]);
  });
  await w.run(d.id);
  await w.run(d.id);
  expect(calls).toBe(2);
  const failed = await get(d.id);
  expect(failed.status).toBe("failed");
  expect(failed.input).toBe(d.input);
  await service().handle("retry", headers(), {
    id: d.id,
    revision: failed.revision,
  });
  await worker().run(d.id);
  expect((await get(d.id)).status).toBe("ready");
});
it("managed background analysis excludes Inbox and respects unchanged Ist klar across status changes", async () => {
  const c = await prepare();
  const w = worker(async () =>
    out([], {
      clarity: "needs_context",
      missing: ["Was soll geklärt werden?"],
      reason: "Das gewünschte Ergebnis ist nicht bekannt.",
    }),
  );
  await w.scan();
  const drafts = (await service().list(headers(), { contextId: c })).drafts;
  expect(drafts).toHaveLength(1);
  await w.run(drafts[0]!.id);
  let d = await get(drafts[0]!.id);
  await w.syncStatus();
  await executor().runNext();
  expect(h.f.state.tasks[0]!.labels).toContain("need_context");
  d = await get(d.id);
  await service().handle("clear", headers(), {
    id: d.id,
    revision: d.revision,
  });
  await w.syncStatus();
  await executor().runNext();
  expect(h.f.state.tasks[0]!.labels).not.toContain("need_context");
  const before = (await service().list(headers(), { contextId: c })).drafts
    .length;
  h.f.state.tasks[0]!.updated_at = new Date().toISOString();
  await w.scan();
  expect(
    (await service().list(headers(), { contextId: c })).drafts,
  ).toHaveLength(before);
  expect((await get(d.id)).confirmedClear).toBe(true);
});
it("creates reviewed capture in native Inbox without any confirmed project", async () => {
  await prepare();
  const d = await start(null, "capture", "Präsentation vorbereiten");
  await worker(async () =>
    out([
      {
        kind: "title",
        value: "Präsentation vorbereiten",
        target: null,
        evidence: "Präsentation vorbereiten",
        reason: "Belegter Titel",
      },
    ]),
  ).run(d.id);
  const ready = await selected(await get(d.id));
  await service().handle("apply", headers(), {
    id: d.id,
    revision: ready.revision,
    key: crypto.randomUUID(),
    projectId: projects[0]!.id,
    confirmProject: false,
  });
  await executor().runNext();
  expect(h.f.state.tasks.at(-1)?.project_id).toBe(projects[4]!.id);
  expect((await get(d.id)).status).toBe("applied");
});
it("prevents parallel inference across workers and rejects context changed during inference", async () => {
  const c = await prepare();
  const a = await start(c),
    b = await start(c);
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const wait = new Promise<void>((r) => {
    release = r;
  });
  const first = worker(async () => {
    entered();
    await wait;
    return out();
  }).run(a.id);
  await started;
  expect(await worker().run(b.id)).toBe(false);
  await db.db.update(contexts).set({ revision: 10 }).where(eq(contexts.id, c));
  release();
  await first;
  expect((await get(a.id)).status).toBe("stale");
});
it("cleans only terminal drafts older than 30 days", async () => {
  const c = await prepare();
  const d = await start(c);
  const queued = await start(c);
  await db.db
    .update(aiDrafts)
    .set({
      status: "rejected",
      finishedAt: new Date(Date.now() - 31 * 86400000),
    })
    .where(eq(aiDrafts.id, d.id));
  await worker().cleanup();
  expect((await service().list(headers(), { id: d.id })).drafts).toHaveLength(
    0,
  );
  expect((await get(queued.id)).status).toBe("queued");
});

it("rejects context and credential races before committing a new analysis job", async () => {
  const c = await prepare();
  const r = reader();
  const guarded = {
    ...r,
    comments: async (...args: Parameters<typeof r.comments>) => {
      const comments = await r.comments(...args);
      await db.db
        .update(contexts)
        .set({ revision: 20 })
        .where(eq(contexts.id, c));
      return comments;
    },
  };
  const ai = createAiService(db, config, guarded, profile);
  await expect(
    ai.handle("start", headers(), {
      key: crypto.randomUUID(),
      kind: "analysis",
      contextId: c,
      taskId: "synthetic-root",
      input: "",
    }),
  ).rejects.toMatchObject({ code: "AI_SOURCE_STALE" });
  expect(
    (await service().list(headers(), { contextId: c })).drafts,
  ).toHaveLength(0);
});
it("rejects revoked sessions before sending task data to inference", async () => {
  const c = await prepare();
  const d = await start(c);
  let calls = 0;
  await h.identity.handle("logout", headers(), {});
  await worker(async () => {
    calls++;
    return out();
  }).run(d.id);
  expect(calls).toBe(0);
  const [row] = await db.db
    .select()
    .from(aiDrafts)
    .where(eq(aiDrafts.id, d.id));
  expect(row?.status).toBe("failed");
  expect(row?.output).toBeNull();
});
it("does not persist generated results after logout during inference", async () => {
  const c = await prepare();
  const d = await start(c);
  await worker(async () => {
    await h.identity.handle("logout", headers(), {});
    return out([patch("comment", "Quellen gesammelt.")]);
  }).run(d.id);
  const [row] = await db.db
    .select()
    .from(aiDrafts)
    .where(eq(aiDrafts.id, d.id));
  expect(row?.status).toBe("failed");
  expect(row?.output).toBeNull();
  expect(row?.input).toBe(d.input);
});
it("aborts a running local call after explicit cancellation and retains input", async () => {
  const c = await prepare();
  const d = await start(c);
  let entered!: () => void;
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const w = createAiWorker(
    db,
    config,
    boss,
    profile,
    reader(),
    async (_kind, _data, signal) => {
      entered();
      return new Promise((_resolve, reject) =>
        signal!.addEventListener(
          "abort",
          () => reject(new Error("synthetic abort")),
          { once: true },
        ),
      );
    },
  );
  const running = w.run(d.id);
  await started;
  const current = await get(d.id);
  await service().handle("cancel", headers(), {
    id: d.id,
    revision: current.revision,
  });
  await running;
  expect((await get(d.id)).status).toBe("cancelled");
  expect((await get(d.id)).input).toBe(d.input);
});
it("resumes one interrupted read-only inference from persisted attempt state", async () => {
  const c = await prepare();
  const d = await start(c);
  await db.db
    .update(aiDrafts)
    .set({ status: "running", claim: crypto.randomUUID(), attempts: 1 })
    .where(eq(aiDrafts.id, d.id));
  let calls = 0;
  await worker(async () => {
    calls++;
    return out();
  }).run(d.id);
  expect(calls).toBe(1);
  expect((await get(d.id)).status).toBe("ready");
});
it("keeps manual capture fields above model values and does not duplicate description", async () => {
  await prepare();
  const d = (await service().handle("start", headers(), {
    key: crypto.randomUUID(),
    kind: "capture",
    contextId: null,
    input: "Präsentation vorbereiten. Kontext behalten.",
    manualFields: {
      content: "Manueller Titel",
      description: "Manueller Kontext",
      priority: 3,
    },
  })) as AiDraftView;
  await worker(async () =>
    out([
      {
        kind: "title",
        value: "Präsentation vorbereiten",
        target: null,
        evidence: "Präsentation vorbereiten",
        reason: "Titel aus Eingabe",
      },
      {
        kind: "description-append",
        value: "Kontext behalten.",
        target: null,
        evidence: "Kontext behalten.",
        reason: "Beschreibung aus Eingabe",
      },
    ]),
  ).run(d.id);
  const ready = await get(d.id);
  expect(ready.patches.map((p) => p.edited)).toEqual([
    "Manueller Titel",
    "Manueller Kontext",
  ]);
  expect(ready.patches.every((p) => p.selected)).toBe(true);
  await service().handle("apply", headers(), {
    id: d.id,
    revision: ready.revision,
    key: crypto.randomUUID(),
    projectId: null,
    confirmProject: false,
  });
  await executor().runNext();
  expect(h.f.state.tasks.at(-1)?.content).toBe("Manueller Titel");
  expect(h.f.state.tasks.at(-1)?.description).toBe("Manueller Kontext");
  expect(h.f.state.tasks.at(-1)?.priority).toBe(3);
});
it("allows an explicitly edited existing checkbox target but preserves all other Markdown", async () => {
  const c = await prepare();
  const d = await start(c);
  await worker(async () =>
    out([patch("check-complete", "Quellen sammeln", "Quellen sammeln")]),
  ).run(d.id);
  const ready = await get(d.id);
  const edited = (await service().handle("edit", headers(), {
    id: d.id,
    revision: ready.revision,
    patches: ready.patches.map((p) => ({
      id: p.id,
      selected: true,
      rejected: false,
      value: "Folien schreiben",
      target: "Folien schreiben",
    })),
  })) as AiDraftView;
  expect(edited.patches[0]?.target).toBe("Folien schreiben");
  await service().handle("apply", headers(), {
    id: d.id,
    revision: edited.revision,
    key: crypto.randomUUID(),
    projectId: null,
    confirmProject: false,
  });
  await executor().runNext();
  expect(h.f.state.tasks[0]!.description).toContain(
    "- [ ] Quellen sammeln\n- [x] Folien schreiben\n\n## Notizen\nBehalten",
  );
});
it("rechecks current comments immediately before an approved E4 write", async () => {
  const c = await prepare();
  const d = await start(c);
  await worker(async () => out([patch("comment", "Quellen gesammelt.")])).run(
    d.id,
  );
  const ready = await selected(await get(d.id));
  await service().handle("apply", headers(), {
    id: d.id,
    revision: ready.revision,
    key: crypto.randomUUID(),
    projectId: null,
    confirmProject: false,
  });
  h.f.comments.push({
    id: "new-external",
    item_id: "synthetic-root",
    content: "Neue wichtige Information",
    posted_at: null as unknown as string,
    is_deleted: false,
  });
  await executor().runNext();
  expect(h.f.control.calls).toHaveLength(0);
  expect((await get(d.id)).status).toBe("partial");
});
it("starts a targeted follow-up analysis after verified progress but never analyses native Inbox capture", async () => {
  const c = await prepare();
  const d = await start(c);
  await worker(async () => out([patch("comment", "Quellen gesammelt.")])).run(
    d.id,
  );
  const ready = await selected(await get(d.id));
  await service().handle("apply", headers(), {
    id: d.id,
    revision: ready.revision,
    key: crypto.randomUUID(),
    projectId: null,
    confirmProject: false,
  });
  await executor().runNext();
  expect(
    (await service().list(headers(), { contextId: c })).drafts.some(
      (x) => x.kind === "analysis" && x.status === "queued",
    ),
  ).toBe(true);
});
it("fails conservatively if context mapping becomes Inbox before status write", async () => {
  const c = await prepare();
  const w = worker(async () =>
    out([], {
      clarity: "needs_context",
      missing: ["Welches Ergebnis?"],
      reason: "Das konkrete Ergebnis ist nicht bekannt.",
    }),
  );
  await w.scan();
  const d = (await service().list(headers(), { contextId: c })).drafts[0]!;
  await w.run(d.id);
  await w.syncStatus();
  await db.db
    .update(contexts)
    .set({ projectId: projects[4]!.id, revision: 30 })
    .where(eq(contexts.id, c));
  await executor().runNext();
  expect(h.f.control.calls).toHaveLength(0);
  expect(h.f.state.tasks[0]!.labels).not.toContain("need_context");
});
it("uses pg-boss priority and an atomic ID-only outbox without duplicate queued jobs", async () => {
  const c = await prepare();
  const a = await start(c),
    b = await start(c, "analysis", "");
  const { prepareQueue } = await import("@helios/backend");
  const { AI_QUEUE } = await import("../../packages/backend/src/ai/worker");
  await prepareQueue(boss);
  try {
    await boss.createQueue(AI_QUEUE);
    const w = worker();
    await w.dispatch();
    const [da] = await db.db
      .select()
      .from(aiDrafts)
      .where(eq(aiDrafts.id, a.id));
    const [dbb] = await db.db
      .select()
      .from(aiDrafts)
      .where(eq(aiDrafts.id, b.id));
    const ja = await boss.getJobById(AI_QUEUE, da!.jobId!);
    const jb = await boss.getJobById(AI_QUEUE, dbb!.jobId!);
    expect(ja?.data).toEqual({ draftId: a.id });
    expect(ja?.priority).toBe(20);
    expect(jb?.priority).toBe(10);
    await w.dispatch();
    const [same] = await db.db
      .select()
      .from(aiDrafts)
      .where(eq(aiDrafts.id, a.id));
    expect(same?.jobId).toBe(da?.jobId);
  } finally {
    await boss.stop({ graceful: true });
  }
});

it("resumes a cancelled edited draft without overwriting saved user values or re-running the model", async () => {
  const c = await prepare();
  const d = await start(c);
  await worker(async () => out([patch("comment", "Modellvorschlag")])).run(
    d.id,
  );
  let ready = await get(d.id);
  ready = (await service().handle("edit", headers(), {
    id: d.id,
    revision: ready.revision,
    patches: ready.patches.map((p) => ({
      id: p.id,
      selected: true,
      rejected: false,
      value: "Gespeicherte Benutzerfassung",
    })),
  })) as AiDraftView;
  const cancelled = (await service().handle("cancel", headers(), {
    id: d.id,
    revision: ready.revision,
  })) as AiDraftView;
  const resumed = (await service().handle("retry", headers(), {
    id: d.id,
    revision: cancelled.revision,
  })) as AiDraftView;
  expect(resumed.status).toBe("ready");
  expect(resumed.patches[0]?.edited).toBe("Gespeicherte Benutzerfassung");
  let calls = 0;
  await worker(async () => {
    calls++;
    return out();
  }).run(d.id);
  expect(calls).toBe(0);
});
it("creates only an explicitly confirmed independent subtask and preserves native parent/category", async () => {
  const c = await prepare();
  h.f.state.tasks[0]!.labels = ["epic", "fun"];
  const d = await start(
    c,
    "progress",
    "Separat planbares Ergebnis: Netzdiagramm erstellen.",
  );
  await worker(async () =>
    out([
      {
        kind: "subtask",
        value: "Netzdiagramm erstellen",
        target: null,
        evidence: "Netzdiagramm erstellen",
        reason:
          "Eigenständig planbares Ergebnis mit eigener überprüfbarer Lieferung.",
      },
    ]),
  ).run(d.id);
  const ready = await selected(await get(d.id));
  await service().handle("apply", headers(), {
    id: d.id,
    revision: ready.revision,
    key: crypto.randomUUID(),
    projectId: null,
    confirmProject: false,
  });
  await executor().runNext();
  expect((await get(d.id)).status).toBe("applied");
  expect(h.f.state.tasks.at(-1)?.parent_id).toBe("synthetic-root");
  expect(h.f.state.tasks.at(-1)?.labels).toEqual(["fun"]);
  expect(h.f.state.tasks[0]?.parent_id).toBeNull();
  expect(
    (await h.work.tasks(headers(), c)).tasks.find(
      (t) => t.data.id === "synthetic-root",
    )?.state,
  ).toBe("active");
});
it("includes only same-project Epic ancestry and invalidates changed ancestor goals", async () => {
  const c = await prepare();
  const base = structuredClone(h.f.state.tasks[0]!);
  h.f.state.tasks.push(
    {
      ...base,
      id: "synthetic-parent",
      parent_id: "synthetic-epic",
      content: "Zwischenaufgabe",
    },
    {
      ...base,
      id: "synthetic-epic",
      parent_id: null,
      content: "Synthetisches Vorhaben",
      labels: ["epic"],
      description: "## Ziel\nUrsprüngliches Ziel",
    },
  );
  h.f.state.tasks[0]!.parent_id = "synthetic-parent";
  const d = await start(c);
  let got = "";
  await worker(async (_kind, data) => {
    got = JSON.stringify(data);
    h.f.state.tasks.find((t) => t.id === "synthetic-epic")!.description =
      "## Ziel\nNeueres Ziel";
    return out();
  }).run(d.id);
  expect(got).toContain("Ursprüngliches Ziel");
  expect(got).not.toContain("Bearer");
  expect((await get(d.id)).status).toBe("stale");
});

it("rejects model profile changes before inference and retains the original input", async () => {
  const c = await prepare();
  const d = await start(c);
  let calls = 0;
  await createAiWorker(
    db,
    config,
    boss,
    { ...profile, model: "other-synthetic" },
    reader(),
    async () => {
      calls++;
      return out();
    },
  ).run(d.id);
  expect(calls).toBe(0);
  expect((await get(d.id)).code).toBe("AI_PROFILE_CHANGED");
  expect((await get(d.id)).input).toBe(d.input);
});

it("scans unequal employers independently without starving the larger project", async () => {
  const c = await prepare();
  await h.work.handle(
    "context-save",
    headers(),
    h.employer("Synthetischer Arbeitgeber", projects[1]!.id),
  );
  const other = (await h.work.snapshot(headers())).contexts.find(
    (x) => x.projectId === projects[1]!.id,
  )!;
  const base = structuredClone(h.f.state.tasks[0]!);
  h.f.state.tasks = [
    ...Array.from({ length: 25 }, (_, i) => ({
      ...base,
      id: "private-cursor-" + i,
      parent_id: null,
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      ...base,
      id: "employer-cursor-" + i,
      project_id: projects[1]!.id,
      parent_id: null,
    })),
  ];
  const w = worker();
  for (let i = 0; i < 6; i++) await w.scan();
  expect(
    (await service().list(headers(), { contextId: c })).drafts.filter(
      (d) => d.kind === "analysis",
    ),
  ).toHaveLength(25);
  expect(
    (await service().list(headers(), { contextId: other.id })).drafts.filter(
      (d) => d.kind === "analysis",
    ),
  ).toHaveLength(2);
  expect(h.f.control.calls).toHaveLength(0);
});

it("allows correction only after a proven no-effect failure and never reopens unknown writes", async () => {
  const c = await prepare();
  const d = await start(c);
  await worker(async () => out([patch("comment", "Quellen gesammelt.")])).run(
    d.id,
  );
  let ready = await selected(await get(d.id));
  await service().handle("apply", headers(), {
    id: d.id,
    revision: ready.revision,
    key: crypto.randomUUID(),
    projectId: null,
    confirmProject: false,
  });
  h.f.control.fail = "403";
  await executor().runNext();
  const failed = await get(d.id);
  expect(failed.status).toBe("partial");
  ready = (await service().handle("reopen", headers(), {
    id: d.id,
    revision: failed.revision,
  })) as AiDraftView;
  expect(ready.status).toBe("ready");
  expect(ready.patches[0]?.edited).toBe("Quellen gesammelt.");
  h.f.control.fail = "applied";
  await service().handle("apply", headers(), {
    id: d.id,
    revision: ready.revision,
    key: crypto.randomUUID(),
    projectId: null,
    confirmProject: false,
  });
  await executor().runNext();
  const unknown = await get(d.id);
  await expect(
    service().handle("reopen", headers(), {
      id: d.id,
      revision: unknown.revision,
    }),
  ).rejects.toMatchObject({ code: "AI_OUTCOME_UNRESOLVED" });
});
it("omits an explicitly rejected manually prefilled estimate from native capture", async () => {
  await prepare();
  const d = (await service().handle("start", headers(), {
    key: crypto.randomUUID(),
    kind: "capture",
    contextId: null,
    input: "Präsentation vorbereiten, 120 Minuten",
    manualFields: { content: "Manueller Titel", duration: 45 },
  })) as AiDraftView;
  await worker(async () =>
    out([
      {
        kind: "title",
        value: "Präsentation vorbereiten",
        target: null,
        evidence: "Präsentation vorbereiten",
        reason: "Belegter Titel",
      },
      {
        kind: "remaining",
        value: "120",
        target: null,
        evidence: "120 Minuten",
        reason: "Expliziter Aufwand",
      },
    ]),
  ).run(d.id);
  const ready = await get(d.id);
  const edited = (await service().handle("edit", headers(), {
    id: d.id,
    revision: ready.revision,
    patches: ready.patches.map((p) => ({
      id: p.id,
      selected: p.kind === "title",
      rejected: p.kind === "remaining",
      value: p.edited,
    })),
  })) as AiDraftView;
  await service().handle("apply", headers(), {
    id: d.id,
    revision: edited.revision,
    key: crypto.randomUUID(),
    projectId: null,
    confirmProject: false,
  });
  await executor().runNext();
  expect(h.f.control.calls.at(-1)?.body).not.toHaveProperty("duration");
  expect((await get(d.id)).status).toBe("applied");
});

it("central journal rejects a command that differs from the selected reviewed patch", async () => {
  const c = await prepare();
  const d = await start(c);
  await worker(async () => out([patch("comment", "Quellen gesammelt.")])).run(
    d.id,
  );
  const ready = await selected(await get(d.id));
  const [stored] = await db.db
    .select()
    .from(aiDrafts)
    .where(eq(aiDrafts.id, d.id));
  const inspection = await createTaskService(db, config, reader()).inspect(
    headers(),
    c,
    "synthetic-root",
  );
  const command = {
    key: crypto.randomUUID(),
    action: "update" as const,
    contextId: c,
    taskId: "synthetic-root",
    basis: inspection.basis,
    fields: { content: "Nicht bestätigter anderer Inhalt" },
    acknowledgeHierarchy: false,
    acknowledgeDestructive: false,
    acknowledgeRecurrenceChange: false,
  };
  const { fingerprint } = await import("../../packages/backend/src/tasks/hash");
  await expect(
    createTaskService(db, config, reader()).enqueueDraft(headers(), command, {
      id: d.id,
      revision: ready.revision,
      patchId: ready.patches[0]!.id,
      sourceFingerprint: ready.sourceFingerprint,
      commandHash: fingerprint(command),
      credentialVersion: stored!.credentialVersion!,
      contextRevision: stored!.contextRevision,
    }),
  ).rejects.toMatchObject({ code: "AI_DRAFT_CONFLICT" });
  expect(h.f.control.calls).toHaveLength(0);
  expect((await get(d.id)).status).toBe("ready");
});
