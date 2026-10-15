import type { TaskCommand, TodoistTask } from "@helios/contracts";
import type { TodoistReader } from "../work/todoist";
import { WorkFault } from "../work/service";
import { fingerprint } from "../tasks/hash";
import { descendants } from "../tasks/hierarchy";
export type EpicClosure = {
  roots: string[];
  comments: Record<
    string,
    { id: string; content: string; posted_at: string | null }[]
  >;
};
export async function prepareEpicClosure(
  reader: TodoistReader,
  token: string,
  command: TaskCommand,
  source: TodoistTask | null,
  children: TodoistTask[],
): Promise<EpicClosure | undefined> {
  if (command.action !== "close" || !source?.labels.includes("epic")) {
    if (command.epicClosePolicy) throw new WorkFault("INVALID_REQUEST");
    return;
  }
  if (source.due?.is_recurring)
    throw new WorkFault("EPIC_RECURRENCE_UNSAFE", 409);
  if (children.some((c) => c.project_id !== source.project_id))
    throw new WorkFault("TASK_SCOPE_CONFLICT", 409);
  if (!children.length) return { roots: [], comments: {} };
  if (command.epicClosePolicy !== "detach" || !command.acknowledgeHierarchy)
    throw new WorkFault("EPIC_CHILDREN_POLICY", 409);
  if (children.length > 100) throw new WorkFault("EPIC_HIERARCHY_LIMIT", 409);
  const roots = children
    .filter((c) => c.parent_id === source.id)
    .map((c) => c.id);
  if (!roots.length) throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
  const comments: EpicClosure["comments"] = {};
  for (const c of children) comments[c.id] = await reader.comments(token, c.id);
  return { roots, comments };
}
const stable = (t: TodoistTask) => ({ ...t, updated_at: null });
export async function verifyEpicDetach(
  reader: TodoistReader,
  token: string,
  payload: {
    source: TodoistTask | null;
    children: TodoistTask[];
    epicClosure?: EpicClosure;
  },
  root: TodoistTask,
) {
  if (!payload.source || !payload.epicClosure?.roots.includes(root.id))
    throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
  const expected = [root, ...descendants(payload.children, root.id)];
  for (const before of expected) {
    const after = await reader.task(token, before.id);
    const desired = {
      ...before,
      project_id: payload.source.project_id,
      section_id: null,
      ...(before.id === root.id ? { parent_id: null } : {}),
    };
    if (fingerprint(stable(after)) !== fingerprint(stable(desired)))
      throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
    const comments = await reader.comments(token, before.id);
    if (
      fingerprint(comments) !==
      fingerprint(payload.epicClosure.comments[before.id] ?? [])
    )
      throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
  }
  return expected.map((t) => t.id);
}
