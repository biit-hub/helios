import type { TodoistReader } from "../work/todoist";
import { WorkFault } from "../work/service";
export async function validateUserLabels(
  reader: TodoistReader,
  token: string,
  desired: string[] | undefined,
  original: string[] = [],
) {
  const added = (desired ?? []).filter((name) => !original.includes(name));
  if (!added.length) return;
  const available = new Set(await reader.labels(token));
  if (added.some((name) => !available.has(name)))
    throw new WorkFault("LABEL_NOT_AVAILABLE", 409);
}
