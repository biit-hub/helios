import { expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createAiJobService } from "../../packages/backend/src/ai-jobs/service";
import { aiJobs } from "../../packages/backend/src/ai-jobs/schema";
import {
  readSource,
  projectionScope,
} from "../../packages/backend/src/ai/source";
import { createTaskService } from "../../packages/backend/src/tasks/service";
import { createPlanExecutor } from "@helios/backend";
import { createTodoistReader } from "../../packages/backend/src/work/todoist";
import { createTodoistMover } from "../../packages/backend/src/planning/todoist";
import { createTaskWriter } from "../../packages/backend/src/tasks/todoist";
import { taskFixture } from "../fixtures/tasks";
import { projects } from "../fixtures/todoist";
import { createWorkHarness } from "../fixtures/integration-work";
import type {
  AiJobCreate,
  AiJobDetail,
  AiJobSettings,
} from "@helios/contracts";
const h = createWorkHarness(taskFixture);
let available = true;
const model = {
  name: "synthetic-local",
  digest: "a".repeat(64),
  size: 100,
  local: true,
  available: true,
  reason: null,
};
const reader = () => createTodoistReader(h.f.fetcher);
const service = () =>
  createAiJobService(
    h.db,
    h.config,
    async () => ({
      connected: available,
      code: available ? null : "AI_JOB_MODEL_UNAVAILABLE",
      models: available ? [model] : [],
    }),
    reader(),
  );
async function configure() {
  available = true;
  return service().handle("settings", h.headers(), {
    key: crypto.randomUUID(),
    output: "text",
    revision: 0,
    enabled: true,
    model: model.name,
  }) as Promise<AiJobSettings>;
}
const command = (patch: Partial<AiJobCreate> = {}): AiJobCreate => ({
  key: crypto.randomUUID(),
  prompt: "Vertraulicher synthetischer Auftrag",
  output: "text",
  format: null,
  origin: null,
  ...patch,
});
const create = (input = command()) =>
  service().handle("create", h.headers(), input) as Promise<AiJobDetail>;
const change = (action: string, job: AiJobDetail, key = crypto.randomUUID()) =>
  service().handle(action, h.headers(), {
    key,
    id: job.id,
    revision: job.revision,
  }) as Promise<AiJobDetail>;
const executor = () =>
  createPlanExecutor(
    h.db,
    h.config,
    reader(),
    createTodoistMover(h.f.fetcher),
    createTaskWriter(h.f.fetcher),
  );
async function origin() {
  await h.connect();
  const c = (await h.work.snapshot(h.headers())).contexts[0]!;
  await h.work.handle(
    "context-save",
    h.headers(),
    h.input(c, { projectId: projects[0]!.id }),
  );
  h.advance();
  h.f.state.tasks = [
    {
      ...structuredClone(h.f.state.tasks[1]!),
      id: "synthetic-root",
      parent_id: null,
      content: "Original unverändert",
      description: "Originalbeschreibung",
    },
  ];
  await h.work.handle("tasks-refresh", h.headers(), { contextId: c.id });
  h.advance();
  const source = await createTaskService(h.db, h.config, reader()).inspect(
    h.headers(),
    c.id,
    "synthetic-root",
  );
  return { contextId: c.id, taskId: source.task.id, basis: source.basis };
}
it("defaults disabled; settings persist with revision and no silent model fallback", async () => {
  available = true;
  expect(
    (await service().settings(h.headers())).outputs.every(
      (o) => !o.enabled && !o.available,
    ),
  ).toBe(true);
  await expect(create()).rejects.toThrow("AI_JOB_TYPE_DISABLED");
  await configure();
  available = false;
  const settings = await service().settings(h.headers());
  expect(settings.outputs[0]).toMatchObject({
    enabled: true,
    model: model.name,
    available: false,
  });
  await expect(create()).rejects.toThrow("AI_JOB_MODEL_UNAVAILABLE");
  available = true;
  await expect(configure()).rejects.toThrow("AI_JOB_CONFIG_CHANGED");
});
it("can disable an unavailable model without losing its choice, and deduplicates settings offline", async () => {
  await configure();
  available = false;
  const input = {
    key: crypto.randomUUID(),
    output: "text",
    revision: 1,
    enabled: false,
    model: model.name,
  };
  const saved = (await service().handle(
    "settings",
    h.headers(),
    input,
  )) as AiJobSettings;
  expect(saved.outputs[0]).toMatchObject({
    enabled: false,
    model: model.name,
    revision: 2,
    available: false,
  });
  expect(
    ((await service().handle("settings", h.headers(), input)) as AiJobSettings)
      .outputs[0]!.revision,
  ).toBe(2);
  await expect(
    service().handle("settings", h.headers(), { ...input, enabled: true }),
  ).rejects.toThrow("AI_JOB_CONFLICT");
});
it("creates spontaneous jobs only locally, stores original/model parameters and safely deduplicates", async () => {
  await configure();
  const input = command();
  const job = await create(input);
  expect(job).toMatchObject({
    id: input.key,
    originalPrompt: input.prompt,
    status: "queued",
    model: model.name,
    digest: model.digest,
    reference: null,
    queuePosition: 1,
  });
  expect(job.turns).toHaveLength(1);
  expect(job.events).toHaveLength(1);
  available = false;
  expect((await create(input)).id).toBe(job.id);
  await expect(create({ ...input, prompt: "Anders" })).rejects.toThrow(
    "AI_JOB_CONFLICT",
  );
  expect(h.f.control.calls).toHaveLength(0);
  expect((await h.db.db.select().from(aiJobs))[0]!.parameters).toHaveProperty(
    "num_ctx",
    8192,
  );
});
it("orders FIFO, prioritizes once in priority FIFO, and keeps stopped history", async () => {
  await configure();
  const a = await create();
  h.advance();
  const b = await create();
  h.advance();
  const c = await create();
  const bp = await change("prioritize", b);
  const cp = await change("prioritize", c);
  const repeated = await change("prioritize", bp);
  expect(repeated.revision).toBe(bp.revision);
  expect(cp.queuePosition).toBe(2);
  expect((await service().detail(h.headers(), a.id)).queuePosition).toBe(3);
  const key = crypto.randomUUID();
  const stopped = await change("stop", bp, key);
  expect(stopped.status).toBe("stopped");
  expect(stopped.queuePosition).toBeNull();
  expect((await change("stop", bp, key)).revision).toBe(stopped.revision);
  expect(stopped.events.map((e) => e.kind)).toContain("stop");
  expect((await service().detail(h.headers(), c.id)).queuePosition).toBe(1);
  await expect(change("prioritize", stopped)).rejects.toThrow(
    "AI_JOB_NOT_QUEUED",
  );
});
it("rejects stale commands and conflicting idempotency keys without losing jobs", async () => {
  await configure();
  const job = await create();
  const key = crypto.randomUUID();
  await change("prioritize", job, key);
  await expect(change("stop", job)).rejects.toThrow("AI_JOB_CONFLICT");
  await expect(change("stop", job, key)).rejects.toThrow("AI_JOB_CONFLICT");
  expect((await service().detail(h.headers(), job.id)).status).toBe("queued");
});
it("filters, pages, sorts and truncates only overview excerpts", async () => {
  await configure();
  const a = await create(command({ prompt: "A".repeat(500) }));
  h.advance();
  const b = await create();
  await change("stop", b);
  const list = await service().list(h.headers());
  expect(list.jobs.map((j) => j.id)).toEqual([b.id, a.id]);
  expect(list.jobs[1]!.prompt).toHaveLength(240);
  expect(
    (
      await service().list(h.headers(), { status: "queued", oldest: true })
    ).jobs.map((j) => j.id),
  ).toEqual([a.id]);
  expect((await service().list(h.headers(), { page: 2 })).jobs).toEqual([]);
  expect(
    (await service().detail(h.headers(), a.id)).originalPrompt,
  ).toHaveLength(500);
});
it("requires active MFA for reads and writes; an ID grants no access", async () => {
  await configure();
  const job = await create();
  await expect(service().detail(h.headers(""), job.id)).rejects.toThrow();
  await expect(
    service().handle("stop", h.headers(""), {
      key: crypto.randomUUID(),
      id: job.id,
      revision: job.revision,
    }),
  ).rejects.toThrow();
  await expect(
    service().detail(h.headers(), crypto.randomUUID()),
  ).rejects.toThrow("AI_JOB_NOT_FOUND");
  expect((await service().detail(h.headers(), job.id)).status).toBe("queued");
});
it("blocks restore mutations and rejects invalid file combinations", async () => {
  await configure();
  const blocked = createAiJobService(h.db, { ...h.config, RESTORE_MODE: true });
  await expect(
    blocked.handle("create", h.headers(), command()),
  ).rejects.toThrow("RESTORE_BLOCKED");
  await expect(
    create(command({ output: "file", format: null })),
  ).rejects.toThrow();
  expect((await service().list(h.headers())).total).toBe(0);
});
it("creates only a pure native child, leaves the parent unchanged and queues after verification", async () => {
  await configure();
  const source = await origin();
  const before = structuredClone(h.f.state.tasks[0]!);
  const input = command({ origin: source });
  const job = await create(input);
  expect(job.status).toBe("linking");
  expect(job.queuePosition).toBeNull();
  expect(await create(input)).toEqual(job);
  await executor().runNext();
  const done = await service().detail(h.headers(), job.id);
  expect(done.status).toBe("queued");
  expect(done.reference?.state).toBe("verified");
  expect(h.f.state.tasks[0]).toEqual(before);
  expect(h.f.control.calls).toHaveLength(1);
  expect(h.f.control.calls[0]!.body).toEqual({
    content: "KI Aufgabe " + job.id,
    description: "",
    labels: [],
    project_id: before.project_id,
    parent_id: before.id,
  });
  expect(JSON.stringify(h.f.control.calls)).not.toContain(input.prompt);
  expect(done.reference?.childId).toBe(h.f.state.tasks[1]!.id);
  const [operation] = await h.db.pool
    .query("SELECT payload FROM plan_operations WHERE id=$1", [
      job.reference!.operationId,
    ])
    .then((r) => r.rows);
  expect(JSON.stringify(operation)).not.toContain(input.prompt);
  await executor().runNext();
  expect(h.f.control.calls).toHaveLength(1);
});
it("stops an altered origin before any native write", async () => {
  await configure();
  const source = await origin();
  const job = await create(command({ origin: source }));
  h.f.state.tasks[0]!.description = "Extern verändert";
  await executor().runNext();
  const failed = await service().detail(h.headers(), job.id);
  expect(failed.status).toBe("error");
  expect(failed.code).toBe("AI_JOB_ORIGIN_CHANGED");
  expect(h.f.control.calls).toHaveLength(0);
});
it("never retries an unknown native create and never falsely queues it", async () => {
  await configure();
  const source = await origin();
  const job = await create(command({ origin: source }));
  h.f.control.fail = "unknown";
  await executor().runNext();
  expect(await service().detail(h.headers(), job.id)).toMatchObject({
    status: "error",
    reference: { state: "unknown", childId: null },
  });
  await executor().runNext();
  expect(h.f.control.calls).toHaveLength(1);
});
it("does not duplicate an applied child whose reply was lost, even after conscious journal resume", async () => {
  await configure();
  const source = await origin();
  const job = await create(command({ origin: source }));
  h.f.control.fail = "applied";
  await executor().runNext();
  const tasks = createTaskService(h.db, h.config, reader());
  await tasks.handle("resume", h.headers(), {
    operationId: job.reference!.operationId,
  });
  h.f.control.fail = "";
  await executor().runNext();
  expect(h.f.control.calls).toHaveLength(1);
  const current = await service().detail(h.headers(), job.id);
  expect(current).toMatchObject({
    status: "error",
    reference: { state: "unknown", childId: null },
  });
  const child = h.f.state.tasks[1]!;
  const [row] = await h.db.db
    .select()
    .from(aiJobs)
    .where(eq(aiJobs.id, job.id));
  await expect(
    readSource(
      h.db,
      h.config,
      reader(),
      row!.userId,
      source.contextId,
      child.id,
    ),
  ).rejects.toThrow("AI_JOB_REFERENCE_ONLY");
});
it("detects changed parents even after a successful child create; keeps the partial journal", async () => {
  await configure();
  const source = await origin();
  const job = await create(command({ origin: source }));
  h.f.control.afterWrite = () => {
    h.f.state.tasks[0]!.content = "Extern geändert";
  };
  await executor().runNext();
  expect(await service().detail(h.headers(), job.id)).toMatchObject({
    status: "error",
    reference: { state: "unknown" },
  });
  expect(h.f.control.calls).toHaveLength(1);
});
it("database protects original prompts and append-only history", async () => {
  await configure();
  const job = await create();
  await expect(
    h.db.db
      .update(aiJobs)
      .set({ originalPrompt: "Overwrite" })
      .where(eq(aiJobs.id, job.id)),
  ).rejects.toThrow();
  await expect(
    h.db.pool.query(
      "UPDATE ai_job_events SET kind='overwrite' WHERE job_id=$1",
      [job.id],
    ),
  ).rejects.toThrow("history is immutable");
  await expect(
    h.db.pool.query("DELETE FROM ai_job_events WHERE job_id=$1", [job.id]),
  ).rejects.toThrow("consciously");
  expect((await service().detail(h.headers(), job.id)).originalPrompt).toBe(
    job.originalPrompt,
  );
});
it("deduplicates concurrent local and delegated submissions atomically", async () => {
  await configure();
  const local = command();
  const jobs = await Promise.all([create(local), create(local)]);
  expect(jobs[0]!.id).toBe(jobs[1]!.id);
  const source = await origin();
  const delegated = command({ origin: source });
  const children = await Promise.all([create(delegated), create(delegated)]);
  expect(children[0]!.reference?.operationId).toBe(
    children[1]!.reference?.operationId,
  );
  await executor().runNext();
  expect(h.f.control.calls).toHaveLength(1);
  expect((await service().list(h.headers())).total).toBe(2);
});
it("enforces one global running claim and forbids stop/prioritize after claim", async () => {
  await configure();
  const a = await create();
  const b = await create();
  const running = {
    status: "running" as const,
    runId: crypto.randomUUID(),
    deadlineAt: new Date(Date.now() + 60000),
  };
  await h.db.db.update(aiJobs).set(running).where(eq(aiJobs.id, a.id));
  await expect(
    h.db.db
      .update(aiJobs)
      .set({ ...running, runId: crypto.randomUUID() })
      .where(eq(aiJobs.id, b.id)),
  ).rejects.toThrow();
  await expect(change("stop", a)).rejects.toThrow("AI_JOB_NOT_QUEUED");
  await expect(change("prioritize", a)).rejects.toThrow("AI_JOB_NOT_QUEUED");
  expect((await service().detail(h.headers(), b.id)).status).toBe("queued");
});
it("binds questions, attempts and artifacts to the same job and preserves result history", async () => {
  await configure();
  const a = await create();
  const b = await create();
  const attempt = crypto.randomUUID();
  const result = crypto.randomUUID();
  const question = crypto.randomUUID();
  await h.db.pool.query(
    "INSERT INTO ai_job_attempts(id,job_id,number,status,model,digest,parameters,input_hash,prompt_version,schema_version) VALUES($1,$2,1,'succeeded','synthetic',$3,'{}','hash','test','test')",
    [attempt, a.id, model.digest],
  );
  await expect(
    h.db.pool.query(
      "INSERT INTO ai_job_results(id,job_id,attempt_id,version,text) VALUES($1,$2,$3,1,'wrong')",
      [result, b.id, attempt],
    ),
  ).rejects.toThrow("Attempt scope mismatch");
  await h.db.pool.query(
    "INSERT INTO ai_job_results(id,job_id,attempt_id,version,text) VALUES($1,$2,$3,1,'synthetic preserved')",
    [result, a.id, attempt],
  );
  await h.db.pool.query(
    "INSERT INTO ai_job_turns(id,job_id,kind,text,attempt_id) VALUES($1,$2,'question','Synthetic question',$3)",
    [question, a.id, attempt],
  );
  await expect(
    h.db.pool.query(
      "INSERT INTO ai_job_turns(id,job_id,kind,text,question_id) VALUES($1,$2,'answer','wrong',$3)",
      [crypto.randomUUID(), b.id, question],
    ),
  ).rejects.toThrow("Question scope mismatch");
  await expect(
    h.db.pool.query(
      "INSERT INTO ai_job_artifacts(id,job_id,result_id,format,filename,mime,data,size,sha256) VALUES($1,$2,$3,'md','synthetic.md','text/markdown',$4,1,$5)",
      [crypto.randomUUID(), b.id, result, Buffer.from("x"), "a".repeat(64)],
    ),
  ).rejects.toThrow("Result scope mismatch");
  await expect(
    h.db.pool.query("UPDATE ai_job_results SET text='overwrite' WHERE id=$1", [
      result,
    ]),
  ).rejects.toThrow("history is immutable");
  expect((await service().detail(h.headers(), a.id)).results[0]!.text).toBe(
    "synthetic preserved",
  );
  await h.db.db.delete(aiJobs).where(eq(aiJobs.id, a.id));
  expect(
    (
      await h.db.pool.query("SELECT id FROM ai_job_results WHERE id=$1", [
        result,
      ])
    ).rowCount,
  ).toBe(0);
});
it("resolves only owned verified reference IDs and excludes them from E6 at both entry points", async () => {
  await configure();
  const source = await origin();
  const job = await create(command({ origin: source }));
  await executor().runNext();
  const verified = await service().detail(h.headers(), job.id);
  const childId = verified.reference!.childId!;
  expect(
    await service().reference(h.headers(), source.contextId, childId),
  ).toEqual({ id: job.id });
  expect(
    await service().reference(h.headers(), crypto.randomUUID(), childId),
  ).toEqual({ id: null });
  await expect(
    service().reference(h.headers(""), source.contextId, childId),
  ).rejects.toThrow();
  const [row] = await h.db.db
    .select()
    .from(aiJobs)
    .where(eq(aiJobs.id, job.id));
  await expect(
    readSource(
      h.db,
      h.config,
      reader(),
      row!.userId,
      source.contextId,
      childId,
    ),
  ).rejects.toThrow("AI_JOB_REFERENCE_ONLY");
  await expect(
    projectionScope(h.db.db, row!.userId, source.contextId, childId),
  ).rejects.toThrow("AI_JOB_REFERENCE_ONLY");
  const inspection = await createTaskService(h.db, h.config, reader()).inspect(
    h.headers(),
    source.contextId,
    childId,
  );
  await expect(
    create(
      command({
        origin: {
          contextId: source.contextId,
          taskId: childId,
          basis: inspection.basis,
        },
      }),
    ),
  ).rejects.toThrow("AI_JOB_REFERENCE_ONLY");
});
