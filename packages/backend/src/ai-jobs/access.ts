import { createHash } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import type { Db } from "../planning/store";
import { WorkFault } from "../work/service";
import { planOperations } from "../planning/schema";
import { aiJobs, aiJobRefs, aiJobArtifacts } from "./schema";
import { lockJobQueue, ownedJob, jobConflict } from "./store";
import type { AiJobQueueCommand } from "@helios/contracts";

export async function jobArtifact(
  db: Db,
  user: string,
  jobId: string,
  id: string,
) {
  await ownedJob(db, user, jobId);
  const [file] = await db
    .select()
    .from(aiJobArtifacts)
    .where(and(eq(aiJobArtifacts.id, id), eq(aiJobArtifacts.jobId, jobId)));
  if (
    !file ||
    file.sha256 !== createHash("sha256").update(file.data).digest("hex") ||
    file.size !== file.data.length
  )
    throw new WorkFault("AI_JOB_NOT_FOUND", 404);
  return file;
}
export async function deleteJob(
  db: Db,
  user: string,
  input: AiJobQueueCommand,
) {
  await lockJobQueue(db);
  const job = await ownedJob(db, user, input.id);
  if (job.revision !== input.revision) throw jobConflict();
  if (["queued", "running", "linking"].includes(job.status))
    throw new WorkFault("AI_JOB_DELETE_BLOCKED", 409);
  const [ref] = await db
    .select()
    .from(aiJobRefs)
    .where(eq(aiJobRefs.jobId, job.id));
  if (ref) {
    const ids = [
      ref.operationId,
      ...(ref.closeOperationId ? [ref.closeOperationId] : []),
    ];
    const [pending] = await db
      .select({ id: planOperations.id })
      .from(planOperations)
      .where(
        and(
          inArray(planOperations.id, ids),
          inArray(planOperations.status, ["queued", "running"]),
        ),
      );
    if (pending) throw new WorkFault("AI_JOB_DELETE_BLOCKED", 409);
  }
  // Only this owned aggregate may be removed. The E4 journal is retained and its
  // admission/execution guards refuse later native writes for a removed job.
  await db.delete(aiJobs).where(eq(aiJobs.id, job.id));
}
export async function jobProblems(db: Db, user: string) {
  const rows = await db
    .select({ id: aiJobs.id, code: aiJobs.code, updatedAt: aiJobs.updatedAt })
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.userId, user),
        or(
          eq(aiJobs.status, "error"),
          eq(aiJobs.code, "AI_JOB_CLOSE_UNCONFIRMED"),
        ),
      ),
    );
  return rows.map((row) => ({
    ...row,
    updatedAt: row.updatedAt.toISOString(),
  }));
}
