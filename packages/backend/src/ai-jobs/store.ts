import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql, count, inArray } from "drizzle-orm";
import type {
  AiJobCreate,
  AiJobDetail,
  AiJobList,
  AiJobListItem,
  AiJobModel,
  AiJobQueueCommand,
  AiJobReference,
  AiJobStatus,
} from "@helios/contracts";
import {
  aiJobs,
  aiJobSettings,
  aiJobRefs,
  aiJobEvents,
  aiJobAttempts,
  aiJobTurns,
  aiJobResults,
  aiJobArtifacts,
  type AiJobRow,
  type AiJobRefRow,
} from "./schema";
import type { Db } from "../planning/store";
import { WorkFault } from "../work/service";
import { fingerprint } from "../tasks/hash";

export const jobConflict = () => new WorkFault("AI_JOB_CONFLICT", 409);
export const jobQueueOrder = [
  sql`${aiJobs.priorityOrder} ASC NULLS LAST`,
  asc(aiJobs.queueOrder),
];
export async function lockJobQueue(db: Db) {
  await db.execute(sql`SELECT pg_advisory_xact_lock(1748016)`);
}
export async function ownedJob(db: Db, userId: string, id: string) {
  const [job] = await db
    .select()
    .from(aiJobs)
    .where(and(eq(aiJobs.id, id), eq(aiJobs.userId, userId)));
  if (!job) throw new WorkFault("AI_JOB_NOT_FOUND", 404);
  return job;
}
export type PreparedJob = {
  input: AiJobCreate;
  requestHash: string;
  userId: string;
  model: AiJobModel;
  settingsRevision: number;
};
export async function existingJob(db: Db, userId: string, input: AiJobCreate) {
  const [job] = await db.select().from(aiJobs).where(eq(aiJobs.id, input.key));
  if (!job) return null;
  if (job.userId !== userId || job.requestHash !== fingerprint(input))
    throw jobConflict();
  return job;
}
export async function insertJob(
  db: Db,
  userId: string,
  job: PreparedJob,
  status: "linking" | "queued",
) {
  if (userId !== job.userId) throw jobConflict();
  await lockJobQueue(db);
  const old = await existingJob(db, userId, job.input);
  if (old) return old;
  const [setting] = await db
    .select()
    .from(aiJobSettings)
    .where(
      and(
        eq(aiJobSettings.userId, userId),
        eq(aiJobSettings.output, job.input.output),
      ),
    );
  if (
    !setting?.enabled ||
    setting.revision !== job.settingsRevision ||
    setting.model !== job.model.name ||
    setting.digest !== job.model.digest
  )
    throw new WorkFault("AI_JOB_CONFIG_CHANGED", 409);
  const [pending] = await db
    .select({ n: count() })
    .from(aiJobs)
    .where(inArray(aiJobs.status, ["queued", "linking"]));
  if (pending!.n >= 100) throw new WorkFault("AI_JOB_LIMIT", 409);
  const [created] = await db
    .insert(aiJobs)
    .values({
      id: job.input.key,
      userId,
      originalPrompt: job.input.prompt,
      requestHash: job.requestHash,
      output: job.input.output,
      format: job.input.format,
      model: job.model.name,
      digest: job.model.digest,
      settingsRevision: job.settingsRevision,
      parameters: {
        temperature: 0,
        num_ctx: 8192,
        num_predict: 4096,
        keep_alive: "5m",
      },
      status,
      queuedAt: status === "queued" ? new Date() : null,
    })
    .returning();
  await db
    .insert(aiJobEvents)
    .values({
      id: randomUUID(),
      jobId: created!.id,
      key: job.input.key,
      requestHash: job.requestHash,
      kind: "created",
      revision: 0,
    });
  return created!;
}
export async function mutateQueue(
  db: Db,
  userId: string,
  input: AiJobQueueCommand,
  action: "prioritize" | "stop",
) {
  await lockJobQueue(db);
  const job = await ownedJob(db, userId, input.id);
  const hash = fingerprint({ ...input, action });
  const [old] = await db
    .select()
    .from(aiJobEvents)
    .where(and(eq(aiJobEvents.jobId, job.id), eq(aiJobEvents.key, input.key)));
  if (old) {
    if (old.requestHash !== hash) throw jobConflict();
    return job;
  }
  if (job.revision !== input.revision) throw jobConflict();
  if (job.status !== "queued") throw new WorkFault("AI_JOB_NOT_QUEUED", 409);
  const noChange = action === "prioritize" && job.priorityOrder !== null;
  const revision = job.revision + (noChange ? 0 : 1);
  if (!noChange)
    await db
      .update(aiJobs)
      .set(
        action === "stop"
          ? {
              status: "stopped",
              revision,
              updatedAt: new Date(),
            }
          : {
              priorityOrder: sql`nextval(pg_get_serial_sequence('ai_jobs','queue_order'))`,
              prioritizedAt: new Date(),
              revision,
              updatedAt: new Date(),
            },
      )
      .where(eq(aiJobs.id, job.id));
  await db
    .insert(aiJobEvents)
    .values({
      id: randomUUID(),
      jobId: job.id,
      key: input.key,
      requestHash: hash,
      kind: noChange ? "priority_unchanged" : action,
      revision,
    });
  return ownedJob(db, userId, job.id);
}
function reference(ref: AiJobRefRow | undefined): AiJobReference | null {
  return ref
    ? {
        contextId: ref.contextId,
        taskId: ref.taskId,
        title: ref.title,
        childId: ref.childId,
        state: ref.state,
        operationId: ref.operationId,
        closeOperationId: ref.closeOperationId,
      }
    : null;
}
function item(
  job: AiJobRow,
  ref: AiJobRefRow | undefined,
  positions: Map<string, number>,
  result: string,
): AiJobListItem {
  return {
    id: job.id,
    prompt: job.originalPrompt.slice(0, 240),
    result: result.slice(0, 240),
    status: job.status,
    revision: job.revision,
    output: job.output,
    format: job.format,
    model: job.model,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    queuePosition: positions.get(job.id) ?? null,
    prioritized: job.priorityOrder !== null,
    code: job.code,
    reference: reference(ref),
  };
}
async function queuePositions(db: Db, userId: string) {
  const rows = await db
    .select({ id: aiJobs.id })
    .from(aiJobs)
    .where(and(eq(aiJobs.userId, userId), eq(aiJobs.status, "queued")))
    .orderBy(...jobQueueOrder);
  return new Map(rows.map((r, i) => [r.id, i + 1]));
}
export async function listJobs(
  db: Db,
  userId: string,
  page: number,
  status: AiJobStatus | undefined,
  oldest: boolean,
): Promise<AiJobList> {
  const condition = and(
    eq(aiJobs.userId, userId),
    status ? eq(aiJobs.status, status) : undefined,
  );
  const [total] = await db.select({ n: count() }).from(aiJobs).where(condition);
  const rows = await db
    .select({
      job: aiJobs,
      ref: aiJobRefs,
      result: sql<string>`COALESCE((SELECT left(r.text,240) FROM ai_job_results r WHERE r.job_id=${aiJobs.id} ORDER BY r.version DESC LIMIT 1),'')`,
    })
    .from(aiJobs)
    .leftJoin(aiJobRefs, eq(aiJobRefs.jobId, aiJobs.id))
    .where(condition)
    .orderBy(
      oldest ? asc(aiJobs.createdAt) : desc(aiJobs.createdAt),
      asc(aiJobs.id),
    )
    .limit(20)
    .offset((page - 1) * 20);
  const positions = await queuePositions(db, userId);
  return {
    jobs: rows.map((r) => item(r.job, r.ref ?? undefined, positions, r.result)),
    page,
    pageSize: 20,
    total: total!.n,
  };
}
export async function jobDetail(
  db: Db,
  userId: string,
  id: string,
): Promise<AiJobDetail> {
  const job = await ownedJob(db, userId, id);
  const [ref] = await db
    .select()
    .from(aiJobRefs)
    .where(eq(aiJobRefs.jobId, job.id));
  const results = await db
    .select({
      r: aiJobResults,
      a: {
        id: aiJobArtifacts.id,
        format: aiJobArtifacts.format,
        filename: aiJobArtifacts.filename,
        mime: aiJobArtifacts.mime,
        size: aiJobArtifacts.size,
        sha256: aiJobArtifacts.sha256,
      },
    })
    .from(aiJobResults)
    .leftJoin(aiJobArtifacts, eq(aiJobArtifacts.resultId, aiJobResults.id))
    .where(eq(aiJobResults.jobId, job.id))
    .orderBy(asc(aiJobResults.version));
  const turns = await db
    .select()
    .from(aiJobTurns)
    .where(eq(aiJobTurns.jobId, job.id))
    .orderBy(asc(aiJobTurns.createdAt), asc(aiJobTurns.id));
  const events = await db
    .select()
    .from(aiJobEvents)
    .where(eq(aiJobEvents.jobId, job.id))
    .orderBy(asc(aiJobEvents.createdAt), asc(aiJobEvents.id));
  const attempts = await db
    .select({
      id: aiJobAttempts.id,
      number: aiJobAttempts.number,
      status: aiJobAttempts.status,
      model: aiJobAttempts.model,
      digest: aiJobAttempts.digest,
      startedAt: aiJobAttempts.startedAt,
      finishedAt: aiJobAttempts.finishedAt,
      code: aiJobAttempts.code,
      parameters: aiJobAttempts.parameters,
    })
    .from(aiJobAttempts)
    .where(eq(aiJobAttempts.jobId, job.id))
    .orderBy(asc(aiJobAttempts.number));
  return {
    ...item(
      job,
      ref,
      await queuePositions(db, userId),
      results.at(-1)?.r.text ?? "",
    ),
    originalPrompt: job.originalPrompt,
    digest: job.digest,
    turns: [
      {
        id: job.id,
        kind: "prompt",
        text: job.originalPrompt,
        questionId: null,
        createdAt: job.createdAt.toISOString(),
      },
      ...turns.map((t) => ({
        id: t.id,
        kind: t.kind,
        text: t.text,
        questionId: t.questionId,
        createdAt: t.createdAt.toISOString(),
      })),
    ],
    results: results.map(({ r, a }) => ({
      id: r.id,
      version: r.version,
      text: r.text,
      createdAt: r.createdAt.toISOString(),
      artifact: a,
      sources: r.sources,
      uncertainties: r.uncertainties,
    })),
    events: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      revision: e.revision,
      createdAt: e.createdAt.toISOString(),
      data: e.data,
    })),
    attempts: attempts.map((a) => ({
      ...a,
      startedAt: a.startedAt.toISOString(),
      finishedAt: a.finishedAt?.toISOString() ?? null,
    })),
  };
}
