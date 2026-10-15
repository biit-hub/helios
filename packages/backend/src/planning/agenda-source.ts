import { entryKey } from "@helios/contracts";
import type { TodoistReader } from "../work/todoist";
import { candidates } from "./selection";
import type { PlanLink } from "./agenda-store";
import { WorkFault } from "../work/service";
export async function eligibleEntries(
  reader: TodoistReader,
  token: string,
  projectId: string,
  day: string,
  kind = "employer",
) {
  const [tasks, sections] = await Promise.all([
    reader.tasks(token, projectId),
    reader.sections(token, projectId),
  ]);
  return candidates(
    tasks.map((data) => ({
      data,
      state: "active" as const,
      sectionName: sections.find((s) => s.id === data.section_id)?.name ?? null,
      retrievedAt: new Date().toISOString(),
    })),
    projectId,
    day,
    kind,
    Number.MAX_SAFE_INTEGER,
  );
}
export async function validatePlanAddition(
  reader: TodoistReader,
  token: string,
  link: PlanLink,
) {
  const entries = await eligibleEntries(
    reader,
    token,
    link.entry.source.project_id,
    link.day,
  );
  if (!entries.some((e) => entryKey(e) === entryKey(link.entry)))
    throw new WorkFault("PLAN_TASK_UNAVAILABLE", 409);
}
