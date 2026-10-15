import { and, or, eq, asc, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type {
  RoutineCommand,
  RoutineView,
  RoutineContextView,
  ReviewFeedbackView,
} from "@helios/contracts";
import type { Db } from "../planning/store";
import { localDay } from "../planning/selection";
import { aiDrafts } from "../ai/schema";
import { contexts } from "../work/schema";
import { planOperations, dailyPlans } from "../planning/schema";
import { WorkFault } from "../work/service";
import {
  routineDays,
  routineContexts,
  routineEvents,
  reviewFeedback,
  type RoutineDay,
  type RoutineContext,
} from "./schema";
export const conflict = () => new WorkFault("ROUTINE_CONFLICT", 409);
export async function ownedDay(
  db: Db,
  user: string,
  id: string,
  revision?: number,
) {
  const [d] = await db
    .select()
    .from(routineDays)
    .where(and(eq(routineDays.id, id), eq(routineDays.userId, user)));
  if (!d) throw new WorkFault("ROUTINE_NOT_FOUND", 404);
  if (revision !== undefined && d.revision !== revision) throw conflict();
  return d;
}
export function current(d: RoutineDay) {
  if (d.day !== localDay(new Date(), d.timezone))
    throw new WorkFault("ROUTINE_DAY_CHANGED", 409);
}
export async function ownedContext(
  db: Db,
  d: RoutineDay,
  id: string,
  revision?: number,
  active = false,
) {
  const [r] = await db
    .select()
    .from(routineContexts)
    .where(
      and(
        eq(routineContexts.routineId, d.id),
        eq(routineContexts.contextId, id),
      ),
    );
  const [c] = await db
    .select()
    .from(contexts)
    .where(and(eq(contexts.id, id), eq(contexts.userId, d.userId)));
  if (!r?.selected || !c || (active && !c.active))
    throw new WorkFault("CONTEXT_NOT_FOUND", 404);
  if (revision !== undefined && r.revision !== revision) throw conflict();
  return { r, c };
}
export async function advanceDay(
  db: Db,
  d: RoutineDay,
  patch: Partial<typeof routineDays.$inferInsert> = {},
) {
  const [next] = await db
    .update(routineDays)
    .set({ ...patch, revision: d.revision + 1 })
    .where(and(eq(routineDays.id, d.id), eq(routineDays.revision, d.revision)))
    .returning();
  if (!next) throw conflict();
  return next;
}
export async function advanceContext(
  db: Db,
  r: RoutineContext,
  patch: Partial<typeof routineContexts.$inferInsert>,
) {
  const [next] = await db
    .update(routineContexts)
    .set({ ...patch, revision: r.revision + 1 })
    .where(
      and(
        eq(routineContexts.id, r.id),
        eq(routineContexts.revision, r.revision),
      ),
    )
    .returning();
  if (!next) throw conflict();
  return next;
}
export async function record(
  db: Db,
  d: RoutineDay,
  key: string,
  hash: string,
  event: string,
  result: Record<string, unknown>,
  contextId: string | null = null,
  detail: Record<string, unknown> = {},
) {
  await db.insert(routineEvents).values({
    id:
      typeof result.decisionId === "string" ? result.decisionId : randomUUID(),
    userId: d.userId,
    routineId: d.id,
    contextId,
    key,
    requestHash: hash,
    event,
    detail,
    result,
  });
}
export async function feedbackView(
  db: Db,
  rows: (typeof reviewFeedback.$inferSelect)[],
): Promise<ReviewFeedbackView[]> {
  const ids = rows.flatMap((r) => (r.operationId ? [r.operationId] : []));
  const ops = ids.length
    ? await db
        .select()
        .from(planOperations)
        .where(inArray(planOperations.id, ids))
    : [];
  return rows.map((r) => {
    const op = ops.find((o) => o.id === r.operationId);
    return {
      id: r.id,
      entryKey: r.entryKey,
      status: r.status,
      requested: r.requested,
      operationId: r.operationId,
      draftId: r.draftId,
      confirmedAt: r.confirmedAt?.toISOString() ?? null,
      operationStatus: op?.status ?? null,
      code: op?.code ?? null,
    };
  });
}
export async function view(db: Db, d: RoutineDay): Promise<RoutineView> {
  const rows = await db
    .select()
    .from(routineContexts)
    .where(eq(routineContexts.routineId, d.id))
    .orderBy(asc(routineContexts.position));
  const result: RoutineContextView[] = [];
  for (const r of rows) {
    const feedback = await feedbackView(
      db,
      await db
        .select()
        .from(reviewFeedback)
        .where(eq(reviewFeedback.routineContextId, r.id)),
    );
    const steps = { ...r.steps };
    if (steps.planning === "done") {
      const [p] = await db
        .select()
        .from(dailyPlans)
        .where(
          and(eq(dailyPlans.contextId, r.contextId), eq(dailyPlans.day, d.day)),
        );
      if (p?.status !== "confirmed" || p.agenda?.pending.length)
        steps.planning = "open";
    }
    result.push({
      id: r.id,
      contextId: r.contextId,
      selected: r.selected,
      position: r.position,
      revision: r.revision,
      steps,
      reviewPlan: r.reviewSnapshot,
      reviewHistoryId: r.reviewHistoryId,
      feedback,
    });
  }
  const native = await db
    .select({ id: planOperations.id })
    .from(planOperations)
    .where(
      and(
        eq(planOperations.userId, d.userId),
        or(
          sql`payload->'routineLink'->>'dayId'=${d.id}`,
          rows.some((r) => r.selected)
            ? inArray(
                planOperations.contextId,
                rows.filter((r) => r.selected).map((r) => r.contextId),
              )
            : undefined,
        ),
        inArray(planOperations.status, [
          "queued",
          "running",
          "partial",
          "unknown",
        ]),
      ),
    );
  const linkedDrafts = await db
    .select({ operationId: aiDrafts.operationId })
    .from(reviewFeedback)
    .innerJoin(
      routineContexts,
      eq(reviewFeedback.routineContextId, routineContexts.id),
    )
    .innerJoin(aiDrafts, eq(reviewFeedback.draftId, aiDrafts.id))
    .where(eq(routineContexts.routineId, d.id));
  const linkedIds = linkedDrafts.flatMap((x) =>
    x.operationId ? [x.operationId] : [],
  );
  const pendingProgress = linkedIds.length
    ? await db
        .select({ id: planOperations.id })
        .from(planOperations)
        .where(
          and(
            inArray(planOperations.id, linkedIds),
            inArray(planOperations.status, [
              "queued",
              "running",
              "partial",
              "unknown",
            ]),
          ),
        )
    : [];
  const successes = await db
    .select({ id: planOperations.id })
    .from(planOperations)
    .where(
      and(
        eq(planOperations.userId, d.userId),
        eq(planOperations.status, "succeeded"),
        sql`payload->'routineLink'->>'dayId'=${d.id}`,
        sql.raw("payload->'routineLink'->>'kind'='inbox'"),
      ),
    );
  return {
    id: d.id,
    pendingReviews: (
      await db
        .select()
        .from(routineEvents)
        .where(
          and(
            eq(routineEvents.routineId, d.id),
            eq(routineEvents.event, "review-close"),
          ),
        )
    )
      .filter((e) =>
        (e.detail.items as { feedbackId: string }[] | undefined)?.some((item) =>
          result.some((rc) =>
            rc.feedback.some(
              (f) =>
                f.id === item.feedbackId &&
                f.requested === "completed" &&
                !f.operationId &&
                f.status === "unknown",
            ),
          ),
        ),
      )
      .map((e) => ({ key: e.key, command: e.detail.command as RoutineCommand }))
      .filter((e) => !!e.command),
    day: d.day,
    timezone: d.timezone,
    startedAt: d.startedAt.toISOString(),
    revision: d.revision,
    steps: d.steps,
    cursor: d.cursor,
    deferredIds: d.deferredIds,
    inboxSuccesses: successes.length,
    contexts: result,
    complete:
      Object.values(d.steps).every((s) => s === "done") &&
      result
        .filter((r) => r.selected)
        .every((r) => Object.values(r.steps).every((s) => s === "done")) &&
      !native.length &&
      !pendingProgress.length,
  };
}
export function requireRevision(input: RoutineCommand) {
  if (input.id === undefined || input.revision === undefined)
    throw new WorkFault("INVALID_REQUEST", 400);
  return { id: input.id, revision: input.revision };
}
