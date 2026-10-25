import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { TodoistTask } from "@helios/contracts";
import { aiJobQueueCommand } from "@helios/contracts";
import { createIdentityService } from "../identity/service";
import type { Database, Db } from "../planning/store";
import type { WorkConfig } from "../work/config";
import type { createTaskService } from "../tasks/service";
import { fingerprint } from "../tasks/hash";
import { WorkFault } from "../work/service";
import { aiJobs, aiJobRefs, aiJobEvents } from "./schema";
import { jobConflict, ownedJob, lockJobQueue } from "./store";
import { parentFingerprint, assertJobParent } from "./journal";

export type JobCloseLink = {
  id: string;
  childId: string;
  parentId: string;
  parentFingerprint: string;
};
export function assertCloseChild(
  link: JobCloseLink,
  projectId: string,
  child: TodoistTask,
  children: readonly { id: string }[],
) {
  if (
    child.id !== link.childId ||
    child.parent_id !== link.parentId ||
    child.project_id !== projectId ||
    child.content !== "KI Aufgabe " + link.id ||
    child.description !== "" ||
    child.checked ||
    child.is_deleted ||
    child.due ||
    child.deadline ||
    child.duration ||
    child.labels.some((s) => s !== "fun") ||
    children.length
  )
    throw new WorkFault("AI_JOB_REFERENCE_UNCONFIRMED", 409);
}
export function assertCloseParent(
  link: JobCloseLink,
  projectId: string,
  parent: TodoistTask,
) {
  assertJobParent({ ...link, requestHash: "" }, { projectId }, parent);
}
export async function authorizeJobClose(
  db: Db,
  user: string,
  link: JobCloseLink,
  operationId: string,
) {
  const job = await ownedJob(db, user, link.id);
  const [ref] = await db
    .select()
    .from(aiJobRefs)
    .where(eq(aiJobRefs.jobId, job.id));
  if (
    job.status !== "closed" ||
    ref?.childId !== link.childId ||
    ref.taskId !== link.parentId ||
    ref.closeOperationId !== operationId
  )
    throw new WorkFault("AI_JOB_REFERENCE_UNCONFIRMED", 409);
}
export async function linkJobClose(
  db: Db,
  user: string,
  link: JobCloseLink,
  key: string,
  operationId: string,
) {
  await lockJobQueue(db);
  const job = await ownedJob(db, user, link.id);
  const [ref] = await db
    .select()
    .from(aiJobRefs)
    .where(eq(aiJobRefs.jobId, job.id));
  if (
    job.status !== "closed" ||
    ref?.childId !== link.childId ||
    ref.taskId !== link.parentId ||
    ref.closeKey !== key ||
    ref.closeOperationId
  )
    throw jobConflict();
  await db
    .update(aiJobRefs)
    .set({
      closeOperationId: operationId,
      state: "closing",
      updatedAt: new Date(),
    })
    .where(eq(aiJobRefs.jobId, job.id));
}
export async function finishJobClose(
  db: Db,
  user: string,
  link: JobCloseLink,
  operationId: string,
  status: string,
  code: string | null,
) {
  await lockJobQueue(db);
  await authorizeJobClose(db, user, link, operationId);
  const job = await ownedJob(db, user, link.id);
  const succeeded = status === "succeeded";
  await db
    .update(aiJobRefs)
    .set({ state: succeeded ? "closed" : "closing", updatedAt: new Date() })
    .where(eq(aiJobRefs.jobId, job.id));
  await db
    .update(aiJobs)
    .set({
      code: succeeded ? null : "AI_JOB_CLOSE_UNCONFIRMED",
      revision: job.revision + 1,
      updatedAt: new Date(),
    })
    .where(eq(aiJobs.id, job.id));
  await db.insert(aiJobEvents).values({
    id: randomUUID(),
    jobId: job.id,
    key: randomUUID(),
    requestHash: fingerprint({
      operationId,
      status,
      revision: job.revision + 1,
    }),
    kind: succeeded ? "reference_closed" : "reference_close_unconfirmed",
    revision: job.revision + 1,
    data: { operationId, status, code },
  });
}
export function jobClosure(
  database: Database,
  config: WorkConfig,
  tasks: ReturnType<typeof createTaskService>,
) {
  const identity = createIdentityService(database, config);
  return async (headers: Headers, raw: unknown) => {
    const input = aiJobQueueCommand.parse(raw);
    const hash = fingerprint({ action: "close", ...input });
    const ref = await identity.withActive(
      headers,
      { mutation: true },
      async (db, user) => {
        await lockJobQueue(db);
        const job = await ownedJob(db, user, input.id);
        const [event] = await db
          .select()
          .from(aiJobEvents)
          .where(
            and(eq(aiJobEvents.jobId, job.id), eq(aiJobEvents.key, input.key)),
          );
        const [reference] = await db
          .select()
          .from(aiJobRefs)
          .where(eq(aiJobRefs.jobId, job.id));
        if (event) {
          if (event.requestHash !== hash) throw jobConflict();
          return reference;
        }
        if (job.status !== "ready" || job.revision !== input.revision)
          throw jobConflict();
        if (reference && (reference.state !== "verified" || !reference.childId))
          throw new WorkFault("AI_JOB_REFERENCE_UNCONFIRMED", 409);
        await db
          .update(aiJobs)
          .set({
            status: "closed",
            revision: job.revision + 1,
            closedAt: new Date(),
            updatedAt: new Date(),
            code: reference ? "AI_JOB_CLOSE_UNCONFIRMED" : null,
          })
          .where(eq(aiJobs.id, job.id));
        if (reference)
          await db
            .update(aiJobRefs)
            .set({
              state: "closing",
              closeKey: input.key,
              updatedAt: new Date(),
            })
            .where(eq(aiJobRefs.jobId, job.id));
        await db.insert(aiJobEvents).values({
          id: randomUUID(),
          jobId: job.id,
          key: input.key,
          requestHash: hash,
          kind: "closed",
          revision: job.revision + 1,
        });
        return reference ? { ...reference, closeKey: input.key } : undefined;
      },
    );
    if (!ref || ref.closeOperationId) return;
    // A repeated identical local admission may safely finish admitting its journal
    // operation. The E4 operation key prevents any duplicate native request.
    const child = await tasks.inspect(headers, ref.contextId, ref.childId!);
    const parent = await tasks.inspect(headers, ref.contextId, ref.taskId);
    const link = {
      id: input.id,
      childId: ref.childId!,
      parentId: ref.taskId,
      parentFingerprint: parentFingerprint(parent.task),
    };
    assertCloseParent(link, ref.projectId, parent.task);
    assertCloseChild(link, ref.projectId, child.task, child.children);
    await tasks.enqueueJobClose(
      headers,
      {
        key: input.key,
        action: "close",
        contextId: ref.contextId,
        taskId: ref.childId!,
        basis: child.basis,
        acknowledgeDestructive: true,
        acknowledgeHierarchy: true,
      },
      link,
    );
  };
}
