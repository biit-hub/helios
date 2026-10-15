import { z } from "zod";
import {
  taskPatch,
  type TaskCommand,
  type DraftPatch,
} from "@helios/contracts";
import type { AiDraft } from "./schema";
import { patchChecklist, appendDescription } from "./checklist";
import { patchDocument } from "../tasks/document";
import { WorkFault } from "../work/service";
import { fingerprint } from "../tasks/hash";
export function patchCommand(d: AiDraft, p: DraftPatch): Partial<TaskCommand> {
  const source = d.source?.inspection.task;
  const value = p.edited;
  if (p.kind === "goal")
    return {
      action: "update",
      fields: {
        description: patchDocument(source!.description, {
          kind: "goal",
          value,
        }),
      },
    };
  if (p.kind === "comment") return { action: "comment", comment: value };
  if (p.kind === "subtask")
    return {
      action: "create",
      projectId: source!.project_id,
      parentId: source!.id,
      fields: {
        content: value,
        labels: source!.labels.includes("fun") ? ["fun"] : [],
      },
    };
  if (p.kind === "remaining")
    return { action: "update", fields: { duration: Number(value) } };
  if (p.kind === "description-append")
    return {
      action: "update",
      fields: { description: appendDescription(source!.description, value) },
    };
  if (p.kind === "check-add" || p.kind === "check-complete")
    return {
      action: "update",
      fields: {
        description: patchChecklist(
          source!.description,
          p.kind,
          value,
          p.target,
        ),
      },
    };
  throw new WorkFault("AI_PATCH_INVALID", 409);
}
export function captureFields(d: AiDraft) {
  const selected = d.patches.filter((p) => p.selected && !p.rejected);
  const title = selected.find((p) => p.kind === "title");
  if (!title) throw new WorkFault("AI_TITLE_REQUIRED", 409);
  const fields: z.infer<typeof taskPatch> = {
    ...d.manualFields,
    content: title.edited,
  };
  const manualKinds = {
    title: "content",
    "description-append": "description",
    remaining: "duration",
    due: "due",
    deadline: "deadline",
  } as const;
  for (const p of d.patches)
    if (!p.selected || p.rejected) {
      const field = manualKinds[p.kind as keyof typeof manualKinds];
      if (field) delete fields[field];
    }
  const descriptions = selected.filter((p) => p.kind === "description-append");
  if (descriptions.length)
    fields.description = descriptions.map((p) => p.edited).join("\n\n");
  for (const p of selected) {
    if (p.kind === "remaining") fields.duration = Number(p.edited);
    if (p.kind === "due") fields.due = p.edited;
    if (p.kind === "deadline") fields.deadline = p.edited;
  }
  return taskPatch.parse(fields);
}

export function assertCommandDecision(
  d: AiDraft,
  p: DraftPatch,
  command: TaskCommand,
) {
  const bad = () => {
    throw new WorkFault("AI_DRAFT_CONFLICT", 409);
  };
  if (
    command.contextId !== d.contextId ||
    command.acknowledgeHierarchy ||
    command.acknowledgeDestructive ||
    command.acknowledgeRecurrenceChange ||
    command.waiting
  )
    bad();
  if (d.kind === "capture") {
    if (
      p.kind !== "title" ||
      command.action !== "create" ||
      command.taskId ||
      command.parentId ||
      command.sectionId ||
      command.comment ||
      fingerprint(command.fields) !== fingerprint(captureFields(d))
    )
      bad();
    return;
  }
  const expected = patchCommand(d, p);
  if (
    command.action !== expected.action ||
    fingerprint(command.fields) !== fingerprint(expected.fields) ||
    command.comment !== expected.comment ||
    (command.parentId ?? null) !== (expected.parentId ?? null) ||
    (command.sectionId ?? null) !== (expected.sectionId ?? null) ||
    (command.projectId ?? null) !== (expected.projectId ?? null) ||
    (expected.action === "create"
      ? !!command.taskId
      : command.taskId !== d.taskId)
  )
    bad();
}
