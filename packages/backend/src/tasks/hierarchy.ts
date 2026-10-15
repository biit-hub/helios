import type { TodoistTask } from "@helios/contracts";
export function descendants(rows: TodoistTask[], taskId: string) {
  const ids = new Set([taskId]);
  let change = true;
  while (change) {
    change = false;
    for (const row of rows)
      if (row.parent_id && ids.has(row.parent_id) && !ids.has(row.id)) {
        ids.add(row.id);
        change = true;
      }
  }
  return rows
    .filter((t) => t.id !== taskId && ids.has(t.id))
    .sort((a, b) => a.id.localeCompare(b.id));
}
