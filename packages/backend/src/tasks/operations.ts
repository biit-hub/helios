import { randomUUID } from "node:crypto";
import { eq, and, sql } from "drizzle-orm";
import type { TodoistTask } from "@helios/contracts";
import { createIdentityService } from "../identity/service";
import { WorkFault } from "../work/service";
import { createTodoistReader, TodoistFault } from "../work/todoist";
import type { TodoistReader } from "../work/todoist";
import type { WorkConfig } from "../work/config";
import { planOperations, planSteps } from "../planning/schema";
import {
  taskProjections,
  integrationProblems,
  integrations,
  contexts,
} from "../work/schema";
import type { Database } from "../planning/store";
import {
  taskScope,
  tokenFor,
  allowedProject,
  fingerprint,
  descendants,
} from "./service";
import type { TaskPayload } from "./service";
import {
  fieldPatch,
  matchesFields,
  createTaskWriter,
  TaskRateLimit,
} from "./todoist";
import type { TaskWriter } from "./todoist";
import { patchWaiting } from "./waiting";
import { finishPlanLink } from "../planning/agenda-store";
import { validatePlanAddition } from "../planning/agenda-source";
type Operation = typeof planOperations.$inferSelect;
type Progress = {
  effects?: Record<string, unknown>[];
  children?: TodoistTask[];
  task?: TodoistTask;
  stage?: string;
  pending?: {
    kind: string;
    body?: Record<string, unknown>;
    path: string;
    before?: TodoistTask;
    acknowledged?: boolean;
    externalId?: string;
    requestId?: string;
  };
  sections?: string[];
};
export function createTaskExecutor(
  database: Database,
  config: WorkConfig,
  reader: TodoistReader = createTodoistReader(fetch, config.TODOIST_ORIGIN),
  writer: TaskWriter = createTaskWriter(fetch, config.TODOIST_ORIGIN),
) {
  const identity = createIdentityService(database, config);
  return async function execute(op: Operation) {
    const payload = op.payload as unknown as TaskPayload;
    let progress: Progress = (op.result ?? {}) as Progress;
    const command = payload.command;
    async function save(patch: Partial<Progress>) {
      if (
        "pending" in patch &&
        !patch.pending &&
        progress.pending &&
        !("effects" in patch)
      )
        patch.effects = [
          ...(progress.effects ?? []),
          {
            kind: progress.pending.kind,
            requestId: progress.pending.requestId,
            status: "verified",
            externalId: progress.pending.externalId ?? null,
          },
        ];
      progress = { ...progress, ...patch };
      await database.db
        .update(planOperations)
        .set({
          result: progress as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(planOperations.id, op.id));
    }
    async function authorize() {
      return identity.withOperationSession(
        op.sessionId,
        op.userId,
        async (db) => {
          const s = await taskScope(db, op.userId, op.contextId);
          if (
            s.i.credentialVersion !== payload.credentialVersion ||
            s.i.revision !== payload.integrationRevision ||
            (s.c?.revision ?? null) !== payload.contextRevision ||
            (s.c && s.c.projectId !== payload.projectId)
          )
            throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
          if (op.intentExpiresAt <= new Date())
            throw new WorkFault("INTENT_EXPIRED", 409);
          if (
            s.i.state === "rate_limit" &&
            s.i.nextAllowedAt &&
            s.i.nextAllowedAt > new Date()
          )
            throw new TaskRateLimit(
              Math.ceil((s.i.nextAllowedAt.getTime() - Date.now()) / 1000),
            );
          await allowedProject(db, s.i, payload.projectId);
          return s;
        },
      );
    }
    async function project(token: string, id: string) {
      const p = await reader.project(token, id);
      if (p.is_deleted || p.is_archived)
        throw new WorkFault("PROJECT_NOT_ASSIGNABLE", 409);
      return p;
    }
    async function verifyPending(token: string): Promise<boolean> {
      const pending = progress.pending;
      if (!pending) return true;
      if (pending.kind === "create") {
        if (!pending.externalId) return false;
        const t = await reader.task(token, pending.externalId);
        if (
          t.project_id !== payload.projectId ||
          !matchesFields(t, pending.body ?? {})
        )
          return false;
        await save({ task: t, pending: undefined, stage: "done" });
        return true;
      }
      if (pending.kind === "comment") {
        if (!pending.externalId) return false;
        const comments = await reader.comments(token, command.taskId!);
        if (
          !comments.some(
            (c) => c.id === pending.externalId && c.content === command.comment,
          )
        )
          return false;
        await save({ pending: undefined, stage: "done" });
        return true;
      }
      if (pending.kind === "section") {
        const name = String(pending.body?.name);
        const sections = await reader.sections(token, payload.projectId);
        const matching = sections.filter((s) => s.name === name);
        if (matching.length !== 1) return false;
        await save({
          pending: undefined,
          sections: [...(progress.sections ?? []), name],
        });
        return true;
      }
      if (pending.kind === "delete") {
        try {
          await reader.task(token, command.taskId!);
          return false;
        } catch (e) {
          if (
            pending.acknowledged &&
            e instanceof TodoistFault &&
            e.code === "task_unavailable"
          ) {
            await save({ pending: undefined, stage: "done" });
            return true;
          }
          throw e;
        }
      }
      const t = await reader.task(token, command.taskId!);
      if (pending.kind === "close") {
        if (
          pending.before?.due?.is_recurring &&
          t.due?.is_recurring &&
          Date.parse(t.due.date) > Date.parse(pending.before.due.date) &&
          fingerprint({ ...t, due: null, updated_at: null }) ===
            fingerprint({ ...pending.before, due: null, updated_at: null })
        ) {
          await save({
            task: t,
            pending: undefined,
            stage: "recurrence-advanced",
          });
          return true;
        }
        if (t.checked && !t.is_deleted && !pending.before?.due?.is_recurring) {
          await save({ task: t, pending: undefined, stage: "done" });
          return true;
        }
        return false;
      }
      if (pending.kind === "update") {
        if (!matchesFields(t, pending.body ?? {})) return false;
      }
      if (pending.kind === "move") {
        const b = pending.body ?? {};
        if (b.project_id && t.project_id !== b.project_id) return false;
        if (b.section_id && t.section_id !== b.section_id) return false;
        if (b.parent_id && t.parent_id !== b.parent_id) return false;
        if (!b.parent_id && t.parent_id) return false;
      }
      const expectedChildren = progress.children ?? payload.children;
      const actualChildren = descendants(
        await reader.tasks(token, t.project_id),
        t.id,
      );
      if (pending.kind === "move") {
        const transformed = expectedChildren.map((child) => ({
          ...child,
          ...(pending.body?.section_id
            ? { section_id: String(pending.body.section_id) }
            : {}),
          ...(pending.body?.project_id
            ? { project_id: String(pending.body.project_id), section_id: null }
            : {}),
        }));
        const basis = (rows: TodoistTask[]) =>
          rows.map(({ updated_at, ...rest }) => {
            void updated_at;
            return rest;
          });
        if (
          fingerprint(basis(transformed)) !== fingerprint(basis(actualChildren))
        )
          throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
      }
      await save({
        task: t,
        children: actualChildren,
        pending: undefined,
        stage:
          pending.kind === "move" && command.action === "close"
            ? progress.stage === "recurrence-advanced"
              ? "done"
              : "moved"
            : command.action === "wait"
              ? "waiting-description"
              : "done",
      });
      return true;
    }
    async function checkFun(token: string) {
      const labels =
        command.fields?.labels ??
        (command.action === "move" ? payload.source?.labels : undefined);
      if (
        command.action === "move" &&
        command.projectId &&
        [payload.source, ...payload.children].some((t) =>
          t?.labels.includes("fun"),
        )
      ) {
        const [target] = await database.db
          .select()
          .from(contexts)
          .where(
            and(
              eq(contexts.userId, op.userId),
              eq(contexts.projectId, command.projectId),
              eq(contexts.active, true),
            ),
          );
        if (target?.kind !== "private")
          throw new WorkFault("FUN_PRIVATE_ONLY", 409);
      }
      if (!labels) return;
      const desired = labels.includes("fun");
      let parent =
        command.action === "move" && !command.parentId
          ? null
          : (command.parentId ?? payload.source?.parent_id);
      const seen = new Set<string>();
      while (parent) {
        if (seen.has(parent)) throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
        seen.add(parent);
        const p = await reader.task(token, parent);
        if (p.project_id !== payload.projectId)
          throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
        if (p.labels.includes("epic") && p.labels.includes("fun") !== desired)
          throw new WorkFault("FUN_EPIC_CONFLICT", 409);
        parent = p.parent_id;
      }
      if (
        (labels.includes("epic") || payload.source?.labels.includes("epic")) &&
        payload.children.some((t) => t.labels.includes("fun") !== desired)
      )
        throw new WorkFault("FUN_EPIC_CONFLICT", 409);
    }
    async function mutate(
      token: string,
      kind: string,
      path: string,
      body?: Record<string, unknown>,
    ) {
      await authorize();
      if (
        ["create", "update"].includes(kind) ||
        (kind === "move" && command.action === "move")
      )
        await checkFun(token);
      if (payload.planLink?.action === "add")
        await validatePlanAddition(reader, token, payload.planLink);
      if (payload.source) await fresh(token);
      await save({
        pending: {
          kind,
          path,
          body,
          before: progress.task ?? payload.source ?? undefined,
          requestId: randomUUID(),
        },
      });
      const [step] = await database.db
        .select()
        .from(planSteps)
        .where(eq(planSteps.operationId, op.id));
      if (!step) throw new WorkFault("INVALID_REQUEST");
      await database.db
        .update(planSteps)
        .set({
          status: "sending",
          attempts: sql`${planSteps.attempts}+1`,
          updatedAt: new Date(),
        })
        .where(eq(planSteps.id, step.id));
      let result: Record<string, unknown> | null;
      try {
        await authorize();
        result = await writer(
          token,
          kind === "delete" ? "DELETE" : "POST",
          path,
          body,
          progress.pending!.requestId!,
        );
      } catch (e) {
        if (
          e instanceof TaskRateLimit ||
          (e instanceof WorkFault &&
            ["TODOIST_PERMISSION", "TODOIST_REJECTED"].includes(e.code))
        )
          await save({ pending: undefined, effects: progress.effects ?? [] });
        throw e;
      }
      await save({
        pending: {
          ...progress.pending!,
          acknowledged: true,
          externalId: typeof result?.id === "string" ? result.id : undefined,
        },
      });
      if (!(await verifyPending(token)))
        throw new WorkFault("OUTCOME_UNKNOWN", 409);
    }
    async function fresh(token: string) {
      const expected = progress.task ?? payload.source;
      if (!expected) throw new WorkFault("INVALID_REQUEST");
      const t = await reader.task(token, expected.id);
      if (fingerprint(t) !== fingerprint(expected))
        throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
      const children = descendants(
        await reader.tasks(token, t.project_id),
        t.id,
      );
      if (
        fingerprint(children) !==
        fingerprint(progress.children ?? payload.children)
      )
        throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
      return t;
    }
    async function section(token: string, name: string) {
      const all = await reader.sections(token, payload.projectId);
      const matches = all.filter((s) => s.name === name);
      if (matches.length !== 1)
        throw new WorkFault(
          matches.length ? "SECTION_AMBIGUOUS" : "SECTION_MISSING",
          409,
        );
      return matches[0]!.id;
    }
    let error: unknown = null;
    try {
      const scope = await authorize();
      const token = await tokenFor(scope.i, config);
      await project(token, payload.projectId);
      if (progress.pending && !(await verifyPending(token)))
        throw new WorkFault("OUTCOME_UNKNOWN", 409);
      if (progress.stage !== "done") {
        if (command.action === "sections") {
          for (const name of [
            "Offen",
            "In Arbeit",
            "Wartet",
            "Abgeschlossen",
          ]) {
            const existing = (
              await reader.sections(token, payload.projectId)
            ).filter((s) => s.name === name);
            if (existing.length > 1)
              throw new WorkFault("SECTION_AMBIGUOUS", 409);
            if (!existing.length)
              await mutate(token, "section", "sections", {
                project_id: payload.projectId,
                name,
              });
          }
          await save({ stage: "done" });
        } else if (command.action === "create") {
          const body = {
            ...fieldPatch(command.fields!),
            ...(command.projectId ? { project_id: payload.projectId } : {}),
            ...(command.sectionId ? { section_id: command.sectionId } : {}),
            ...(command.parentId ? { parent_id: command.parentId } : {}),
          };
          if (
            command.sectionId &&
            !(await reader.sections(token, payload.projectId)).some(
              (s) => s.id === command.sectionId,
            )
          )
            throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
          if (
            command.parentId &&
            (await reader.task(token, command.parentId)).project_id !==
              payload.projectId
          )
            throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
          await mutate(token, "create", "tasks", body);
        } else {
          const t = await fresh(token);
          const path = "tasks/" + encodeURIComponent(t.id);
          if (command.action === "plan-select") {
            await validatePlanAddition(reader, token, payload.planLink!);
            await save({ task: t, stage: "done" });
          }
          if (command.action === "update")
            await mutate(token, "update", path, fieldPatch(command.fields!));
          if (command.action === "comment")
            await mutate(token, "comment", "comments", {
              task_id: t.id,
              content: command.comment!,
            });
          if (command.action === "move") {
            const targets = [
              command.projectId,
              command.sectionId,
              command.parentId,
            ].filter(Boolean);
            if (targets.length !== 1) throw new WorkFault("INVALID_REQUEST");
            let body: Record<string, unknown>;
            if (command.projectId) {
              await identity.withOperationSession(
                op.sessionId,
                op.userId,
                (db) => allowedProject(db, scope.i, command.projectId!),
              );
              await project(token, command.projectId);
              body = { project_id: command.projectId };
            } else if (command.sectionId) {
              if (
                !(await reader.sections(token, payload.projectId)).some(
                  (s) => s.id === command.sectionId,
                )
              )
                throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
              body = { section_id: command.sectionId };
            } else {
              const parent = await reader.task(token, command.parentId!);
              if (
                parent.project_id !== t.project_id ||
                parent.id === t.id ||
                payload.children.some((c) => c.id === parent.id)
              )
                throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
              body = { parent_id: parent.id };
            }
            await mutate(token, "move", path + "/move", body);
          }
          if (command.action === "wait") {
            if (progress.stage !== "waiting-description")
              await mutate(token, "update", path, {
                description: patchWaiting(t.description, command.waiting!),
              });
            const id = await section(token, "Wartet");
            if (progress.task?.section_id !== id)
              await mutate(token, "move", path + "/move", { section_id: id });
            await save({ stage: "done" });
          }
          if (command.action === "delete") await mutate(token, "delete", path);
          if (command.action === "close") {
            if (
              progress.stage !== "moved" &&
              progress.stage !== "recurrence-advanced"
            )
              await mutate(token, "move", path + "/move", {
                section_id: await section(token, "Abgeschlossen"),
              });
            if (progress.stage !== "recurrence-advanced") {
              await fresh(token);
              await mutate(token, "close", path + "/close");
            }
            if (progress.stage === "recurrence-advanced")
              await mutate(token, "move", path + "/move", {
                section_id: await section(token, "Offen"),
              });
          }
        }
      }
      await authorize();
      if (progress.task && op.contextId) {
        const task = progress.task;
        const sections = await reader.sections(token, task.project_id);
        await database.db
          .update(taskProjections)
          .set({
            data: task,
            state: task.is_deleted
              ? "deleted"
              : task.checked
                ? "completed"
                : task.project_id === payload.projectId
                  ? "active"
                  : "unknown",
            sectionName:
              sections.find((s) => s.id === task.section_id)?.name ?? null,
            retrievedAt: new Date(),
            fingerprint: fingerprint(task),
            revision: sql`${taskProjections.revision}+1`,
          })
          .where(
            and(
              eq(taskProjections.taskId, task.id),
              eq(taskProjections.integrationId, scope.i.id),
              eq(taskProjections.contextId, op.contextId),
              eq(taskProjections.credentialVersion, payload.credentialVersion),
            ),
          );
      }
      if (command.action === "delete" && command.taskId)
        await database.db
          .update(taskProjections)
          .set({ state: "deleted", retrievedAt: new Date() })
          .where(
            and(
              eq(taskProjections.taskId, command.taskId),
              eq(taskProjections.integrationId, scope.i.id),
              eq(taskProjections.credentialVersion, payload.credentialVersion),
            ),
          );
    } catch (e) {
      error = e;
    }
    const code =
      error instanceof WorkFault || error instanceof TodoistFault
        ? error.code
        : error
          ? "OPERATION_UNAVAILABLE"
          : null;
    const retrySeconds =
      error instanceof TaskRateLimit
        ? error.seconds
        : error instanceof TodoistFault && error.code === "rate_limit"
          ? error.retrySeconds
          : null;
    const status = !error
      ? "succeeded"
      : progress.pending
        ? "unknown"
        : progress.stage || (progress.effects?.length ?? 0) > 0
          ? "partial"
          : "failed";
    await database.db.transaction(async (db) => {
      await db.execute(sql`select pg_advisory_xact_lock(1748012)`);
      if (!error && payload.planLink)
        await finishPlanLink(db, payload.planLink, op.id);
      await db
        .update(planOperations)
        .set({
          status,
          code,
          result: progress as Record<string, unknown>,
          retryAt:
            retrySeconds !== null
              ? new Date(Date.now() + retrySeconds * 1000)
              : null,
          updatedAt: new Date(),
        })
        .where(eq(planOperations.id, op.id));
      await db
        .update(planSteps)
        .set({
          status: error
            ? progress.pending
              ? "unknown"
              : "failed"
            : command.action === "plan-select"
              ? "local"
              : "verified",
          code,
          updatedAt: new Date(),
        })
        .where(eq(planSteps.operationId, op.id));
      if (retrySeconds !== null)
        await db
          .update(integrations)
          .set({
            state: "rate_limit",
            nextAllowedAt: new Date(Date.now() + retrySeconds! * 1000),
          })
          .where(eq(integrations.userId, op.userId));
      const key = "task-operation:" + op.id;
      if (!error)
        await db
          .update(integrationProblems)
          .set({
            status: "resolved",
            resolvedAt: new Date(),
            revision: sql`${integrationProblems.revision}+1`,
          })
          .where(eq(integrationProblems.key, key));
      else {
        const [i] = await db
          .select()
          .from(integrations)
          .where(eq(integrations.userId, op.userId));
        if (i)
          await db
            .insert(integrationProblems)
            .values({
              id: randomUUID(),
              userId: op.userId,
              integrationId: i.id,
              contextId: op.contextId,
              key,
              code: "task_operation_failed",
            })
            .onConflictDoUpdate({
              target: integrationProblems.key,
              set: {
                status: "open",
                lastSeenAt: new Date(),
                occurrences: sql`${integrationProblems.occurrences}+1`,
                revision: sql`${integrationProblems.revision}+1`,
                resolvedAt: null,
              },
            });
      }
    });
  };
}
