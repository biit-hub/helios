import { validateEpicOutput } from "../epics/validation";
import { dateIsGrounded, referenceDay, aiTimezone } from "./dates";
import type { AiOutput, AiDraftView } from "@helios/contracts";
import { WorkFault } from "../work/service";
import type { AiSource } from "./schema";
import { readChecklist } from "./checklist";
const allowed: Record<AiDraftView["kind"], string[]> = {
  smart: ["goal"],
  epic: [],
  decomposition: ["check-add", "subtask"],
  capture: [
    "title",
    "description-append",
    "remaining",
    "due",
    "deadline",
    "project",
  ],
  analysis: ["description-append", "check-add", "remaining"],
  clarification: ["description-append", "check-add", "remaining"],
  progress: [
    "comment",
    "check-complete",
    "check-add",
    "description-append",
    "remaining",
    "subtask",
  ],
};
export function validateOutput(
  kind: AiDraftView["kind"],
  input: string,
  source: AiSource | null,
  output: AiOutput,
  projects: string[] = [],
  anchorDay = referenceDay(new Date(), aiTimezone()),
) {
  const evidenceTexts = [input];
  if (source) {
    const task = source.inspection.task;
    evidenceTexts.push(
      task.content,
      task.description,
      ...source.inspection.comments.map((c) => c.content),
      ...source.children.flatMap((c) => [c.content, c.description]),
      ...(source.childComments ?? []).flatMap((c) =>
        c.comments.map((v) => v.content),
      ),
      source.userCorrection ?? "",
      ...(source.ancestorCorrections ?? []).map((c) => c.text),
    );
    for (const ancestor of source.ancestors ??
      (source.parent ? [source.parent] : []))
      evidenceTexts.push(ancestor.content, ancestor.description);
    if (task.due?.date) evidenceTexts.push(task.due.date);
    if (task.deadline?.date) evidenceTexts.push(task.deadline.date);
  }
  validateEpicOutput(kind, input, source, output, evidenceTexts);
  const seen = new Set<string>();
  const bad = () => {
    throw new WorkFault("AI_PATCH_INVALID", 409);
  };
  if (
    output.clarity === "needs_context" &&
    (!output.missing.length || !output.reason.trim())
  )
    bad();
  if (output.patches.some((p) => /\b\d+(?:[.,]\d+)?\s*%/.test(p.value))) bad();
  for (const p of output.patches) {
    if (
      !allowed[kind].includes(p.kind) ||
      !evidenceTexts.some((text) => text.includes(p.evidence))
    )
      bad();
    const key = p.kind + ":" + (p.target ?? p.value);
    if (seen.has(key)) bad();
    seen.add(key);
    if (
      p.kind === "check-add" &&
      source &&
      p.value === source.inspection.task.content
    )
      bad();
    if (
      p.kind === "description-append" &&
      source?.inspection.task.description.includes(p.value)
    )
      bad();
    if (p.kind !== "check-complete" && p.target !== null) bad();
    if (p.kind === "check-complete") {
      if (
        kind !== "progress" ||
        !input.includes(p.evidence) ||
        /\b(nicht|fehlt|fehlen|offen|noch nicht)\b/i.test(p.evidence)
      )
        bad();
      const item = readChecklist(
        source?.inspection.task.description ?? "",
      ).find((x) => x.text === p.target);
      if (!item || item.checked) bad();
    }
    if (p.kind === "comment" && !input.includes(p.evidence)) bad();
    if (
      ["check-add", "subtask", "title"].includes(p.kind) &&
      (/[\r\n]/.test(p.value) || p.value.length > 500)
    )
      bad();
    if (
      p.kind === "subtask" &&
      (p.reason.length < 20 ||
        !(kind === "decomposition"
          ? evidenceTexts.some((t) => t.includes(p.evidence))
          : input.includes(p.evidence)))
    )
      bad();
    if (
      p.kind === "remaining" &&
      (!/^\d{1,5}$/.test(p.value) ||
        Number(p.value) < 1 ||
        Number(p.value) > 14400)
    )
      bad();
    if (
      (p.kind === "due" || p.kind === "deadline") &&
      !dateIsGrounded(p.kind, p.value, p.evidence, anchorDay)
    )
      bad();
    if (
      p.kind === "project" &&
      (!projects.includes(p.value) || !input.includes(p.evidence))
    )
      bad();
  }
  if (
    kind === "capture" &&
    output.patches.filter((p) => p.kind === "title").length !== 1
  )
    bad();
  const existing = source
    ? readChecklist(source.inspection.task.description)
    : [];
  const patches = output.patches.filter(
    (p) =>
      !(
        ["check-add", "subtask"].includes(p.kind) &&
        (existing.some(
          (x) => x.text.toLocaleLowerCase() === p.value.toLocaleLowerCase(),
        ) ||
          source?.children.some(
            (x) =>
              x.content.toLocaleLowerCase() === p.value.toLocaleLowerCase(),
          ))
      ),
  );
  return patches.length === output.patches.length
    ? output
    : {
        ...output,
        patches,
        validationNotes: [
          "Ein bereits vorhandener Checklistenpunkt wurde als unverändernder Doppelvorschlag verworfen.",
        ],
      };
}
export function needsContext(output: AiOutput, confirmedClear: boolean) {
  return (
    !confirmedClear &&
    output.clarity === "needs_context" &&
    output.missing.length > 0 &&
    output.reason.trim().length > 0 &&
    !optionalMetadataOnly(output.reason)
  );
}

function optionalMetadataOnly(reason: string) {
  const text = reason.trim().replace(/[.!]+$/, "");
  return /^(?:(?:die?|das|ein[ e]?|eine)\s+)?(?:(?:fehlend(?:e|er|es)?|kein(?:e|er|es)?)\s+(?:beschreibung|datum|projekt(?:zuordnung)?)|(?:beschreibung|datum|projekt(?:zuordnung)?)\s+(?:fehlt|fehlen|ist nicht (?:vorhanden|gesetzt|angegeben)))$/i.test(
    text,
  );
}
