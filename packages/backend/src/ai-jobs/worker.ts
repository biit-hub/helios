import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { createIdentityService } from "../identity/service";
import type { Database, Db } from "../planning/store";
import type { WorkConfig } from "../work/config";
import { WorkFault } from "../work/service";
import { fingerprint } from "../tasks/hash";
import {
  aiJobs,
  aiJobAttempts,
  aiJobEvents,
  aiJobResults,
  aiJobTurns,
  aiJobArtifacts,
  aiJobSettings,
  type AiJobRow,
} from "./schema";
import { jobQueueOrder, lockJobQueue } from "./store";
import {
  JobInferenceUncertain,
  JobInvalidAnswer,
  createJobGenerator,
  JOB_PROMPT_VERSION,
  JOB_SCHEMA_VERSION,
  JOB_TIMEOUT_MS,
  type JobGenerate,
  type JobInput,
  type JobGeneration,
} from "./generation";
import { renderJobFile } from "./render";
import {
  researchSources,
  ResearchQuestion,
  PUBLIC_SEARCH_QUESTION,
  type ResearchSources,
} from "./research";

export const JOB_QUEUE = "helios.ai-jobs";
export function createAiJobWorker(
  database: Database,
  config: WorkConfig,
  boss: PgBoss,
  generate: JobGenerate = createJobGenerator(),
  research: ResearchSources = researchSources(),
) {
  const identity = createIdentityService(database, config);
  const controllers = new Set<AbortController>();
  let stopping = false;
  async function event(
    db: Db,
    job: AiJobRow,
    kind: string,
    code: string | null = null,
  ) {
    await db.insert(aiJobEvents).values({
      id: randomUUID(),
      jobId: job.id,
      key: randomUUID(),
      requestHash: fingerprint({ run: job.runId, kind, code }),
      kind,
      revision: job.revision + 1,
      data: { code, attemptId: job.runId },
    });
  }
  async function finish(job: AiJobRow, result: JobGeneration, input: JobInput) {
    const answer = result.answer;
    const artifact =
      answer.kind === "result" && job.format && answer.document
        ? await renderJobFile(
            job.id,
            job.runNumber,
            job.format,
            answer.document,
          )
        : null;
    await identity.withBackgroundUser(job.userId, async (db) => {
      await lockJobQueue(db);
      const [now] = await db.select().from(aiJobs).where(eq(aiJobs.id, job.id));
      if (
        !now ||
        now.status !== "running" ||
        now.runId !== job.runId ||
        now.deadlineAt! <= new Date()
      )
        return;
      if (answer.kind === "question") {
        await db.insert(aiJobTurns).values({
          id: randomUUID(),
          jobId: job.id,
          kind: "question",
          text: answer.text,
          attemptId: job.runId,
        });
      } else {
        const [last] = await db
          .select({ n: sql<number>`coalesce(max(version),0)::integer` })
          .from(aiJobResults)
          .where(eq(aiJobResults.jobId, job.id));
        const resultId = randomUUID();
        await db.insert(aiJobResults).values({
          id: resultId,
          jobId: job.id,
          attemptId: job.runId!,
          version: last!.n + 1,
          text: answer.text,
          data: answer.document ? { document: answer.document } : {},
          sources: input.sources.map(({ title, url, retrievedAt }) => ({
            title,
            url,
            retrievedAt,
          })),
          uncertainties: answer.uncertainties,
        });
        if (artifact) {
          const [stored] = await db
            .select({ bytes: sql<number>`coalesce(sum(size),0)::bigint` })
            .from(aiJobArtifacts);
          if (Number(stored!.bytes) + artifact.size > 1073741824)
            throw new WorkFault("AI_JOB_FILE_LIMIT", 409);
        }
        if (artifact)
          await db.insert(aiJobArtifacts).values({
            id: randomUUID(),
            jobId: job.id,
            resultId,
            format: job.format!,
            ...artifact,
          });
      }
      const status = answer.kind === "question" ? "awaiting_input" : "ready";
      await db
        .update(aiJobs)
        .set({
          status,
          revision: job.revision + 1,
          code: null,
          updatedAt: new Date(),
          heartbeatAt: null,
          deadlineAt: null,
        })
        .where(eq(aiJobs.id, job.id));
      await db
        .update(aiJobAttempts)
        .set({
          status,
          rawOutput: result.raw,
          metrics: result.metrics,
          finishedAt: new Date(),
        })
        .where(eq(aiJobAttempts.id, job.runId!));
      await event(db, job, status);
    });
  }
  async function fail(
    job: AiJobRow,
    code: string,
    rawOutput: string | null = null,
  ) {
    // Persist a local diagnosis even if the owner's account was moved to recovery.
    // This does not grant permission to generate content or write to Todoist.
    await database.db.transaction(async (db) => {
      await lockJobQueue(db);
      const [now] = await db.select().from(aiJobs).where(eq(aiJobs.id, job.id));
      if (!now || now.status !== "running" || now.runId !== job.runId) return;
      await db
        .update(aiJobs)
        .set({
          status: "error",
          code,
          revision: now.revision + 1,
          updatedAt: new Date(),
          heartbeatAt: null,
          deadlineAt: null,
        })
        .where(eq(aiJobs.id, job.id));
      await db
        .update(aiJobAttempts)
        .set({ status: "error", code, rawOutput, finishedAt: new Date() })
        .where(eq(aiJobAttempts.id, job.runId!));
      await event(db, now, "error", code);
    });
  }
  async function recover() {
    const expired = await database.db
      .select()
      .from(aiJobs)
      .where(
        and(
          eq(aiJobs.status, "running"),
          sql`${aiJobs.deadlineAt}<${new Date()}`,
        ),
      );
    for (const job of expired) await fail(job, "AI_JOB_INTERRUPTED");
  }
  async function claim(): Promise<AiJobRow | null> {
    const [pending] = await database.db
      .select()
      .from(aiJobs)
      .where(eq(aiJobs.status, "queued"))
      .orderBy(...jobQueueOrder)
      .limit(1);
    if (!pending) return null;
    return identity.withBackgroundUser(pending.userId, async (db) => {
      await lockJobQueue(db);
      const [active] = await db
        .select({ id: aiJobs.id })
        .from(aiJobs)
        .where(eq(aiJobs.status, "running"))
        .limit(1);
      if (active) return null;
      const [next] = await db
        .select()
        .from(aiJobs)
        .where(eq(aiJobs.status, "queued"))
        .orderBy(...jobQueueOrder)
        .limit(1);
      if (!next || next.userId !== pending.userId) return null;
      const runId = randomUUID();
      const [job] = await db
        .update(aiJobs)
        .set({
          status: "running",
          runId,
          runNumber: next.runNumber + 1,
          revision: next.revision + 1,
          updatedAt: new Date(),
          heartbeatAt: new Date(),
          deadlineAt: new Date(Date.now() + JOB_TIMEOUT_MS + 90000),
        })
        .where(eq(aiJobs.id, next.id))
        .returning();
      await db.insert(aiJobAttempts).values({
        id: runId,
        jobId: job!.id,
        number: job!.runNumber,
        status: "running",
        model: job!.model,
        digest: job!.digest,
        parameters: job!.parameters,
        inputHash: fingerprint({
          prompt: job!.originalPrompt,
          revision: next.revision,
        }),
        promptVersion: JOB_PROMPT_VERSION,
        schemaVersion: JOB_SCHEMA_VERSION,
      });
      await event(db, { ...job!, revision: next.revision }, "running");
      return job!;
    });
  }
  async function runNext() {
    if (stopping || config.RESTORE_MODE || !config.WORKER_ENABLED) return false;
    const client = await database.pool.connect();
    let locked = false;
    let job: AiJobRow | null = null;
    const controller = new AbortController();
    const connectionLost = () => controller.abort();
    client.on("error", connectionLost);
    try {
      locked = (
        await client.query("select pg_try_advisory_lock(1748014) as locked")
      ).rows[0].locked;
      if (!locked) return false;
      await recover();
      job = await claim();
      if (!job) return false;
      controllers.add(controller);
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(JOB_TIMEOUT_MS),
      ]);
      const [setting] = await database.db
        .select()
        .from(aiJobSettings)
        .where(
          and(
            eq(aiJobSettings.userId, job.userId),
            eq(aiJobSettings.output, job.output),
          ),
        );
      if (!setting?.enabled) throw new WorkFault("AI_JOB_TYPE_DISABLED", 409);
      const turns = await database.db
        .select({ kind: aiJobTurns.kind, text: aiJobTurns.text })
        .from(aiJobTurns)
        .where(eq(aiJobTurns.jobId, job.id))
        .orderBy(asc(aiJobTurns.createdAt), asc(aiJobTurns.id));
      const [previous] = await database.db
        .select({ text: aiJobResults.text })
        .from(aiJobResults)
        .where(eq(aiJobResults.jobId, job.id))
        .orderBy(sql`${aiJobResults.version} DESC`)
        .limit(1);
      let sources: JobInput["sources"] = [];
      try {
        if (job.output === "research")
          sources = await research(job, turns, signal);
      } catch (error) {
        if (!(error instanceof ResearchQuestion)) throw error;
        const input = { job, turns, previous: previous?.text ?? null, sources };
        const answer = {
          kind: "question" as const,
          text: PUBLIC_SEARCH_QUESTION,
        };
        await finish(
          job,
          {
            answer,
            raw: JSON.stringify(answer),
            metrics: { researchTermsRequired: 1 },
          },
          input,
        );
        return true;
      }
      const input = { job, turns, previous: previous?.text ?? null, sources };
      await database.db
        .update(aiJobAttempts)
        .set({
          inputHash: fingerprint({
            prompt: job.originalPrompt,
            turns,
            previous: input.previous,
            sources,
            output: job.output,
            format: job.format,
          }),
        })
        .where(eq(aiJobAttempts.id, job.runId!));
      const result = await generate(input, signal);
      if (signal.aborted) return true; // Leave claim fenced until recovery; never start a duplicate.
      await finish(job, result, input);
      return true;
    } catch (error) {
      // Cancellation/lost connection can leave a model running remotely. Retain the
      // global running fence until its deadline instead of immediately starting another.
      if (
        job &&
        !controller.signal.aborted &&
        !(error instanceof JobInferenceUncertain) &&
        !(
          error instanceof Error &&
          ["AbortError", "TimeoutError"].includes(error.name)
        )
      )
        await fail(
          job,
          error instanceof WorkFault ? error.code : "AI_JOB_INVALID_OUTPUT",
          error instanceof JobInvalidAnswer ? error.raw : null,
        );
      return !!job;
    } finally {
      controllers.delete(controller);
      if (locked)
        await client
          .query("select pg_advisory_unlock(1748014)")
          .catch(() => {});
      client.removeListener("error", connectionLost);
      client.release();
    }
  }
  return {
    runNext,
    async dispatch() {
      if (stopping || config.RESTORE_MODE || !config.WORKER_ENABLED) return;
      const [active] = await database.db
        .select({ deadline: aiJobs.deadlineAt })
        .from(aiJobs)
        .where(eq(aiJobs.status, "running"))
        .limit(1);
      if (active?.deadline && active.deadline > new Date()) return;
      const [pending] = await database.db
        .select({ id: aiJobs.id })
        .from(aiJobs)
        .where(eq(aiJobs.status, "queued"))
        .limit(1);
      if (!active && !pending) return;
      await boss.send(JOB_QUEUE, {}, { singletonKey: "local", retryLimit: 0 });
    },
    async register() {
      await boss.createQueue(JOB_QUEUE, {
        policy: "exclusive",
        retryLimit: 0,
        expireInSeconds: 300,
      });
      await boss.work(
        JOB_QUEUE,
        { localConcurrency: 1, batchSize: 1, pollingIntervalSeconds: 1 },
        async () => {
          await runNext();
        },
      );
    },
    stop() {
      stopping = true;
      for (const controller of controllers) controller.abort();
    },
  };
}
