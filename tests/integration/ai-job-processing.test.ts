import { createTaskService } from "../../packages/backend/src/tasks/service";
import { createPlanExecutor } from "@helios/backend";
import { createTodoistMover } from "../../packages/backend/src/planning/todoist";
import { createTaskWriter } from "../../packages/backend/src/tasks/todoist";
import { projects } from "../fixtures/todoist";
import { it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
type PgBoss = Parameters<typeof createAiJobWorker>[2];
import type { AiJobDetail, AiJobSettings } from "@helios/contracts";
import { createAiJobService } from "../../packages/backend/src/ai-jobs/service";
import { createAiJobWorker } from "../../packages/backend/src/ai-jobs/worker";
import {
  aiJobs,
  aiJobArtifacts,
  aiJobAttempts,
} from "../../packages/backend/src/ai-jobs/schema";
import type { JobGenerate } from "../../packages/backend/src/ai-jobs/generation";
import { createWorkHarness } from "../fixtures/integration-work";
import { taskFixture } from "../fixtures/tasks";
import { createTodoistReader } from "../../packages/backend/src/work/todoist";
const h = createWorkHarness(taskFixture);
const model = {
  name: "synthetic-local",
  digest: "a".repeat(64),
  size: 100,
  local: true,
  available: true,
  reason: null,
};
const service = () =>
  createAiJobService(
    h.db,
    h.config,
    async () => ({ connected: true, code: null, models: [model] }),
    createTodoistReader(h.f.fetcher),
  );
async function create(
  output: "text" | "file" | "research" = "text",
  format: "md" | null = null,
  origin: { contextId: string; taskId: string; basis: string } | null = null,
) {
  const settings = await service().settings(h.headers());
  const row = settings.outputs.find((r) => r.output === output)!;
  (await service().handle("settings", h.headers(), {
    key: crypto.randomUUID(),
    output,
    revision: row.revision,
    enabled: true,
    model: model.name,
  })) as AiJobSettings;
  return service().handle("create", h.headers(), {
    key: crypto.randomUUID(),
    prompt: "Synthetischer lokaler Prüfauftrag",
    output,
    format,
    origin,
  }) as Promise<AiJobDetail>;
}
const result: JobGenerate = async () => ({
  answer: {
    kind: "result",
    text: "Geprüftes synthetisches Ergebnis",
    document: null,
    uncertainties: [],
  },
  raw: '{"synthetic":true}',
  metrics: { eval_count: 3 },
});
const worker = (generate: JobGenerate = result) =>
  createAiJobWorker(
    h.db,
    { ...h.config, WORKER_ENABLED: true },
    {} as PgBoss,
    generate,
  );
const detail = (id: string) => service().detail(h.headers(), id);
const command = (
  job: AiJobDetail,
  more: { text?: string; questionId?: string } = {},
) => ({
  key: crypto.randomUUID(),
  id: job.id,
  revision: job.revision,
  ...more,
});
it("processes durable FIFO jobs one at a time and never closes ready results or writes to Todoist", async () => {
  const a = await create(),
    b = await create();
  expect(await worker().runNext()).toBe(true);
  expect((await detail(a.id)).status).toBe("ready");
  expect((await detail(b.id)).status).toBe("queued");
  await worker().runNext();
  expect((await detail(b.id)).results).toHaveLength(1);
  expect(await worker().runNext()).toBe(false);
  expect(h.f.control.calls).toHaveLength(0);
});
it("uses the shared GPU lock across workers and keeps a second job queued", async () => {
  const a = await create(),
    b = await create();
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = worker(async (input, signal) => {
    started();
    await held;
    return result(input, signal);
  }).runNext();
  await entered;
  expect(await worker().runNext()).toBe(false);
  expect((await detail(a.id)).status).toBe("running");
  expect((await detail(b.id)).status).toBe("queued");
  release();
  await first;
});
it("pauses for multiple questions, releases the slot, answers idempotently and automatically requeues the same ID", async () => {
  const a = await create(),
    b = await create();
  const ask = worker(async () => ({
    answer: { kind: "question", text: "Welche Zielgruppe?" },
    raw: "{}",
    metrics: {},
  }));
  await ask.runNext();
  let job = await detail(a.id);
  expect(job.status).toBe("awaiting_input");
  await worker().runNext();
  expect((await detail(b.id)).status).toBe("ready");
  const input = command(job, {
    questionId: job.turns.at(-1)!.id,
    text: "Synthetische Zielgruppe",
  });
  await service().handle("answer", h.headers(), input);
  await service().handle("answer", h.headers(), input);
  expect(
    (await detail(a.id)).turns.filter((t) => t.kind === "answer"),
  ).toHaveLength(1);
  await ask.runNext();
  job = await detail(a.id);
  expect(job.status).toBe("awaiting_input");
  await expect(
    service().handle("answer", h.headers(), {
      ...input,
      key: crypto.randomUUID(),
      revision: job.revision,
    }),
  ).rejects.toThrow("AI_JOB_CONFLICT");
  await service().handle(
    "answer",
    h.headers(),
    command(job, { questionId: job.turns.at(-1)!.id, text: "Zweite Antwort" }),
  );
  await worker().runNext();
  expect((await detail(a.id)).status).toBe("ready");
});
it("keeps original prompt, turns and immutable result versions on refinement; resets queue priority", async () => {
  let job = await create();
  await service().handle("prioritize", h.headers(), command(job));
  await worker().runNext();
  job = await detail(job.id);
  const input = command(job, { text: "Bitte kürzer formulieren" });
  await service().handle("refine", h.headers(), input);
  await service().handle("refine", h.headers(), input);
  expect((await detail(job.id)).prioritized).toBe(false);
  await worker().runNext();
  const next = await detail(job.id);
  expect(next.results.map((r) => r.version)).toEqual([1, 2]);
  expect(next.originalPrompt).toBe(job.originalPrompt);
  expect(next.turns.at(-1)!.text).toBe(input.text);
  await expect(
    h.db.pool.query(
      "update ai_job_results set text='changed' where job_id=$1",
      [job.id],
    ),
  ).rejects.toThrow("immutable");
});
it("continues accepted local work after browser session expiry without granting native write authority", async () => {
  const job = await create();
  h.advance(31 * 60000);
  await worker().runNext();
  const [stored] = await h.db.db
    .select()
    .from(aiJobs)
    .where(eq(aiJobs.id, job.id));
  expect(stored!.status).toBe("ready");
  await expect(detail(job.id)).rejects.toThrow();
  expect(h.f.control.calls).toHaveLength(0);
});
it("requires active MFA account for local background work and does not run during restore", async () => {
  const job = await create();
  const disabled = createAiJobWorker(
    h.db,
    { ...h.config, RESTORE_MODE: true },
    {} as PgBoss,
    result,
  );
  expect(await disabled.runNext()).toBe(false);
  await h.db.pool.query("update auth_identity_state set status='recovery'");
  expect(await worker().runNext()).toBe(false);
  expect(
    (await h.db.db.select().from(aiJobs).where(eq(aiJobs.id, job.id)))[0]!
      .status,
  ).toBe("queued");
});
it("persists a safe failure, requires conscious retry and never retries automatically", async () => {
  let job = await create();
  const calls = vi.fn(async () => {
    throw new Error("private diagnostic must not escape");
  });
  await worker(calls).runNext();
  await worker(calls).runNext();
  job = await detail(job.id);
  expect(job.status).toBe("error");
  expect(calls).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(job)).not.toContain("private diagnostic");
  await service().handle("retry", h.headers(), command(job));
  await worker().runNext();
  job = await detail(job.id);
  expect(job.attempts).toHaveLength(2);
  expect(job.status).toBe("ready");
});
it("fences interrupted inference until deadline, then fails without automatic replay; late callback cannot publish", async () => {
  let job = await create();
  await worker(async () => {
    throw new DOMException("timeout", "TimeoutError");
  }).runNext();
  job = await detail(job.id);
  expect(job.status).toBe("running");
  expect(await worker().runNext()).toBe(false);
  h.advance(300000);
  await worker().runNext();
  expect((await detail(job.id)).code).toBe("AI_JOB_INTERRUPTED");
  expect((await detail(job.id)).results).toHaveLength(0);
});
it("stores exactly one protected file with bytes/hash and keeps prior file versions", async () => {
  let job = await create("file", "md");
  const file: JobGenerate = async () => ({
    answer: {
      kind: "result",
      text: "Datei bereit",
      uncertainties: [],
      document: {
        title: "Synthetisch",
        paragraphs: ["Änderung ohne aktive Inhalte"],
        columns: [],
        rows: [],
      },
    },
    raw: "{}",
    metrics: {},
  });
  await worker(file).runNext();
  job = await detail(job.id);
  expect(job.results[0]!.artifact).toMatchObject({
    format: "md",
    mime: "text/markdown; charset=utf-8",
  });
  expect(job.results[0]!.artifact).not.toHaveProperty("data");
  const [artifact] = await h.db.db.select().from(aiJobArtifacts);
  expect(artifact!.data.toString()).toContain("Änderung");
  expect(artifact!.size).toBe(artifact!.data.length);
  expect(
    (await h.db.db.select().from(aiJobAttempts))[0]!.parameters,
  ).toMatchObject({ temperature: 0 });
});
it("fails research transparently when no controlled search gateway is configured", async () => {
  const job = await create("research");
  await worker().runNext();
  expect((await detail(job.id)).code).toBe("AI_JOB_RESEARCH_UNAVAILABLE");
  expect((await detail(job.id)).results).toHaveLength(0);
});

const reader = () => createTodoistReader(h.f.fetcher);
const executor = () =>
  createPlanExecutor(
    h.db,
    h.config,
    reader(),
    createTodoistMover(h.f.fetcher),
    createTaskWriter(h.f.fetcher),
  );

async function delegated() {
  await h.connect();
  const context = (await h.work.snapshot(h.headers())).contexts[0]!;
  await h.work.handle(
    "context-save",
    h.headers(),
    h.input(context, { projectId: projects[0]!.id }),
  );
  h.advance();
  h.f.state.tasks = [
    {
      ...structuredClone(h.f.state.tasks[1]!),
      id: "synthetic-root",
      parent_id: null,
      content: "Ursprung erhalten",
      description: "Keine Änderung am Original",
    },
  ];
  await h.work.handle("tasks-refresh", h.headers(), { contextId: context.id });
  const source = await createTaskService(h.db, h.config, reader()).inspect(
    h.headers(),
    context.id,
    "synthetic-root",
  );
  const job = await create("text", null, {
    contextId: context.id,
    taskId: source.task.id,
    basis: source.basis,
  });
  await executor().runNext();
  await worker().runNext();
  return {
    job: await detail(job.id),
    original: structuredClone(h.f.state.tasks[0]!),
    contextId: context.id,
  };
}
it("closes only the verified native child through E4, never detaches it or changes its original parent", async () => {
  const { job, original } = await delegated();
  expect(job.status).toBe("ready");
  expect(h.f.control.calls).toHaveLength(1);
  const input = command(job);
  await service().handle("close", h.headers(), input);
  expect((await detail(job.id)).status).toBe("closed");
  expect(h.f.state.tasks[1]!.checked).toBe(false);
  await service().handle("close", h.headers(), input);
  await executor().runNext();
  const after = await detail(job.id);
  expect(after.reference!.state).toBe("closed");
  expect(after.code).toBeNull();
  expect(h.f.state.tasks[0]).toEqual(original);
  expect(h.f.state.tasks[1]).toMatchObject({
    checked: true,
    parent_id: original.id,
  });
  expect(h.f.control.calls.map((c) => c.path)).toEqual([
    "tasks",
    "tasks/created:1/close",
  ]);
});
it("persists local completion when the child changed, but admits no unsafe native operation", async () => {
  const { job, original } = await delegated();
  h.f.state.tasks[1]!.description = "Bewusst ergänzter Benutzerinhalt";
  await expect(
    service().handle("close", h.headers(), command(job)),
  ).rejects.toThrow("AI_JOB_REFERENCE_UNCONFIRMED");
  expect((await detail(job.id)).status).toBe("closed");
  expect((await detail(job.id)).code).toBe("AI_JOB_CLOSE_UNCONFIRMED");
  expect(h.f.control.calls).toHaveLength(1);
  expect(h.f.state.tasks[0]).toEqual(original);
  expect((await h.work.snapshot(h.headers())).aiJobProblems).toHaveLength(1);
});
it("keeps unknown child completion separate and reconciles without repeating the close", async () => {
  const { job, original } = await delegated();
  await service().handle("close", h.headers(), command(job));
  const op = (await detail(job.id)).reference!.closeOperationId!;
  h.f.control.fail = "unknown";
  await executor().runNext();
  expect((await detail(job.id)).reference!.state).toBe("closing");
  h.f.control.fail = "";
  await createTaskService(h.db, h.config, reader()).handle(
    "resume",
    h.headers(),
    { operationId: op },
  );
  await executor().runNext();
  expect(
    h.f.control.calls.filter((c) => c.path.endsWith("/close")),
  ).toHaveLength(1);
  expect(h.f.state.tasks[0]).toEqual(original);
  expect((await detail(job.id)).code).toBe("AI_JOB_CLOSE_UNCONFIRMED");
  // The synthetic remote now proves completion of that same operation.
  h.f.state.tasks[1]!.checked = true;
  await createTaskService(h.db, h.config, reader()).handle(
    "resume",
    h.headers(),
    { operationId: op },
  );
  await executor().runNext();
  expect((await detail(job.id)).reference!.state).toBe("closed");
  expect(
    h.f.control.calls.filter((c) => c.path.endsWith("/close")),
  ).toHaveLength(1);
});
it("rejects child completion after parent changes and preserves both tasks", async () => {
  const { job } = await delegated();
  await service().handle("close", h.headers(), command(job));
  h.f.state.tasks[0]!.description = "Neue externe Fassung";
  await executor().runNext();
  expect((await detail(job.id)).reference!.state).toBe("closing");
  expect(h.f.state.tasks[1]!.checked).toBe(false);
  expect(h.f.control.calls).toHaveLength(1);
});
it("deletes only a consciously selected owned aggregate and retains the E4 journal while blocking its later resume", async () => {
  const { job } = await delegated();
  await service().handle("close", h.headers(), command(job));
  let current = await detail(job.id);
  await expect(
    service().handle("delete", h.headers(), command(current)),
  ).rejects.toThrow("AI_JOB_DELETE_BLOCKED");
  h.f.control.fail = "unknown";
  await executor().runNext();
  current = await detail(job.id);
  const op = current.reference!.closeOperationId!;
  await service().handle("delete", h.headers(), command(current));
  await expect(detail(job.id)).rejects.toThrow("AI_JOB_NOT_FOUND");
  await expect(
    createTaskService(h.db, h.config, reader()).handle("resume", h.headers(), {
      operationId: op,
    }),
  ).rejects.toThrow();
  expect(h.f.state.tasks).toHaveLength(2);
});
it("requires ownership for artifact bytes and deletes files only with their aggregate", async () => {
  let job = await create("file", "md");
  await worker(async () => ({
    answer: {
      kind: "result",
      text: "Datei",
      uncertainties: [],
      document: {
        title: "Synthetisch",
        paragraphs: ["Geschützt"],
        columns: [],
        rows: [],
      },
    },
    raw: "{}",
    metrics: {},
  })).runNext();
  job = await detail(job.id);
  const artifact = job.results[0]!.artifact!;
  const bytes = await service().artifact(h.headers(), job.id, artifact.id);
  expect(bytes.data.toString()).toContain("Geschützt");
  await expect(
    service().artifact(new Headers(), job.id, artifact.id),
  ).rejects.toThrow();
  await expect(
    service().artifact(h.headers(), crypto.randomUUID(), artifact.id),
  ).rejects.toThrow("AI_JOB_NOT_FOUND");
  await service().handle("delete", h.headers(), command(job));
  expect(await h.db.db.select().from(aiJobArtifacts)).toHaveLength(0);
});
