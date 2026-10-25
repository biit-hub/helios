import { randomUUID } from "node:crypto";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../planning/store";
import { WorkFault } from "../work/service";
import { fingerprint } from "../tasks/hash";
import { aiJobs, aiJobEvents, aiJobTurns, aiJobRefs } from "./schema";
import { jobConflict, lockJobQueue, ownedJob } from "./store";

export const jobLifecycleCommand = z.strictObject({
  key: z.uuid(),
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
  text: z
    .string()
    .min(1)
    .max(12000)
    .refine((s) => !!s.trim())
    .optional(),
  questionId: z.uuid().optional(),
});
export type LifecycleAction = "answer" | "refine" | "retry";
export async function mutateJob(
  db: Db,
  user: string,
  input: z.infer<typeof jobLifecycleCommand>,
  action: LifecycleAction,
) {
  await lockJobQueue(db);
  const job = await ownedJob(db, user, input.id);
  const requestHash = fingerprint({ action, ...input });
  const [event] = await db
    .select()
    .from(aiJobEvents)
    .where(and(eq(aiJobEvents.jobId, job.id), eq(aiJobEvents.key, input.key)));
  if (event) {
    if (event.requestHash !== requestHash) throw jobConflict();
    return;
  }
  const expected = {
    answer: "awaiting_input",
    refine: "ready",
    retry: "error",
  };
  if (job.revision !== input.revision || job.status !== expected[action])
    throw jobConflict();
  if (
    (action !== "retry") !== !!input.text ||
    (action === "answer") !== !!input.questionId
  )
    throw new WorkFault("INVALID_REQUEST", 400);
  const [ref] = await db
    .select()
    .from(aiJobRefs)
    .where(eq(aiJobRefs.jobId, job.id));
  if (ref && ref.state !== "verified")
    throw new WorkFault("AI_JOB_REFERENCE_UNCONFIRMED", 409);
  const [pending] = await db
    .select({ n: count() })
    .from(aiJobs)
    .where(inArray(aiJobs.status, ["queued", "linking"]));
  if (pending!.n >= 100) throw new WorkFault("AI_JOB_LIMIT", 409);
  const [history] = await db
    .select({ n: count() })
    .from(aiJobTurns)
    .where(eq(aiJobTurns.jobId, job.id));
  if (history!.n >= 100 || job.runNumber >= 100)
    throw new WorkFault("AI_JOB_INPUT_LIMIT", 409);
  if (action === "answer") {
    const [q] = await db
      .select()
      .from(aiJobTurns)
      .where(
        and(
          eq(aiJobTurns.id, input.questionId!),
          eq(aiJobTurns.jobId, job.id),
          eq(aiJobTurns.kind, "question"),
        ),
      );
    if (!q || q.attemptId !== job.runId) throw jobConflict();
  }
  if (input.text)
    await db.insert(aiJobTurns).values({
      id: randomUUID(),
      jobId: job.id,
      kind: action === "answer" ? "answer" : "refinement",
      text: input.text,
      questionId: input.questionId ?? null,
    });
  const revision = job.revision + 1;
  await db
    .update(aiJobs)
    .set({
      status: "queued",
      revision,
      code: null,
      updatedAt: new Date(),
      queueOrder: sql`nextval(pg_get_serial_sequence('ai_jobs','queue_order'))`,
      priorityOrder: null,
      prioritizedAt: null,
      queuedAt: new Date(),
      heartbeatAt: null,
      deadlineAt: null,
    })
    .where(eq(aiJobs.id, job.id));
  await db.insert(aiJobEvents).values({
    id: randomUUID(),
    jobId: job.id,
    key: input.key,
    requestHash,
    kind: action,
    revision,
  });
}
