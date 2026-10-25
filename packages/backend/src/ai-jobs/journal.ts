import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { TodoistTask } from "@helios/contracts";
import type { Db } from "../planning/store";
import type { TaskPayload } from "../tasks/service";
import { fingerprint } from "../tasks/hash";
import { WorkFault } from "../work/service";
import { aiJobs, aiJobRefs, aiJobEvents } from "./schema";
import { insertJob, lockJobQueue, type PreparedJob } from "./store";

export type JobLink = {
  id: string;
  requestHash: string;
  parentFingerprint: string;
  parentId: string;
};
export type JobDelegation = {
  prepared: PreparedJob;
  link: JobLink;
  title: string;
};
export function parentFingerprint(task: TodoistTask) {
  return fingerprint(
    Object.fromEntries(
      Object.entries(task).filter(([key]) => key !== "updated_at"),
    ),
  );
}
export function assertJobParent(
  link: JobLink,
  payload: Pick<TaskPayload, "projectId">,
  parent: TodoistTask,
) {
  if (
    parent.id !== link.parentId ||
    parent.project_id !== payload.projectId ||
    parent.checked ||
    parent.is_deleted ||
    parentFingerprint(parent) !== link.parentFingerprint
  )
    throw new WorkFault("AI_JOB_ORIGIN_CHANGED", 409);
}
export async function linkJob(
  db: Db,
  user: string,
  delegation: JobDelegation,
  operationId: string,
  payload: TaskPayload,
) {
  const { link, prepared } = delegation;
  const origin = prepared.input.origin;
  if (
    !origin ||
    link.id !== prepared.input.key ||
    link.requestHash !== prepared.requestHash ||
    origin.taskId !== link.parentId ||
    origin.contextId !== payload.command.contextId ||
    payload.command.parentId !== origin.taskId ||
    payload.command.fields?.content !== "KI Aufgabe " + link.id ||
    payload.command.action !== "create" ||
    payload.contextRevision === null ||
    !payload.command.contextId
  )
    throw new WorkFault("AI_JOB_ORIGIN_CHANGED", 409);
  await insertJob(db, user, prepared, "linking");
  await db.insert(aiJobRefs).values({
    jobId: link.id,
    contextId: origin.contextId,
    projectId: payload.projectId,
    taskId: origin.taskId,
    title: delegation.title,
    parentFingerprint: link.parentFingerprint,
    contextRevision: payload.contextRevision,
    credentialVersion: payload.credentialVersion,
    integrationRevision: payload.integrationRevision,
    operationId,
  });
}
export async function finishJobLink(
  db: Db,
  user: string,
  link: JobLink,
  operationId: string,
  status: string,
  task: TodoistTask | undefined,
  code: string | null,
) {
  await lockJobQueue(db);
  const [row] = await db
    .select({ job: aiJobs, ref: aiJobRefs })
    .from(aiJobs)
    .innerJoin(aiJobRefs, eq(aiJobRefs.jobId, aiJobs.id))
    .where(
      and(
        eq(aiJobs.id, link.id),
        eq(aiJobs.userId, user),
        eq(aiJobRefs.operationId, operationId),
      ),
    );
  if (!row || row.ref.state === "verified") return;
  const success =
    status === "succeeded" &&
    task &&
    task.id !== row.ref.taskId &&
    task.parent_id === row.ref.taskId &&
    task.project_id === row.ref.projectId &&
    task.content === "KI Aufgabe " + link.id &&
    !task.checked &&
    !task.is_deleted;
  let state: "verified" | "unknown" | "error" = "error";
  if (["unknown", "partial"].includes(status)) state = "unknown";
  if (success) state = "verified";
  const revision = row.job.revision + 1;
  const failure = code ?? "AI_JOB_REFERENCE_UNCONFIRMED";
  await db
    .update(aiJobRefs)
    .set({
      state,
      ...(success ? { childId: task.id } : {}),
      updatedAt: new Date(),
    })
    .where(eq(aiJobRefs.jobId, link.id));
  await db
    .update(aiJobs)
    .set(
      success
        ? {
            status: "queued",
            revision,
            code: null,
            queueOrder: sql`nextval(pg_get_serial_sequence('ai_jobs','queue_order'))`,
            queuedAt: new Date(),
            updatedAt: new Date(),
          }
        : { status: "error", revision, code: failure, updatedAt: new Date() },
    )
    .where(eq(aiJobs.id, link.id));
  const eventKey = randomUUID();
  await db.insert(aiJobEvents).values({
    id: randomUUID(),
    jobId: link.id,
    key: eventKey,
    requestHash: fingerprint({ operationId, status, revision }),
    kind: success ? "reference_verified" : "reference_failed",
    revision,
    data: { operationId, state, code: success ? null : failure },
  });
}
