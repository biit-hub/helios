import { and, eq } from "drizzle-orm";
import type { TaskCommand } from "@helios/contracts";
import type { Db, Database } from "../planning/store";
import type { TodoistReader } from "../work/todoist";
import type { TaskPayload } from "../tasks/service";
import { WorkFault } from "../work/service";
import { routineEvents, reviewFeedback, routineContexts } from "./schema";
import { ownedDay, ownedContext, current, advanceDay, record } from "./store";
export type RoutineLink =
  | {
      kind: "inbox";
      dayId: string;
      revision: number;
      sourceProjectId: string;
      taskId: string;
      action: "move" | "delete";
      projectId: string | null;
      basis: string;
      requestHash: string;
    }
  | {
      kind: "review";
      dayId: string;
      decisionId: string;
      feedbackId: string;
      entryKey: string;
      historyId: string;
      taskId: string;
      basis: string;
    };
export async function authorizeRoutine(
  db: Db,
  user: string,
  link: RoutineLink,
  command: TaskCommand,
  operationId?: string,
) {
  const d = await ownedDay(db, user, link.dayId);
  if (!operationId) current(d);
  if (link.kind === "inbox") {
    if (
      command.contextId !== null ||
      command.taskId !== link.taskId ||
      command.action !== link.action ||
      command.basis !== link.basis ||
      (command.projectId ?? null) !== link.projectId ||
      command.sectionId ||
      command.parentId ||
      command.fields ||
      command.comment ||
      command.waiting
    )
      throw new WorkFault("ROUTINE_SCOPE_DENIED", 409);
    if (!operationId) {
      current(d);
      if (d.revision !== link.revision)
        throw new WorkFault("ROUTINE_CONFLICT", 409);
    }
    return d;
  }
  const [event] = await db
    .select()
    .from(routineEvents)
    .where(
      and(
        eq(routineEvents.id, link.decisionId),
        eq(routineEvents.userId, user),
        eq(routineEvents.routineId, d.id),
      ),
    );
  const [feedback] = await db
    .select()
    .from(reviewFeedback)
    .where(eq(reviewFeedback.id, link.feedbackId));
  const [rc] = feedback
    ? await db
        .select()
        .from(routineContexts)
        .where(eq(routineContexts.id, feedback.routineContextId))
    : [];
  const decisions = event?.detail.items as
    | { entryKey: string; basis: string; key: string }[]
    | undefined;
  if (
    !event ||
    event.event !== "review-close" ||
    !feedback ||
    !rc ||
    rc.routineId !== d.id ||
    rc.reviewHistoryId !== link.historyId ||
    feedback.entryKey !== link.entryKey ||
    feedback.requested !== "completed" ||
    (feedback.operationId !== null && feedback.operationId !== operationId) ||
    command.action !== "close" ||
    command.contextId !== rc.contextId ||
    command.taskId !== link.taskId ||
    command.basis !== link.basis ||
    !decisions?.some(
      (x) =>
        x.entryKey === link.entryKey &&
        x.basis === link.basis &&
        x.key === command.key,
    ) ||
    command.fields ||
    command.projectId ||
    command.parentId ||
    command.sectionId ||
    command.comment
  )
    throw new WorkFault("ROUTINE_SCOPE_DENIED", 409);
  await ownedContext(db, d, rc.contextId, undefined, true);
  return d;
}
export async function linkRoutine(
  db: Db,
  user: string,
  link: RoutineLink,
  command: TaskCommand,
  operationId: string,
) {
  const d = await authorizeRoutine(db, user, link, command);
  if (link.kind === "inbox") {
    const next = await advanceDay(db, d);
    await record(
      db,
      next,
      command.key,
      link.requestHash,
      "inbox-" + command.action,
      { id: d.id, revision: next.revision, operationId },
      null,
      { taskId: link.taskId },
    );
  } else
    await db
      .update(reviewFeedback)
      .set({ operationId })
      .where(eq(reviewFeedback.id, link.feedbackId));
}
export async function validateRoutineMutation(
  database: Database,
  reader: TodoistReader,
  token: string,
  user: string,
  payload: TaskPayload,
  operationId: string,
) {
  const link = payload.routineLink;
  if (!link) return;
  const d = await authorizeRoutine(
    database.db,
    user,
    link,
    payload.command,
    operationId,
  );
  current(d);
  if (link.kind === "inbox") {
    const p = await reader.project(token, link.sourceProjectId);
    if (
      !p.inbox_project ||
      p.is_deleted ||
      p.is_archived ||
      payload.source?.project_id !== link.sourceProjectId
    )
      throw new WorkFault("ROUTINE_SCOPE_DENIED", 409);
  } else {
    const [feedback] = await database.db
      .select()
      .from(reviewFeedback)
      .where(eq(reviewFeedback.id, link.feedbackId));
    const [rc] = feedback
      ? await database.db
          .select()
          .from(routineContexts)
          .where(eq(routineContexts.id, feedback.routineContextId))
      : [];
    const entries = rc?.reviewSnapshot
      ? [
          ...rc.reviewSnapshot.entries,
          ...(rc.reviewSnapshot.agenda?.extra ?? []),
        ]
      : [];
    const { entryKey } = await import("@helios/contracts");
    const e = entries.find((x) => entryKey(x) === link.entryKey);
    if (
      !e ||
      !payload.source ||
      entryKey({ taskId: payload.source.id, source: payload.source }) !==
        link.entryKey
    )
      throw new WorkFault("PLAN_INSTANCE_CHANGED", 409);
  }
}
export async function finishRoutine(
  db: Db,
  link: RoutineLink,
  operationId: string,
  status: string,
) {
  if (link.kind !== "review") return;
  await db
    .update(reviewFeedback)
    .set({
      status: status === "succeeded" ? "completed" : "unknown",
      confirmedAt: status === "succeeded" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reviewFeedback.id, link.feedbackId),
        eq(reviewFeedback.operationId, operationId),
      ),
    );
}
