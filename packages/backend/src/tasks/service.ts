import { prepareTaskSave } from "./save";
import {
  assertJobParent,
  linkJob,
  type JobDelegation,
  type JobLink,
} from "../ai-jobs/journal";
import { validateUserLabels } from "./labels";
import { descendants } from "./hierarchy";
import { prepareEpicClosure } from "../epics/close";
import { linkRoutine, type RoutineLink } from "../routine/journal";
import { fingerprint } from "./hash";
import { z } from "zod";
import { descriptionLinks } from "./document";
import { randomUUID } from "node:crypto";
import { symmetricDecrypt } from "better-auth/crypto";
import { and, eq, desc, inArray } from "drizzle-orm";
import {
  kanbanSections,
  taskCommand,
  taskFields,
  taskSaveInput,
} from "@helios/contracts";
import type {
  TaskCommand,
  TaskInspection,
  TodoistTask,
} from "@helios/contracts";
import { createIdentityService } from "../identity/service";
import { WorkFault } from "../work/service";
import { createTodoistReader } from "../work/todoist";
import type { TodoistReader } from "../work/todoist";
import type { WorkConfig } from "../work/config";
import {
  integrations,
  contexts,
  projectCatalog,
  taskProjections,
} from "../work/schema";
import { planOperations, planSteps } from "../planning/schema";
import type { Database, Db } from "../planning/store";
import { linkDraft, resumeDraftLink, type DraftLink } from "../ai/store";
import { readWaiting } from "./waiting";
import { linkPlan, type PlanLink } from "../planning/agenda-store";
export type TaskPayload = {
  jobLink?: JobLink;
  epicClosure?: import("../epics/close").EpicClosure;
  routineLink?: RoutineLink;
  analysisLink?: import("../ai/status-policy").AnalysisLink;
  draftLink?: DraftLink;
  planLink?: PlanLink;
  command: TaskCommand;
  projectId: string;
  contextRevision: number | null;
  credentialVersion: string;
  integrationRevision: number;
  source: TodoistTask | null;
  children: TodoistTask[];
};
export { canonical, fingerprint } from "./hash";
export { descendants } from "./hierarchy";
export async function taskScope(
  db: Db,
  userId: string,
  contextId: string | null,
) {
  const [i] = await db
    .select()
    .from(integrations)
    .where(
      and(eq(integrations.userId, userId), eq(integrations.type, "todoist")),
    );
  if (!i?.enabled || !i.encryptedToken)
    throw new WorkFault("CONTEXT_INCOMPLETE", 409);
  const [c] = contextId
    ? await db
        .select()
        .from(contexts)
        .where(and(eq(contexts.id, contextId), eq(contexts.userId, userId)))
    : [];
  if (contextId && (!c?.active || !c.projectId))
    throw new WorkFault("CONTEXT_NOT_FOUND", 404);
  return { i, c };
}
export async function tokenFor(
  i: typeof integrations.$inferSelect,
  config: WorkConfig,
) {
  if (!config.INTEGRATION_KEY || !i.encryptedToken)
    throw new WorkFault("KEY_UNAVAILABLE", 503);
  try {
    return await symmetricDecrypt({
      key: config.INTEGRATION_KEY,
      data: i.encryptedToken,
    });
  } catch {
    throw new WorkFault("KEY_UNAVAILABLE", 503);
  }
}
export async function allowedProject(
  db: Db,
  i: typeof integrations.$inferSelect,
  id: string,
) {
  const [p] = await db
    .select()
    .from(projectCatalog)
    .where(
      and(
        eq(projectCatalog.integrationId, i.id),
        eq(projectCatalog.projectId, id),
        eq(projectCatalog.credentialVersion, i.credentialVersion),
        eq(projectCatalog.available, true),
      ),
    );
  if (!p) throw new WorkFault("PROJECT_NOT_ASSIGNABLE", 409);
  return p;
}
export function createTaskService(
  database: Database,
  config: WorkConfig,
  reader: TodoistReader = createTodoistReader(fetch, config.TODOIST_ORIGIN),
) {
  const identity = createIdentityService(database, config);
  async function inspect(
    h: Headers,
    contextId: string,
    taskId: string,
  ): Promise<TaskInspection> {
    const scope = await identity.withActive(h, {}, (db, user) => {
      z.uuid().parse(contextId);
      z.string().min(1).max(200).parse(taskId);
      return taskScope(db, user, contextId);
    });
    if (!scope.c?.projectId) throw new WorkFault("CONTEXT_INCOMPLETE", 409);
    const token = await tokenFor(scope.i, config);
    const task = await reader.task(token, taskId);
    if (task.project_id !== scope.c.projectId)
      throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
    const [rows, sections, comments] = await Promise.all([
      reader.tasks(token, task.project_id),
      reader.sections(token, task.project_id),
      reader.comments(token, task.id),
    ]);
    if (rows.some((t) => t.project_id !== task.project_id))
      throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
    const children = descendants(rows, task.id);
    await identity.withActive(h, {}, async (db, user) => {
      const now = await taskScope(db, user, contextId);
      if (
        now.i.credentialVersion !== scope.i.credentialVersion ||
        now.i.revision !== scope.i.revision ||
        now.c?.revision !== scope.c?.revision
      )
        throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
    });
    return {
      task,
      basis: fingerprint({ task, children }),
      children: children.map(({ id, content, parent_id }) => ({
        id,
        content,
        parentId: parent_id,
      })),
      sections,
      comments,
      waiting: readWaiting(task.description),
      links: descriptionLinks(task.description),
    };
  }
  async function enqueue(
    h: Headers,
    raw: unknown,
    planLink?: PlanLink,
    draftLink?: DraftLink,
    routineLink?: RoutineLink,
    delegation?: JobDelegation,
  ) {
    const command = taskCommand.parse(raw);
    if (command.documents && command.action !== "update")
      throw new WorkFault("INVALID_REQUEST");
    if (command.fields?.recurring && command.fields.due !== undefined)
      throw new WorkFault("INVALID_REQUEST");
    if (command.action === "plan-select" && !planLink)
      throw new WorkFault("INVALID_REQUEST");
    const hash = fingerprint(
      delegation
        ? { command, jobLink: delegation.link }
        : routineLink
          ? { command, routineLink }
          : draftLink
            ? { command, draftLink }
            : planLink
              ? { command, planLink }
              : command,
    );
    const base = await identity.withActive(
      h,
      { mutation: true },
      async (db, user) => {
        const [old] = await db
          .select()
          .from(planOperations)
          .where(
            and(
              eq(planOperations.userId, user),
              eq(planOperations.key, command.key),
            ),
          );
        if (old) {
          if (old.requestHash !== hash || old.kind !== "task")
            throw new WorkFault("REVISION_CONFLICT", 409);
          return { old };
        }
        const scope = await taskScope(db, user, command.contextId);
        let projectId = scope.c?.projectId ?? null;
        if (routineLink?.kind === "inbox")
          projectId = await routineInboxProject(
            db,
            scope.i,
            routineLink.sourceProjectId,
          );
        if (command.action === "create") {
          taskFields.parse(command.fields);
          if (command.contextId && command.projectId !== scope.c?.projectId)
            throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
          if (command.projectId) projectId = command.projectId;
          else {
            const [inbox] = await db
              .select()
              .from(projectCatalog)
              .where(
                and(
                  eq(projectCatalog.integrationId, scope.i.id),
                  eq(projectCatalog.inbox, true),
                  eq(projectCatalog.available, true),
                  eq(
                    projectCatalog.credentialVersion,
                    scope.i.credentialVersion,
                  ),
                ),
              );
            projectId = inbox?.projectId ?? null;
          }
        }
        if (!projectId) throw new WorkFault("CONTEXT_INCOMPLETE", 409);
        await allowedProject(db, scope.i, projectId);
        if (
          (command.fields?.labels ?? []).includes("fun") &&
          scope.c?.kind !== "private"
        )
          throw new WorkFault("FUN_PRIVATE_ONLY", 400);
        return { scope, projectId };
      },
    );
    if ("old" in base && base.old) return { operationId: base.old.id };
    if (!("scope" in base) || !base.scope)
      throw new WorkFault("INVALID_REQUEST");
    const { scope, projectId } = base;
    const token = await tokenFor(scope.i, config);
    const project = await reader.project(token, projectId);
    if (project.is_archived || project.is_deleted)
      throw new WorkFault("PROJECT_NOT_ASSIGNABLE", 409);
    if (delegation)
      assertJobParent(
        delegation.link,
        { projectId },
        await reader.task(token, delegation.link.parentId),
      );
    if (routineLink?.kind === "inbox" && !project.inbox_project)
      throw new WorkFault("ROUTINE_SCOPE_DENIED", 409);
    let source: TodoistTask | null = null,
      children: TodoistTask[] = [];
    if (!["create", "sections"].includes(command.action)) {
      if (
        !command.taskId ||
        !command.basis ||
        (!scope.c && routineLink?.kind !== "inbox")
      )
        throw new WorkFault("INVALID_REQUEST");
      source = await reader.task(token, command.taskId);
      if (source.project_id !== projectId || source.is_deleted)
        throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
      children = descendants(await reader.tasks(token, projectId), source.id);
      if (fingerprint({ task: source, children }) !== command.basis)
        throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
      if (source.checked && command.action !== "delete")
        throw new WorkFault("TASK_ALREADY_CLOSED", 409);
    }
    await validateUserLabels(
      reader,
      token,
      command.fields?.labels,
      source?.labels,
    );
    if (
      source?.due?.is_recurring &&
      command.action === "update" &&
      command.fields?.due !== undefined &&
      !command.acknowledgeRecurrenceChange
    )
      throw new WorkFault("RECURRENCE_CONFIRMATION_REQUIRED", 409);
    if (
      command.action === "sections" &&
      (!scope.c ||
        project.inbox_project ||
        !command.sectionSetup ||
        command.sectionSetup.projectId !== projectId ||
        command.sectionSetup.contextRevision !== scope.c.revision)
    )
      throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
    if (command.action === "document" && !command.document)
      throw new WorkFault("INVALID_REQUEST");
    if (command.action === "comment" && !command.comment)
      throw new WorkFault("INVALID_REQUEST");
    if (
      command.action === "update" &&
      (!command.fields || Object.keys(command.fields).length === 0) &&
      !command.documents?.length
    )
      throw new WorkFault("INVALID_REQUEST");
    if (command.action === "update")
      prepareTaskSave(
        source!,
        command.fields ?? {},
        command.documents,
        command.acknowledgeRecurrenceChange,
      );
    if (command.action === "wait" && !command.waiting)
      throw new WorkFault("INVALID_REQUEST");
    if (
      ["close", "delete"].includes(command.action) &&
      !command.acknowledgeDestructive
    )
      throw new WorkFault("CONFIRMATION_REQUIRED", 409);
    if (
      source &&
      ["move", "close", "delete", "wait"].includes(command.action) &&
      (source.parent_id || children.length) &&
      !command.acknowledgeHierarchy
    )
      throw new WorkFault("HIERARCHY_CONFIRMATION_REQUIRED", 409);
    const epicClosure = await prepareEpicClosure(
      reader,
      token,
      command,
      source,
      children,
    );
    const payload: TaskPayload = {
      ...(delegation ? { jobLink: delegation.link } : {}),
      ...(epicClosure ? { epicClosure } : {}),
      ...(planLink ? { planLink } : {}),
      ...(draftLink ? { draftLink } : {}),
      ...(routineLink ? { routineLink } : {}),
      command,
      projectId,
      contextRevision: scope.c?.revision ?? null,
      credentialVersion: scope.i.credentialVersion,
      integrationRevision: scope.i.revision,
      source,
      children,
    };
    return identity.withActive(
      h,
      { mutation: true },
      async (db, user, session) => {
        const now = await taskScope(db, user, command.contextId);
        if (
          now.i.credentialVersion !== payload.credentialVersion ||
          now.i.revision !== payload.integrationRevision ||
          (now.c?.revision ?? null) !== payload.contextRevision
        )
          throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
        const [old] = await db
          .select()
          .from(planOperations)
          .where(
            and(
              eq(planOperations.userId, user),
              eq(planOperations.key, command.key),
            ),
          );
        if (old) {
          if (old.requestHash !== hash)
            throw new WorkFault("REVISION_CONFLICT", 409);
          return { operationId: old.id };
        }
        const id = randomUUID();
        if (
          planLink &&
          (now.i.credentialVersion !== planLink.credentialVersion ||
            now.c?.revision !== planLink.contextRevision)
        )
          throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
        if (planLink) await linkPlan(db, planLink, id);
        if (draftLink) await linkDraft(db, user, draftLink, id, command);
        if (routineLink) await linkRoutine(db, user, routineLink, command, id);
        await db.insert(planOperations).values({
          id,
          userId: user,
          sessionId: session,
          planId: null,
          kind: "task",
          contextId: command.contextId,
          payload: payload as unknown as Record<string, unknown>,
          key: command.key,
          requestHash: hash,
          selectedIds: command.taskId ? [command.taskId] : [],
          expectedRevision: 0,
          status: "queued",
          intentExpiresAt: new Date(Date.now() + 600000),
        });
        if (delegation) await linkJob(db, user, delegation, id, payload);
        await db.insert(planSteps).values({
          id: randomUUID(),
          operationId: id,
          taskId: command.taskId ?? command.action,
          requestId: randomUUID(),
        });
        if (command.taskId && command.action !== "comment")
          await db
            .update(taskProjections)
            .set({ state: "unknown" })
            .where(
              and(
                eq(taskProjections.integrationId, now.i.id),
                eq(
                  taskProjections.credentialVersion,
                  payload.credentialVersion,
                ),
                inArray(taskProjections.taskId, [
                  command.taskId,
                  ...(["move", "close", "delete", "wait"].includes(
                    command.action,
                  )
                    ? children.map((c) => c.id)
                    : []),
                ]),
              ),
            );
        return { operationId: id };
      },
    );
  }
  async function operations(h: Headers) {
    return identity.withActive(h, {}, async (db, user) => {
      const rows = await db
        .select()
        .from(planOperations)
        .where(
          and(eq(planOperations.userId, user), eq(planOperations.kind, "task")),
        )
        .orderBy(desc(planOperations.createdAt))
        .limit(30);
      return rows.map((r) => ({
        id: r.id,
        status: r.status,
        code: r.code,
        retryAt: r.retryAt?.toISOString() ?? null,
        result: r.result,
        input: (r.payload as unknown as TaskPayload)?.command,
        contextId: r.contextId,
      }));
    });
  }
  return {
    async enqueueDelegation(
      h: Headers,
      input: unknown,
      delegation: JobDelegation,
    ) {
      await identity.withActive(h, { mutation: true }, async () => {});
      return enqueue(h, input, undefined, undefined, undefined, delegation);
    },
    async enqueueDraft(h: Headers, input: unknown, link: DraftLink) {
      await identity.withActive(h, { mutation: true }, async () => {});
      return enqueue(h, input, undefined, link);
    },
    async enqueueRoutine(h: Headers, input: unknown, link: RoutineLink) {
      await identity.withActive(h, { mutation: true }, async () => {});
      return enqueue(h, input, undefined, undefined, link);
    },
    async enqueueLinked(h: Headers, input: unknown, link: PlanLink) {
      await identity.withActive(h, { mutation: true }, async () => {});
      return enqueue(h, input, link);
    },
    inspect,
    async kanban(h: Headers, contextId: string) {
      z.uuid().parse(contextId);
      const scope = await identity.withActive(h, {}, async (db, user) => {
        const value = await taskScope(db, user, contextId);
        await allowedProject(db, value.i, value.c!.projectId!);
        return value;
      });
      const token = await tokenFor(scope.i, config);
      const project = await reader.project(token, scope.c!.projectId!);
      if (
        project.id !== scope.c!.projectId ||
        project.inbox_project ||
        project.is_deleted ||
        project.is_archived
      )
        throw new WorkFault("PROJECT_NOT_ASSIGNABLE", 409);
      const sections = await reader.sections(token, project.id);
      if (sections.some((s) => s.project_id !== project.id))
        throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
      await identity.withActive(h, {}, async (db, user) => {
        const now = await taskScope(db, user, contextId);
        await allowedProject(db, now.i, project.id);
        if (
          now.i.credentialVersion !== scope.i.credentialVersion ||
          now.i.revision !== scope.i.revision ||
          now.c!.revision !== scope.c!.revision ||
          now.c!.projectId !== project.id
        )
          throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
      });
      return {
        projectId: project.id,
        contextRevision: scope.c!.revision,
        present: kanbanSections.filter((name) =>
          sections.some((s) => s.name === name),
        ),
        missing: kanbanSections.filter(
          (name) => !sections.some((s) => s.name === name),
        ),
        ambiguous: kanbanSections.filter(
          (name) => sections.filter((s) => s.name === name).length > 1,
        ),
      };
    },
    async labels(h: Headers) {
      const scope = await identity.withActive(h, {}, (db, user) =>
        taskScope(db, user, null),
      );
      const labels = await reader.labels(await tokenFor(scope.i, config));
      await identity.withActive(h, {}, async (db, user) => {
        const now = await taskScope(db, user, null);
        if (
          now.i.credentialVersion !== scope.i.credentialVersion ||
          now.i.revision !== scope.i.revision
        )
          throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
      });
      return { labels };
    },
    async options(h: Headers, projectId: string) {
      const scope = await identity.withActive(h, {}, async (db, user) => {
        z.string().min(1).max(200).parse(projectId);
        const s = await taskScope(db, user, null);
        await allowedProject(db, s.i, projectId);
        return s;
      });
      const token = await tokenFor(scope.i, config);
      const project = await reader.project(token, projectId);
      if (project.is_archived || project.is_deleted)
        throw new WorkFault("PROJECT_NOT_ASSIGNABLE", 409);
      const [sections, tasks] = await Promise.all([
        reader.sections(token, projectId),
        reader.tasks(token, projectId),
      ]);
      await identity.withActive(h, {}, async (db, user) => {
        const now = await taskScope(db, user, null);
        if (
          now.i.credentialVersion !== scope.i.credentialVersion ||
          now.i.revision !== scope.i.revision
        )
          throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
      });
      return {
        sections,
        parents: tasks
          .filter((t) => !t.checked && !t.is_deleted)
          .map((t) => ({ id: t.id, content: t.content })),
      };
    },
    operations,
    async handle(action: string, h: Headers, input: unknown) {
      await identity.withActive(h, { mutation: true }, async () => {});
      if (action === "preview") {
        const value = taskSaveInput.parse(input);
        const current = await inspect(h, value.contextId, value.taskId);
        if (current.basis !== value.basis)
          throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
        if (current.task.checked || current.task.is_deleted)
          throw new WorkFault("TASK_ALREADY_CLOSED", 409);
        return {
          basis: current.basis,
          before: current.task,
          fields: prepareTaskSave(
            current.task,
            value.fields,
            value.documents,
            value.acknowledgeRecurrenceChange,
          ),
        };
      }
      if (action === "submit") return enqueue(h, input);
      if (action === "resume") {
        const id = (input as { operationId?: unknown })?.operationId;
        z.uuid().parse(id);
        if (typeof id !== "string") throw new WorkFault("INVALID_REQUEST");
        return identity.withActive(
          h,
          { mutation: true },
          async (db, user, session) => {
            const [op] = await db
              .select()
              .from(planOperations)
              .where(
                and(
                  eq(planOperations.id, id),
                  eq(planOperations.userId, user),
                  eq(planOperations.kind, "task"),
                ),
              );
            if (!op || !["failed", "partial", "unknown"].includes(op.status))
              throw new WorkFault("REVISION_CONFLICT", 409);
            if (op.retryAt && op.retryAt > new Date())
              throw new WorkFault("RETRY_LATER", 429);
            const draftLink = (op.payload as unknown as TaskPayload)?.draftLink;
            if (draftLink) await resumeDraftLink(db, draftLink, op.id);
            await db
              .update(planOperations)
              .set({
                status: "queued",
                sessionId: session,
                intentExpiresAt: new Date(Date.now() + 600000),
                updatedAt: new Date(),
              })
              .where(eq(planOperations.id, id));
            return { operationId: id };
          },
        );
      }
      throw new WorkFault("NOT_FOUND", 404);
    },
  };
}

async function routineInboxProject(
  db: Db,
  i: typeof integrations.$inferSelect,
  projectId: string,
) {
  if (!(await allowedProject(db, i, projectId)).inbox)
    throw new WorkFault("ROUTINE_SCOPE_DENIED", 409);
  return projectId;
}
