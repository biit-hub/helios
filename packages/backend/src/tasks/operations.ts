import { prepareTaskSave } from "./save";
import { assertJobParent, finishJobLink } from "../ai-jobs/journal";
import { validateUserLabels } from "./labels";
import { verifyEpicDetach } from "../epics/close";
import {
  authorizeRoutine,
  validateRoutineMutation,
  finishRoutine,
} from "../routine/journal";
import {
  authorizeAnalysis,
  validateAnalysisMutation,
  finishAnalysis,
} from "../ai/status-policy";
import { validateDraftMutation, appliedDraftSource } from "../ai/journal";
import { finishDraftLink } from "../ai/store";
import type { AiSource } from "../ai/schema";
import { randomUUID } from "node:crypto";
import { eq, and, sql } from "drizzle-orm";
import { kanbanSections } from "@helios/contracts";
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
  TaskWriteUnknown,
} from "./todoist";
import type { TaskWriter } from "./todoist";
import { patchDocument } from "./document";
import { patchWaiting } from "./waiting";
import { finishPlanLink } from "../planning/agenda-store";
import { validatePlanAddition } from "../planning/agenda-source";
type Operation = typeof planOperations.$inferSelect;
type Progress = {
  failure?: { kind: string; httpStatus?: number };
  detached?: string[];
  effects?: Record<string, unknown>[];
  children?: TodoistTask[];
  task?: TodoistTask;
  stage?: string;
  verification?: {
    matched: string[];
    unmatched: string[];
    checkedAt: string;
    acknowledged: boolean;
  };
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
    let draftSource: AiSource | null = null;
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
            taskId:
              progress.pending.before?.id ??
              command.taskId ??
              progress.pending.externalId ??
              null,
            title: progress.pending.before?.content ?? null,
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
      if (payload.analysisLink) {
        if (config.RESTORE_MODE) throw new WorkFault("RESTORE_BLOCKED", 503);
        return database.db.transaction(async (db) => {
          await db.execute(sql.raw("select pg_advisory_xact_lock(1748012)"));
          return authorizeAnalysis(db, op, payload);
        });
      }
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
          if (payload.routineLink)
            await authorizeRoutine(
              db,
              op.userId,
              payload.routineLink,
              command,
              op.id,
            );
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
    async function verifyFields(
      task: TodoistTask,
      pending: NonNullable<Progress["pending"]>,
    ) {
      const body = pending.body ?? {};
      const fields = Object.keys(body).filter(
        (key) => !["duration_unit", "due_lang"].includes(key),
      );
      const matched = fields.filter((key) =>
        matchesFields(task, {
          [key]: body[key],
          ...(key === "duration" ? { duration_unit: body.duration_unit } : {}),
        }),
      );
      const unmatched = fields.filter((key) => !matched.includes(key));
      await save({
        verification: {
          matched,
          unmatched,
          checkedAt: new Date().toISOString(),
          acknowledged: pending.acknowledged === true,
        },
      });
      if (unmatched.length && pending.acknowledged)
        throw new WorkFault("TODOIST_FIELDS_UNCONFIRMED", 409);
      return unmatched.length === 0;
    }
    async function verifyPending(token: string): Promise<boolean> {
      const pending = progress.pending;
      if (!pending) return true;
      if (pending.kind === "create") {
        if (!pending.externalId) return false;
        const t = await reader.task(token, pending.externalId);
        if (
          t.project_id !== payload.projectId ||
          t.parent_id !== (command.parentId ?? null) ||
          (command.sectionId !== undefined &&
            command.sectionId !== null &&
            t.section_id !== command.sectionId) ||
          !(await verifyFields(t, pending))
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
            (c) =>
              c.id === pending.externalId &&
              c.content === pending.body?.content,
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
      if (pending.kind === "epic-detach") {
        if (!pending.before) return false;
        const removed = await verifyEpicDetach(
          reader,
          token,
          payload,
          pending.before,
        );
        const epic = await reader.task(token, command.taskId!);
        if (
          fingerprint({ ...epic, updated_at: null }) !==
          fingerprint({
            ...(progress.task ?? payload.source),
            updated_at: null,
          })
        )
          throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
        const expected = (progress.children ?? payload.children).filter(
          (t) => !removed.includes(t.id),
        );
        const actual = descendants(
          await reader.tasks(token, payload.projectId),
          command.taskId!,
        );
        if (fingerprint(expected) !== fingerprint(actual))
          throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
        await save({
          task: epic,
          children: actual,
          detached: [...(progress.detached ?? []), pending.before.id],
          pending: undefined,
          stage: "detached",
        });
        return true;
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
        if (!(await verifyFields(t, pending))) return false;
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
        if (
          target?.kind !== "private" &&
          !(payload.routineLink?.kind === "inbox" && !target)
        )
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
    async function validateLinkedMutations(token: string) {
      if (payload.jobLink)
        assertJobParent(
          payload.jobLink,
          payload,
          await reader.task(token, payload.jobLink.parentId),
        );
      if (payload.analysisLink)
        await validateAnalysisMutation(database, config, reader, op, payload);
      if (payload.draftLink)
        await validateDraftMutation(
          database,
          config,
          reader,
          payload.draftLink,
          op.id,
        );
      if (payload.planLink?.action === "add")
        await validatePlanAddition(reader, token, payload.planLink);
      if (payload.routineLink)
        await validateRoutineMutation(
          database,
          reader,
          token,
          op.userId,
          payload,
          op.id,
        );
    }
    async function assertDetachSource(token: string, target: TodoistTask) {
      const current = await reader.task(token, target.id);
      if (fingerprint(current) !== fingerprint(target))
        throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
      for (const child of [
        target,
        ...descendants(payload.children, target.id),
      ]) {
        if (
          fingerprint(await reader.comments(token, child.id)) !==
          fingerprint(payload.epicClosure?.comments[child.id] ?? [])
        )
          throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
      }
    }
    async function mutate(
      token: string,
      kind: string,
      path: string,
      body?: Record<string, unknown>,
      target?: TodoistTask,
    ) {
      await authorize();
      if (
        ["create", "update"].includes(kind) ||
        (kind === "move" && command.action === "move")
      )
        await checkFun(token);
      await validateLinkedMutations(token);
      if (payload.source) await fresh(token);
      if (kind === "epic-detach" && target)
        await assertDetachSource(token, target);
      await save({
        pending: {
          kind,
          path,
          body,
          before: target ?? progress.task ?? payload.source ?? undefined,
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
        if (e instanceof TaskWriteUnknown)
          await save({ failure: { kind: e.reason, httpStatus: e.httpStatus } });
        if (
          e instanceof TaskRateLimit ||
          (e instanceof WorkFault &&
            ["TODOIST_AUTH", "TODOIST_PERMISSION", "TODOIST_REJECTED"].includes(
              e.code,
            ))
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
          // Older accepted journals already bind these values server-side; their original intent covered all four names.
          const setup = command.sectionSetup ?? {
            projectId: payload.projectId,
            contextRevision: payload.contextRevision,
            missing: [...kanbanSections],
          };
          if (
            setup.projectId !== payload.projectId ||
            setup.contextRevision !== payload.contextRevision
          )
            throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
          for (const name of setup.missing) {
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
          const verified = await reader.sections(token, payload.projectId);
          for (const name of kanbanSections) {
            const count = verified.filter(
              (s) => s.project_id === payload.projectId && s.name === name,
            ).length;
            if (count !== 1)
              throw new WorkFault(
                count ? "SECTION_AMBIGUOUS" : "SECTION_MISSING",
                409,
              );
          }
          await save({ stage: "done" });
        } else if (command.action === "create") {
          await validateUserLabels(reader, token, command.fields?.labels);
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
          if (command.parentId) {
            const parent = await reader.task(token, command.parentId);
            if (
              parent.project_id !== payload.projectId ||
              parent.checked ||
              parent.is_deleted
            )
              throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
          }
          await mutate(token, "create", "tasks", body);
        } else {
          const t = await fresh(token);
          const path = "tasks/" + encodeURIComponent(t.id);
          if (command.action === "plan-select") {
            await validatePlanAddition(reader, token, payload.planLink!);
            await save({ task: t, stage: "done" });
          }
          if (command.action === "document")
            await mutate(token, "update", path, {
              description: patchDocument(t.description, command.document!),
            });
          if (command.action === "update") {
            if (!payload.analysisLink)
              await validateUserLabels(
                reader,
                token,
                command.fields?.labels,
                t.labels,
              );
            await mutate(
              token,
              "update",
              path,
              fieldPatch(
                prepareTaskSave(
                  t,
                  command.fields ?? {},
                  command.documents,
                  command.acknowledgeRecurrenceChange,
                ),
              ),
            );
          }
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
            if (payload.epicClosure) {
              if (t.due?.is_recurring)
                throw new WorkFault("EPIC_RECURRENCE_UNSAFE", 409);
              for (const rootId of payload.epicClosure.roots) {
                if (progress.detached?.includes(rootId)) continue;
                const root = payload.children.find((c) => c.id === rootId);
                if (!root) throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
                await mutate(
                  token,
                  "epic-detach",
                  "tasks/" + encodeURIComponent(rootId) + "/move",
                  { project_id: payload.projectId },
                  root,
                );
              }
              // Every originally open subtree must be proved detached before moving/closing the Epic.
              if ((progress.children ?? payload.children).length)
                throw new WorkFault("EPIC_CHILDREN_POLICY", 409);
              await fresh(token);
            }
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
      if (payload.jobLink) {
        assertJobParent(
          payload.jobLink,
          payload,
          await reader.task(token, payload.jobLink.parentId),
        );
        const child = progress.task;
        if (
          child?.parent_id !== payload.jobLink.parentId ||
          child.project_id !== payload.projectId ||
          child.content !== "KI Aufgabe " + payload.jobLink.id ||
          child.checked ||
          child.is_deleted
        )
          throw new WorkFault("AI_JOB_REFERENCE_UNCONFIRMED", 409);
      }
      if (progress.task && op.contextId) {
        const task = progress.task;
        const sections = await reader.sections(token, task.project_id);
        const values = {
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
        };
        if (
          command.action === "create" &&
          task.project_id === payload.projectId
        ) {
          await database.db
            .insert(taskProjections)
            .values({
              ...values,
              state: task.is_deleted
                ? "deleted"
                : task.checked
                  ? "completed"
                  : "active",
              integrationId: scope.i.id,
              taskId: task.id,
              contextId: op.contextId,
              projectId: payload.projectId,
              credentialVersion: payload.credentialVersion,
              revision: 0,
            })
            .onConflictDoNothing();
        } else
          await database.db
            .update(taskProjections)
            .set({
              ...values,
              state: values.state as
                | "active"
                | "unknown"
                | "completed"
                | "deleted",
              revision: sql`${taskProjections.revision}+1`,
            })
            .where(
              and(
                eq(taskProjections.taskId, task.id),
                eq(taskProjections.integrationId, scope.i.id),
                eq(taskProjections.contextId, op.contextId),
                eq(
                  taskProjections.credentialVersion,
                  payload.credentialVersion,
                ),
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
      if (payload.draftLink)
        draftSource = await appliedDraftSource(
          database,
          config,
          reader,
          payload.draftLink,
          progress.task?.id,
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
      if (payload.jobLink)
        await finishJobLink(
          db,
          op.userId,
          payload.jobLink,
          op.id,
          status,
          progress.task,
          code,
        );
      if (!error && payload.analysisLink) await finishAnalysis(db, payload);
      if (payload.draftLink)
        await finishDraftLink(
          db,
          payload.draftLink,
          op.id,
          status,
          draftSource,
          code,
        );
      if (payload.routineLink)
        await finishRoutine(db, payload.routineLink, op.id, status);
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
          .where(
            and(
              eq(integrations.userId, op.userId),
              eq(integrations.type, "todoist"),
            ),
          );
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
          .where(
            and(
              eq(integrations.userId, op.userId),
              eq(integrations.type, "todoist"),
            ),
          );
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
