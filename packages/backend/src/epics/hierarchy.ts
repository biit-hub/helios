import { and, eq } from "drizzle-orm";
import type { TodoistTask } from "@helios/contracts";
import type { Database } from "../planning/store";
import type { TodoistReader } from "../work/todoist";
import { TodoistFault } from "../work/todoist";
import { taskProjections } from "../work/schema";
import { descendants } from "../tasks/service";
import { WorkFault } from "../work/service";
export async function knownHierarchy(
  database: Database,
  reader: TodoistReader,
  token: string,
  scope: { contextId: string; credentialVersion: string; projectId: string },
  active: TodoistTask[],
  root: string,
) {
  if (active.some((t) => t.project_id !== scope.projectId))
    throw new WorkFault("AI_SCOPE_DENIED", 409);
  const cached = await database.db
    .select()
    .from(taskProjections)
    .where(
      and(
        eq(taskProjections.contextId, scope.contextId),
        eq(taskProjections.credentialVersion, scope.credentialVersion),
        eq(taskProjections.projectId, scope.projectId),
      ),
    );
  const merged = new Map(cached.map((r) => [r.taskId, r.data]));
  for (const t of active) merged.set(t.id, t);
  const known = descendants([...merged.values()], root);
  if (known.length > 100) throw new WorkFault("AI_SOURCE_TOO_LARGE", 409);
  const proved: TodoistTask[] = [],
    unknown: { id: string; content: string }[] = [];
  for (const t of known) {
    const existing = active.find((r) => r.id === t.id);
    if (existing) {
      proved.push(existing);
      continue;
    }
    try {
      const fresh = await reader.task(token, t.id);
      if (fresh.project_id === scope.projectId && !fresh.is_deleted)
        proved.push(fresh);
      else unknown.push({ id: t.id, content: t.content });
    } catch (e) {
      if (e instanceof TodoistFault && e.code === "task_unavailable")
        unknown.push({ id: t.id, content: t.content });
      else throw e;
    }
  }
  // Historical parents alone do not establish a current native relationship.
  const current = descendants(proved, root);
  for (const t of proved)
    if (!current.some((r) => r.id === t.id))
      unknown.push({ id: t.id, content: t.content });
  return { children: current, unknownChildren: unknown };
}
