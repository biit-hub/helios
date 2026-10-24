import type { TaskView } from "@helios/contracts";
/** Presentation only. Keep section scopes and hierarchy; never reorder a plan or write to Todoist. */
export function nativeTaskOrder(tasks: readonly TaskView[]): TaskView[] {
  const original = new Map(tasks.map((t, i) => [t.data.id, i]));
  const ids = new Set(tasks.map((t) => t.data.id));
  const children = new Map<string, TaskView[]>();
  const roots = new Map<string, TaskView[]>();
  for (const task of tasks) {
    const parent = task.data.parent_id;
    const groups = parent && ids.has(parent) ? children : roots;
    const key =
      parent && ids.has(parent) ? parent : (task.data.section_id ?? "");
    const rows = groups.get(key) ?? [];
    rows.push(task);
    groups.set(key, rows);
  }
  const compare = (a: TaskView, b: TaskView) => {
    if (
      a.data.order_key &&
      b.data.order_key &&
      a.data.order_key !== b.data.order_key
    )
      return a.data.order_key < b.data.order_key ? -1 : 1;
    if (
      a.data.child_order != null &&
      b.data.child_order != null &&
      a.data.child_order !== b.data.child_order
    )
      return a.data.child_order - b.data.child_order;
    return original.get(a.data.id)! - original.get(b.data.id)!;
  };
  const result: TaskView[] = [],
    seen = new Set<string>();
  const visit = (task: TaskView) => {
    if (seen.has(task.data.id)) return;
    seen.add(task.data.id);
    result.push(task);
    for (const child of [...(children.get(task.data.id) ?? [])].sort(compare))
      visit(child);
  };
  for (const rows of roots.values())
    for (const task of [...rows].sort(compare)) visit(task);
  // Defensive fallback for incomplete/cyclic source hierarchies, without inventing a parent.
  for (const task of tasks) visit(task);
  return result;
}
