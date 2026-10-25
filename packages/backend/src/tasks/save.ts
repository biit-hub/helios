import type { DocumentChange, TaskPatch, TodoistTask } from "@helios/contracts";
import { taskPatch } from "@helios/contracts";
import { patchDocument, readGoal, descriptionLinks } from "./document";
import { readChecklist } from "../ai/checklist";
import { WorkFault } from "../work/service";

function sectionValue(text: string, change: DocumentChange) {
  if (change.kind === "goal") return readGoal(text);
  if (change.kind === "checklist")
    return readChecklist(text).map(({ text, checked }) => ({ text, checked }));
  return descriptionLinks(text);
}

// Derive the native patch on the server, both for preview and at execution.
// The original command and its source basis remain the journalled intent.
export function prepareTaskSave(
  source: TodoistTask,
  input: TaskPatch,
  documents: DocumentChange[] = [],
  acknowledgeRecurrenceChange = false,
): TaskPatch {
  const fields = taskPatch.parse(input);
  if (fields.recurring && fields.due !== undefined)
    throw new WorkFault("INVALID_REQUEST");
  if (
    source.due?.is_recurring &&
    fields.due !== undefined &&
    !acknowledgeRecurrenceChange
  )
    throw new WorkFault("RECURRENCE_CONFIRMATION_REQUIRED", 409);
  const edited = fields.description ?? source.description;
  let description = edited;
  const sections = new Set<string>();
  for (const change of documents) {
    const key =
      change.kind === "link-edit" ? "link:" + change.target : change.kind;
    if (change.kind !== "link-add" && sections.has(key))
      throw new WorkFault("INVALID_REQUEST");
    sections.add(key);
    if (
      JSON.stringify(sectionValue(source.description, change)) !==
      JSON.stringify(sectionValue(edited, change))
    )
      throw new WorkFault("TASK_SAVE_OVERLAP", 409);
    description = patchDocument(description, change);
  }
  if (documents.length) fields.description = description;
  if (!Object.keys(fields).length) throw new WorkFault("INVALID_REQUEST");
  return fields;
}
