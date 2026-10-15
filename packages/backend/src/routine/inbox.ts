import { sql, and, eq } from "drizzle-orm";
import { routineCommand, type InboxCard } from "@helios/contracts";
import { createIdentityService } from "../identity/service";
import {
  createTaskService,
  taskScope,
  tokenFor,
  descendants,
  allowedProject,
} from "../tasks/service";
import { fingerprint } from "../tasks/hash";
import { projectCatalog } from "../work/schema";
import { planOperations } from "../planning/schema";
import { WorkFault } from "../work/service";
import type { Database } from "../planning/store";
import type { WorkConfig } from "../work/config";
import type { TodoistReader } from "../work/todoist";
import { routineDays, routineEvents, type RoutineDay } from "./schema";
import { ownedDay, current } from "./store";
import type { LocalRoutineCommand } from "./service";
export function createRoutineInbox(
  database: Database,
  config: WorkConfig,
  reader: TodoistReader,
  _local: LocalRoutineCommand,
) {
  const identity = createIdentityService(database, config);
  const tasks = createTaskService(database, config, reader);
  async function base(h: Headers) {
    return identity.withActive(h, {}, async (db, user) => {
      const s = await taskScope(db, user, null);
      const [inbox] = await db
        .select()
        .from(projectCatalog)
        .where(
          and(
            eq(projectCatalog.integrationId, s.i.id),
            eq(projectCatalog.credentialVersion, s.i.credentialVersion),
            eq(projectCatalog.available, true),
            eq(projectCatalog.inbox, true),
          ),
        );
      if (!inbox) throw new WorkFault("INBOX_UNAVAILABLE", 409);
      return { ...s, user, projectId: inbox.projectId };
    });
  }
  async function native(h: Headers) {
    const s = await base(h);
    const token = await tokenFor(s.i, config);
    const project = await reader.project(token, s.projectId);
    if (!project.inbox_project || project.is_archived || project.is_deleted)
      throw new WorkFault("INBOX_UNAVAILABLE", 409);
    const rows = await reader.tasks(token, s.projectId);
    await identity.withActive(h, {}, async (db, user) => {
      const now = await taskScope(db, user, null);
      if (
        now.i.credentialVersion !== s.i.credentialVersion ||
        now.i.revision !== s.i.revision
      )
        throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
      await allowedProject(db, now.i, s.projectId);
    });
    return { ...s, rows };
  }
  return {
    async defer(h: Headers, raw: unknown) {
      const input = routineCommand.parse(raw);
      if (!input.taskId || !input.basis)
        throw new WorkFault("INVALID_REQUEST", 400);
      const s = await native(h);
      const task = s.rows.find(
        (t) => t.id === input.taskId && !t.checked && !t.is_deleted,
      );
      if (
        !task ||
        fingerprint({ task, children: descendants(s.rows, task.id) }) !==
          input.basis
      )
        throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
      return _local("inbox-defer", h, raw, async (db, d) => {
        const now = await taskScope(db, d.userId, null);
        if (
          now.i.credentialVersion !== s.i.credentialVersion ||
          now.i.revision !== s.i.revision
        )
          throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
        await db
          .update(routineDays)
          .set({ deferredIds: [...new Set([...d.deferredIds, task.id])] })
          .where(eq(routineDays.id, d.id));
        return { taskId: task.id };
      });
    },
    async read(
      h: Headers,
      d: RoutineDay,
    ): Promise<{
      card: InboxCard;
      deferred: boolean;
      operations: {
        id: string;
        status: string;
        code: string | null;
        taskId: string | null;
      }[];
    }> {
      const s = await native(h);
      const ops = (
        await database.db
          .select()
          .from(planOperations)
          .where(
            and(
              eq(planOperations.userId, s.user),
              eq(planOperations.kind, "task"),
              sql`payload->'routineLink'->>'dayId'=${d.id}`,
              sql.raw("payload->'routineLink'->>'kind'='inbox'"),
            ),
          )
      ).filter(
        (op) =>
          (op.payload?.routineLink as { kind?: string; dayId?: string })
            ?.kind === "inbox" &&
          (op.payload?.routineLink as { dayId?: string })?.dayId === d.id,
      );
      const pending = new Set(
        ops
          .filter((op) =>
            ["queued", "running", "partial", "unknown"].includes(op.status),
          )
          .map((op) => (op.payload?.command as { taskId?: string })?.taskId),
      );
      const task = s.rows.find(
        (t) =>
          !t.checked &&
          !t.is_deleted &&
          !d.deferredIds.includes(t.id) &&
          !pending.has(t.id),
      );
      const children = task ? descendants(s.rows, task.id) : [];
      return {
        card: task
          ? {
              task,
              basis: fingerprint({ task, children }),
              children: children.map((c) => ({ id: c.id, content: c.content })),
            }
          : null,
        deferred: d.deferredIds.length > 0,
        operations: ops.map((o) => ({
          id: o.id,
          status: o.status,
          code: o.code,
          taskId: (o.payload?.command as { taskId?: string })?.taskId ?? null,
        })),
      };
    },
    async mutate(action: string, h: Headers, raw: unknown) {
      const input = routineCommand.parse(raw);
      const hash = fingerprint({ action, input });
      const d = await identity.withActive(
        h,
        { mutation: true },
        async (db, user) => {
          const [old] = await db
            .select()
            .from(routineEvents)
            .where(
              and(
                eq(routineEvents.userId, user),
                eq(routineEvents.key, input.key),
              ),
            );
          if (old) {
            if (old.requestHash !== hash)
              throw new WorkFault("ROUTINE_CONFLICT", 409);
            return { old: old.result, d: null };
          }
          if (!input.id || input.revision === undefined)
            throw new WorkFault("INVALID_REQUEST", 400);
          const d = await ownedDay(db, user, input.id, input.revision);
          current(d);
          return { old: null, d };
        },
      );
      if (d.old) return d.old;
      if (
        !input.taskId ||
        !input.basis ||
        (action === "inbox-move" && !input.projectId)
      )
        throw new WorkFault("INVALID_REQUEST", 400);
      const s = await native(h);
      if (action === "inbox-move" && input.projectId === s.projectId)
        throw new WorkFault("PROJECT_NOT_ASSIGNABLE", 409);
      if (!s.rows.some((t) => t.id === input.taskId))
        throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
      return tasks.enqueueRoutine(
        h,
        {
          key: input.key,
          action: action === "inbox-move" ? "move" : "delete",
          contextId: null,
          taskId: input.taskId,
          basis: input.basis,
          ...(action === "inbox-move" ? { projectId: input.projectId } : {}),
          acknowledgeDestructive: input.acknowledgeDestructive,
          acknowledgeHierarchy: input.acknowledgeHierarchy,
          acknowledgeRecurrenceChange: false,
        },
        {
          kind: "inbox",
          dayId: d.d!.id,
          revision: d.d!.revision,
          sourceProjectId: s.projectId,
          taskId: input.taskId,
          action: action === "inbox-move" ? "move" : "delete",
          projectId: input.projectId ?? null,
          basis: input.basis,
          requestHash: hash,
        },
      );
    },
  };
}
