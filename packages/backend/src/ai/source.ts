import { knownHierarchy } from "../epics/hierarchy";
import { aiTaskSignals } from "./schema";
import { referenceDay } from "./dates";
import { and, eq } from "drizzle-orm";
import {
  taskScope,
  allowedProject,
  tokenFor,
  descendants,
  fingerprint,
} from "../tasks/service";
import { WorkFault } from "../work/service";
import type { Database, Db } from "../planning/store";
import type { WorkConfig } from "../work/config";
import type { TodoistReader } from "../work/todoist";
import { taskProjections } from "../work/schema";
import type { AiDraft, AiSource } from "./schema";
export async function managedScope(db: Db, user: string, contextId: string) {
  const scope = await taskScope(db, user, contextId);
  if (!scope.c?.projectId) throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
  const project = await allowedProject(db, scope.i, scope.c.projectId);
  if (project.inbox) throw new WorkFault("AI_SCOPE_DENIED", 409);
  return { ...scope, c: scope.c };
}
export async function readSource(
  database: Database,
  config: WorkConfig,
  reader: TodoistReader,
  user: string,
  contextId: string,
  taskId: string,
): Promise<AiSource> {
  const scope = await managedScope(database.db, user, contextId);
  const token = await tokenFor(scope.i, config);
  const project = await reader.project(token, scope.c.projectId!);
  if (project.inbox_project || project.is_archived || project.is_deleted)
    throw new WorkFault("AI_SCOPE_DENIED", 409);
  const task = await reader.task(token, taskId);
  if (task.project_id !== scope.c.projectId || task.checked || task.is_deleted)
    throw new WorkFault("AI_SCOPE_DENIED", 409);
  const [rows, comments] = await Promise.all([
    reader.tasks(token, task.project_id),
    reader.comments(token, taskId),
  ]);
  const hierarchy = await knownHierarchy(
    database,
    reader,
    token,
    {
      contextId,
      credentialVersion: scope.i.credentialVersion,
      projectId: task.project_id,
    },
    rows,
    task.id,
  );
  const children = hierarchy.children;
  const [correction] = await database.db
    .select()
    .from(aiTaskSignals)
    .where(
      and(
        eq(aiTaskSignals.contextId, contextId),
        eq(aiTaskSignals.taskId, taskId),
        eq(aiTaskSignals.credentialVersion, scope.i.credentialVersion),
      ),
    );
  const ancestors: import("@helios/contracts").TodoistTask[] = [];
  let parentId = task.parent_id;
  const seen = new Set([task.id]);
  while (parentId) {
    if (seen.has(parentId) || ancestors.length >= 20)
      throw new WorkFault("AI_SOURCE_TOO_LARGE", 409);
    seen.add(parentId);
    const ancestor = await reader.task(token, parentId);
    if (ancestor.project_id !== task.project_id)
      throw new WorkFault("AI_SCOPE_DENIED", 409);
    ancestors.push(ancestor);
    parentId = ancestor.parent_id;
  }
  const childComments: NonNullable<AiSource["childComments"]> = [];
  for (const child of children) {
    const comments = await reader.comments(token, child.id);
    if (comments.length) childComments.push({ taskId: child.id, comments });
  }
  const parent = ancestors[0] ?? null;
  const ancestorCorrections: NonNullable<AiSource["ancestorCorrections"]> = [];
  for (const ancestor of ancestors.filter((a) => a.labels.includes("epic"))) {
    const [signal] = await database.db
      .select()
      .from(aiTaskSignals)
      .where(
        and(
          eq(aiTaskSignals.contextId, contextId),
          eq(aiTaskSignals.taskId, ancestor.id),
          eq(aiTaskSignals.credentialVersion, scope.i.credentialVersion),
        ),
      );
    if (signal?.epicCorrection)
      ancestorCorrections.push({
        taskId: ancestor.id,
        text: signal.epicCorrection,
        revision: signal.correctionRevision,
      });
  }
  const result: AiSource = {
    childComments,
    userCorrection: correction?.epicCorrection ?? "",
    ancestorCorrections,
    unknownChildren: hierarchy.unknownChildren,
    inspection: {
      task,
      basis: fingerprint({ task, children: descendants(rows, task.id) }),
      children: children.map(({ id, content }) => ({ id, content })),
      comments,
      sections: [],
      waiting: null,
      links: [],
    },
    parent,
    ancestors,
    children,
  };
  if (JSON.stringify(promptSource(result)).length > 20000)
    throw new WorkFault("AI_SOURCE_TOO_LARGE", 409);
  return result;
}
export function promptSource(source: AiSource | null) {
  if (!source) return null;
  const task = source.inspection.task;
  return {
    childComments: source.childComments ?? [],
    userCorrection: source.userCorrection ?? "",
    ancestorCorrections: source.ancestorCorrections ?? [],
    unknownChildren: source.unknownChildren ?? [],
    task: {
      id: task.id,
      title: task.content,
      description: task.description,
      due: task.due,
      deadline: task.deadline,
      duration: task.duration,
      labels: task.labels.filter((l) => l !== "need_context"),
    },
    comments: source.inspection.comments.map((c) => ({
      id: c.id,
      content: c.content,
    })),
    children: source.children.map((t) => ({
      id: t.id,
      parentId: t.parent_id,
      title: t.content,
      description: t.description,
      completed: t.checked,
    })),
    epicContext: (source.ancestors ?? (source.parent ? [source.parent] : []))
      .filter((p) => p.labels.includes("epic"))
      .map((p) => ({
        id: p.id,
        title: p.content,
        description: p.description,
        completed: p.checked,
      })),
    parent: source.parent
      ? { title: source.parent.content, description: source.parent.description }
      : null,
  };
}
export function analysisHash(source: AiSource) {
  return fingerprint(promptSource(source));
}
export function sourceHash(source: AiSource | null) {
  const stable = (t: import("@helios/contracts").TodoistTask) => ({
    ...t,
    updated_at: null,
    labels: t.labels.filter((l) => l !== "need_context"),
  });
  return fingerprint(
    source
      ? {
          ...(source.childComments?.length
            ? { childComments: source.childComments }
            : {}),
          ...(source.ancestorCorrections?.length
            ? { ancestorCorrections: source.ancestorCorrections }
            : {}),
          ...(source.userCorrection
            ? { userCorrection: source.userCorrection }
            : {}),
          ...(source.unknownChildren?.length
            ? { unknownChildren: source.unknownChildren }
            : {}),
          task: stable(source.inspection.task),
          children: source.children.map(stable),
          comments: source.inspection.comments,
          parent: source.parent ? stable(source.parent) : null,
          ancestors: (
            source.ancestors ?? (source.parent ? [source.parent] : [])
          ).map(stable),
        }
      : null,
  );
}
export function clarityHash(source: AiSource) {
  return fingerprint({
    ancestors: (source.ancestors ?? (source.parent ? [source.parent] : [])).map(
      (p) => ({ id: p.id, content: p.content, description: p.description }),
    ),
    title: source.inspection.task.content,
    description: source.inspection.task.description,
    comments: source.inspection.comments.map((c) => ({
      id: c.id,
      content: c.content,
    })),
    parent: source.parent
      ? {
          content: source.parent.content,
          description: source.parent.description,
        }
      : null,
  });
}
export async function assertDraftScope(db: Db, d: AiDraft) {
  if (!d.contextId) return;
  const s = await managedScope(db, d.userId, d.contextId);
  if (
    s.c.revision !== d.contextRevision ||
    s.i.credentialVersion !== d.credentialVersion ||
    s.i.revision !== d.integrationRevision
  )
    throw new WorkFault("AI_SOURCE_STALE", 409);
  if (d.taskId && d.source?.inspection.task.project_id !== s.c.projectId)
    throw new WorkFault("AI_SCOPE_DENIED", 409);
  return s;
}
export async function currentSource(
  database: Database,
  config: WorkConfig,
  reader: TodoistReader,
  d: AiDraft,
) {
  await assertDraftScope(database.db, d);
  return d.taskId && d.contextId
    ? readSource(database, config, reader, d.userId, d.contextId, d.taskId)
    : null;
}
export async function projectionScope(
  db: Db,
  user: string,
  contextId: string,
  taskId: string,
) {
  const s = await managedScope(db, user, contextId);
  const [p] = await db
    .select()
    .from(taskProjections)
    .where(
      and(
        eq(taskProjections.contextId, contextId),
        eq(taskProjections.taskId, taskId),
        eq(taskProjections.credentialVersion, s.i.credentialVersion),
        eq(taskProjections.state, "active"),
      ),
    );
  if (!p || p.projectId !== s.c.projectId)
    throw new WorkFault("AI_SCOPE_DENIED", 409);
  return s;
}

export function captureFingerprint(
  input: string,
  manualFields: unknown,
  day: string,
  timezone: string,
) {
  return fingerprint({ input, manualFields, day, timezone });
}
export function draftFingerprint(d: AiDraft, source: AiSource | null) {
  return !source && d.kind === "capture"
    ? captureFingerprint(
        d.input,
        d.manualFields,
        referenceDay(d.createdAt, d.timezone),
        d.timezone,
      )
    : sourceHash(source);
}
