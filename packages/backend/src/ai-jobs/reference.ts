import { planOperations } from "../planning/schema";
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
        or(
          eq(aiJobRefs.childId, task.id),
          and(
            eq(aiJobRefs.contextId, contextId),
            eq(aiJobRefs.projectId, task.project_id),
            isNull(aiJobRefs.childId),
            eq(aiJobRefs.taskId, task.parent_id ?? ""),
            sql`${task.content} = 'KI Aufgabe ' || ${aiJobs.id}::text`,
          ),
        ),
      ),
    );
  if (row) throw new WorkFault("AI_JOB_REFERENCE_ONLY", 409);
  // The E4 journal deliberately survives local aggregate deletion. Its verified
  // native child ID keeps an existing pure reference out of E6 afterwards.
  const [historical] = await db
    .select({ id: planOperations.id })
    .from(planOperations)
    .where(
      and(
        eq(planOperations.userId, userId),
        eq(planOperations.kind, "task"),
        sql`${planOperations.payload}->'jobLink' IS NOT NULL`,
        sql`${planOperations.result}->'task'->>'id' = ${task.id}`,
      ),
    )
    .limit(1);
  if (historical) throw new WorkFault("AI_JOB_REFERENCE_ONLY", 409);
}
