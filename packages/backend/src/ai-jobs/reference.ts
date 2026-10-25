import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { TodoistTask } from "@helios/contracts";
import type { Db } from "../planning/store";
import { aiJobs, aiJobRefs } from "./schema";
import { WorkFault } from "../work/service";

export async function referenceForTask(
  db: Db,
  userId: string,
  contextId: string,
  taskId: string,
) {
  const [row] = await db
    .select({ id: aiJobs.id })
    .from(aiJobRefs)
    .innerJoin(aiJobs, eq(aiJobs.id, aiJobRefs.jobId))
    .where(
      and(
        eq(aiJobs.userId, userId),
        eq(aiJobRefs.contextId, contextId),
        eq(aiJobRefs.childId, taskId),
      ),
    );
  return row?.id ?? null;
}
/** Pure reference children must not enter the independent E6 enrichment pipeline. */
export async function assertOrdinaryAiTask(
  db: Db,
  userId: string,
  contextId: string,
  task: TodoistTask,
) {
  const [row] = await db
    .select({ id: aiJobs.id })
    .from(aiJobRefs)
    .innerJoin(aiJobs, eq(aiJobs.id, aiJobRefs.jobId))
    .where(
      and(
        eq(aiJobs.userId, userId),
        eq(aiJobRefs.contextId, contextId),
        eq(aiJobRefs.projectId, task.project_id),
        or(
          eq(aiJobRefs.childId, task.id),
          and(
            isNull(aiJobRefs.childId),
            eq(aiJobRefs.taskId, task.parent_id ?? ""),
            sql`${task.content} = 'KI Aufgabe ' || ${aiJobs.id}::text`,
          ),
        ),
      ),
    );
  if (row) throw new WorkFault("AI_JOB_REFERENCE_ONLY", 409);
}
