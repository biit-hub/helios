import { and, eq, desc, lt, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  entryKey,
  type PlanEntry,
  type ReviewItem,
  type RoutineCommand,
} from "@helios/contracts";
import { dailyPlans, planHistory, planOperations } from "../planning/schema";
import { reviewFeedback, type RoutineDay, type RoutineContext } from "./schema";
import type { Db, Database } from "../planning/store";
import { AuthFault } from "../identity/policy";
import { WorkFault } from "../work/service";
import { createTaskService } from "../tasks/service";
import type { WorkConfig } from "../work/config";
import type { TodoistReader } from "../work/todoist";
import { feedbackView, advanceContext } from "./store";
export function reviewEntries(r: RoutineContext): PlanEntry[] {
  const p = r.reviewSnapshot;
  if (!p) return [];
  return [
    ...new Map(
      [...p.entries, ...(p.agenda?.extra ?? [])].map((e) => [entryKey(e), e]),
    ).values(),
  ];
}
export async function freezeReview(db: Db, d: RoutineDay, r: RoutineContext) {
  if (r.reviewHistoryId || r.steps.review !== "open") return r;
  const [p] = await db
    .select()
    .from(dailyPlans)
    .where(
      and(
        eq(dailyPlans.contextId, r.contextId),
        lt(dailyPlans.day, d.day),
        eq(dailyPlans.status, "confirmed"),
      ),
    )
    .orderBy(desc(dailyPlans.day))
    .limit(1);
  if (!p) return r;
  const [h] = await db
    .select()
    .from(planHistory)
    .where(
      and(
        eq(planHistory.planId, p.id),
        sql.raw("snapshot->>'status'='confirmed'"),
      ),
    )
    .orderBy(desc(planHistory.revision))
    .limit(1);
  if (!h) throw new WorkFault("REVIEW_SOURCE_UNKNOWN", 409);
  return advanceContext(db, r, {
    reviewPlanId: p.id,
    reviewHistoryId: h.id,
    reviewSnapshot: h.snapshot,
  });
}
export async function verifiedClose(db: Db, contextId: string, key: string) {
  const rows = await db
    .select()
    .from(planOperations)
    .where(
      and(
        eq(planOperations.contextId, contextId),
        eq(planOperations.kind, "task"),
        eq(planOperations.status, "succeeded"),
      ),
    );
  return (
    rows.find((op) => {
      const payload = op.payload as {
        command?: { action?: string };
        source?: import("@helios/contracts").TodoistTask;
      } | null;
      return (
        payload?.command?.action === "close" &&
        payload.source &&
        entryKey({ taskId: payload.source.id, source: payload.source }) === key
      );
    }) ?? null
  );
}
export async function effectiveFeedback(db: Db, r: RoutineContext) {
  if (!r.reviewPlanId) return [];
  const rows = await db
    .select()
    .from(reviewFeedback)
    .where(eq(reviewFeedback.planId, r.reviewPlanId))
    .orderBy(desc(reviewFeedback.updatedAt));
  const selected = new Map<string, typeof reviewFeedback.$inferSelect>();
  for (const f of rows)
    if (!selected.has(f.entryKey)) selected.set(f.entryKey, f);
  for (const f of rows)
    if (f.routineContextId === r.id) selected.set(f.entryKey, f);
  return [...selected.values()];
}
export async function readReview(
  database: Database,
  config: WorkConfig,
  reader: TodoistReader,
  h: Headers,
  r: RoutineContext,
): Promise<ReviewItem[]> {
  const own = await feedbackView(
    database.db,
    await effectiveFeedback(database.db, r),
  );
  const proofs = await database.db
    .select()
    .from(planOperations)
    .where(
      and(
        eq(planOperations.contextId, r.contextId),
        eq(planOperations.kind, "task"),
        eq(planOperations.status, "succeeded"),
      ),
    );
  const tasks = createTaskService(database, config, reader);
  const result: ReviewItem[] = [];
  for (const e of reviewEntries(r)) {
    let native: ReviewItem["native"] = "unknown",
      basis: string | null = null,
      code: string | null = null;
    try {
      const inspected = await tasks.inspect(h, r.contextId, e.taskId);
      basis = inspected.basis;
      native =
        entryKey({ taskId: inspected.task.id, source: inspected.task }) !==
        entryKey(e)
          ? "instance_changed"
          : inspected.task.checked
            ? "completed"
            : "active";
    } catch (error) {
      if (error instanceof AuthFault) throw error;
      code = error instanceof WorkFault ? error.code : "REVIEW_SOURCE_UNKNOWN";
    }
    const proof = proofs.find((op) => {
      const p = op.payload as {
        command?: { action?: string };
        source?: import("@helios/contracts").TodoistTask;
      } | null;
      return (
        p?.command?.action === "close" &&
        p.source &&
        entryKey({ taskId: p.source.id, source: p.source }) === entryKey(e)
      );
    });
    if (proof) native = "completed";
    const feedback = own.find((f) => f.entryKey === entryKey(e)) ?? null;
    result.push({
      entry: e,
      entryKey: entryKey(e),
      native,
      basis:
        basis ??
        (proof?.payload?.command as { basis?: string } | undefined)?.basis ??
        null,
      code,
      feedback,
    });
  }
  return result;
}
export async function saveFeedback(
  db: Db,
  r: RoutineContext,
  key: string,
  status: "unknown" | "not_started" | "partial" | "completed",
  patch: Partial<typeof reviewFeedback.$inferInsert> = {},
) {
  const [old] = await db
    .select()
    .from(reviewFeedback)
    .where(
      and(
        eq(reviewFeedback.routineContextId, r.id),
        eq(reviewFeedback.entryKey, key),
      ),
    );
  if (old?.operationId || old?.status === "completed")
    throw new WorkFault("REVIEW_OUTCOME_UNRESOLVED", 409);
  const value = { status, updatedAt: new Date(), ...patch };
  if (old) {
    await db
      .update(reviewFeedback)
      .set(value)
      .where(eq(reviewFeedback.id, old.id));
    return { ...old, ...value };
  }
  const [row] = await db
    .insert(reviewFeedback)
    .values({
      id: randomUUID(),
      routineContextId: r.id,
      planId: r.reviewPlanId!,
      entryKey: key,
      ...value,
    })
    .returning();
  return row!;
}
export function selectEntries(r: RoutineContext, input: RoutineCommand) {
  const keys = input.items?.map((i) => i.entryKey) ?? input.entryKeys;
  if (!keys?.length || new Set(keys).size !== keys.length)
    throw new WorkFault("INVALID_REQUEST", 400);
  const entries = reviewEntries(r);
  return keys.map((key) => {
    const e = entries.find((e) => entryKey(e) === key);
    if (!e) throw new WorkFault("REVIEW_INSTANCE_CONFLICT", 409);
    return e;
  });
}
