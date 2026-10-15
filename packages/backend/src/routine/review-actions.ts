import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  entryKey,
  routineCommand,
  type RoutineCommand,
  type PlanEntry,
} from "@helios/contracts";
import { createIdentityService } from "../identity/service";
import { taskScope, createTaskService } from "../tasks/service";
import { aiDrafts } from "../ai/schema";
import { WorkFault } from "../work/service";
import type { Database, Db } from "../planning/store";
import type { WorkConfig } from "../work/config";
import type { TodoistReader } from "../work/todoist";
import {
  reviewFeedback,
  routineContexts,
  type RoutineDay,
  type RoutineContext,
} from "./schema";
import { ownedContext, advanceContext, ownedDay, current } from "./store";
import { saveFeedback, selectEntries, verifiedClose } from "./review";
import type { LocalRoutineCommand } from "./service";
type Decision = {
  decisionId: string;
  id: string;
  contextId: string;
  historyId: string;
  items: {
    entryKey: string;
    taskId: string;
    basis: string;
    key: string;
    feedbackId: string;
    acknowledgeHierarchy: boolean;
  }[];
};
export function createRoutineReview(
  database: Database,
  config: WorkConfig,
  reader: TodoistReader,
  local: LocalRoutineCommand,
) {
  const identity = createIdentityService(database, config);
  const tasks = createTaskService(database, config, reader);
  async function handle(action: string, h: Headers, raw: unknown) {
    routineCommand.parse(raw);
    const result = await local(action, h, raw, async (db, d, i) => {
      if (!i.contextId || i.contextRevision === undefined)
        throw new WorkFault("INVALID_REQUEST", 400);
      const { r } = await ownedContext(
        db,
        d,
        i.contextId,
        i.contextRevision,
        true,
      );
      if (!r.reviewHistoryId || !r.reviewPlanId)
        throw new WorkFault("REVIEW_SOURCE_UNKNOWN", 409);
      const entries = selectEntries(r, i);
      if (action === "feedback") {
        await recordFeedback(db, d, r, i, entries);
        return {};
      }
      if (!i.acknowledgeDestructive || !i.items)
        throw new WorkFault("CONFIRMATION_REQUIRED", 409);
      const decisionId = randomUUID();
      const items: Decision["items"] = [];
      for (const entry of entries) {
        const chosen = i.items.find((x) => x.entryKey === entryKey(entry))!;
        const [existing] = await db
          .select()
          .from(reviewFeedback)
          .where(
            and(
              eq(reviewFeedback.routineContextId, r.id),
              eq(reviewFeedback.entryKey, chosen.entryKey),
            ),
          );
        if (existing?.status === "completed") continue;
        const f = await saveFeedback(db, r, chosen.entryKey, "unknown", {
          requested: "completed",
          confirmedAt: null,
          draftId: null,
        });
        items.push({
          entryKey: chosen.entryKey,
          taskId: entry.taskId,
          basis: chosen.basis,
          key: randomUUID(),
          feedbackId: f.id,
          acknowledgeHierarchy: i.acknowledgeHierarchy,
        });
      }
      await advanceContext(db, r, {});
      return {
        command: i,
        decisionId,
        contextId: r.contextId,
        historyId: r.reviewHistoryId,
        items,
      };
    });
    if (action !== "review-close") return result;
    const decision = result as unknown as Decision;
    const outcomes: Record<string, unknown>[] = [];
    for (const item of decision.items) {
      outcomes.push(await applyItem(h, decision, item));
    }
    return { ...result, outcomes };
  }
  async function applyItem(
    h: Headers,
    decision: Decision,
    item: Decision["items"][number],
  ) {
    try {
      const f = await identity.withActive(h, {}, async (db, user) => {
        const d = await ownedDay(db, user, decision.id);
        const [row] = await db
          .select()
          .from(reviewFeedback)
          .where(eq(reviewFeedback.id, item.feedbackId));
        const scope = await taskScope(db, user, decision.contextId);
        return { d, row, scope };
      });
      if (f.row?.operationId || f.row?.status === "completed") {
        return {
          entryKey: item.entryKey,
          operationId: f.row.operationId,
          status: f.row.status,
        };
      }
      const proof = await verifiedClose(
        database.db,
        decision.contextId,
        item.entryKey,
      );
      if (proof) {
        await identity.withActive(h, { mutation: true }, async (db, user) => {
          const d = await ownedDay(db, user, decision.id);
          current(d);
          await ownedContext(db, d, decision.contextId, undefined, true);
          const updated = await db
            .update(reviewFeedback)
            .set({
              status: "completed",
              operationId: proof.id,
              confirmedAt: new Date(),
              evidence: {
                kind: "verified-journal-close",
                operationId: proof.id,
              },
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(reviewFeedback.id, item.feedbackId),
                eq(reviewFeedback.requested, "completed"),
                eq(reviewFeedback.status, "unknown"),
              ),
            )
            .returning({ id: reviewFeedback.id });
          if (!updated.length)
            throw new WorkFault("REVIEW_INSTANCE_CONFLICT", 409);
        });
        return {
          entryKey: item.entryKey,
          status: "completed",
          operationId: proof.id,
        };
      }
      const inspected = await tasks.inspect(h, decision.contextId, item.taskId);
      if (
        entryKey({ taskId: item.taskId, source: inspected.task }) !==
        item.entryKey
      )
        throw new WorkFault("PLAN_INSTANCE_CHANGED", 409);
      if (inspected.task.checked) {
        await identity.withActive(h, { mutation: true }, async (db, user) => {
          const d = await ownedDay(db, user, decision.id);
          current(d);
          const now = await taskScope(db, user, decision.contextId);
          if (
            now.i.credentialVersion !== f.scope.i.credentialVersion ||
            now.i.revision !== f.scope.i.revision ||
            now.c?.revision !== f.scope.c?.revision
          )
            throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
          const [rc] = await db
            .select()
            .from(routineContexts)
            .where(eq(routineContexts.id, f.row!.routineContextId));
          if (!rc || rc.reviewHistoryId !== decision.historyId)
            throw new WorkFault("REVIEW_INSTANCE_CONFLICT", 409);
          await ownedContext(db, d, decision.contextId, undefined, true);
          const updated = await db
            .update(reviewFeedback)
            .set({
              status: "completed",
              confirmedAt: new Date(),
              evidence: {
                kind: "native-checked",
                entryKey: item.entryKey,
                basis: inspected.basis,
              },
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(reviewFeedback.id, item.feedbackId),
                eq(reviewFeedback.requested, "completed"),
                eq(reviewFeedback.status, "unknown"),
              ),
            )
            .returning({ id: reviewFeedback.id });
          if (!updated.length)
            throw new WorkFault("REVIEW_INSTANCE_CONFLICT", 409);
        });
        return { entryKey: item.entryKey, status: "completed" };
      }
      if (inspected.basis !== item.basis)
        throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
      const queued = await tasks.enqueueRoutine(
        h,
        {
          key: item.key,
          action: "close",
          contextId: decision.contextId,
          taskId: item.taskId,
          basis: item.basis,
          acknowledgeDestructive: true,
          acknowledgeHierarchy: item.acknowledgeHierarchy,
          acknowledgeRecurrenceChange: false,
        },
        {
          kind: "review",
          dayId: decision.id,
          decisionId: decision.decisionId,
          feedbackId: item.feedbackId,
          historyId: decision.historyId,
          entryKey: item.entryKey,
          taskId: item.taskId,
          basis: item.basis,
        },
      );
      return { entryKey: item.entryKey, ...queued, status: "queued" };
    } catch (error) {
      return {
        entryKey: item.entryKey,
        status: "unknown",
        code: error instanceof WorkFault ? error.code : "REVIEW_SOURCE_UNKNOWN",
      };
    }
  }
  return { handle };
}

async function recordFeedback(
  db: Db,
  d: RoutineDay,
  r: RoutineContext,
  i: RoutineCommand,
  entries: PlanEntry[],
) {
  if (!["partial", "not_started"].includes(i.feedback ?? ""))
    throw new WorkFault("INVALID_REQUEST", 400);
  if (i.feedback === "partial" && !i.draftId)
    throw new WorkFault("PROGRESS_DRAFT_REQUIRED", 409);
  for (const entry of entries) {
    if (i.draftId) {
      await requireProgressDraft(db, d, r, i.draftId, entry);
    }
    await saveFeedback(
      db,
      r,
      entryKey(entry),
      i.feedback as "partial" | "not_started",
      {
        requested: i.feedback!,
        confirmedAt: new Date(),
        draftId: i.draftId ?? null,
      },
    );
  }
  await advanceContext(db, r, {});
}

async function requireProgressDraft(
  db: Db,
  d: RoutineDay,
  r: RoutineContext,
  draftId: string,
  entry: PlanEntry,
) {
  const [draft] = await db
    .select()
    .from(aiDrafts)
    .where(
      and(
        eq(aiDrafts.id, draftId),
        eq(aiDrafts.userId, d.userId),
        eq(aiDrafts.contextId, r.contextId),
        eq(aiDrafts.taskId, entry.taskId),
      ),
    );
  if (
    !draft ||
    draft.kind !== "progress" ||
    !draft.source ||
    entryKey({
      taskId: entry.taskId,
      source: draft.source.inspection.task,
    }) !== entryKey(entry)
  )
    throw new WorkFault("REVIEW_INSTANCE_CONFLICT", 409);
}
