import type { AiOutput, AiDraftView, AiPatch } from "@helios/contracts";
import type { AiSource } from "../ai/schema";
import { WorkFault } from "../work/service";
const invalid = () => {
  throw new WorkFault("AI_PATCH_INVALID", 409);
};
export function validateEpicOutput(
  kind: AiDraftView["kind"],
  input: string,
  source: AiSource | null,
  output: AiOutput,
  texts: string[],
) {
  if (
    ["smart", "epic"].includes(kind) &&
    /\b\d+(?:[.,]\d+)?\s*%/.test(JSON.stringify(output))
  )
    invalid();
  if (
    ["smart", "epic", "decomposition"].includes(kind) &&
    output.estimatedMinutes !== null
  )
    invalid();
  if (kind !== "smart" && output.smart) invalid();
  if (kind !== "epic" && output.understanding) invalid();
  if (kind === "smart") validateSmart(output, source, texts);
  if (kind === "epic") validateUnderstanding(output, source, input, texts);
}
function validateSmart(
  output: AiOutput,
  source: AiSource | null,
  texts: string[],
) {
  if (!output.smart || new Set(output.smart.map((s) => s.component)).size !== 5)
    invalid();
  for (const s of output.smart ?? [])
    validateComponent(s, source?.userCorrection ?? "", texts);
  for (const p of output.patches) validateGoalFacts(p, texts);
}
function validateComponent(
  s: NonNullable<AiOutput["smart"]>[number],
  correction: string,
  texts: string[],
) {
  if (
    s.component === "T" &&
    s.status === "known" &&
    /(?:Termin.*aufgehoben|kein.*Termin)/i.test(correction)
  )
    invalid();
  if (s.status === "known") {
    if (!smartEvidence(s.component, s.evidence ?? "")) invalid();
    if (!s.evidence || !texts.some((t) => t.includes(s.evidence!))) invalid();
  } else if (!s.question) invalid();
}
function validateGoalFacts(p: AiPatch, texts: string[]) {
  const numbers = p.value.match(/\d+(?:[.,:/-]\d+)*/g) ?? [];
  if (numbers.some((n) => !texts.some((t) => t.includes(n)))) invalid();
  if (
    /\b(?:morgen|übermorgen|nächste Woche|Ende (?:der|des))\b/i.test(p.value) &&
    !texts.some((t) => t.includes(p.value))
  )
    invalid();
}
function contributionTexts(source: AiSource, taskId: string, input: string) {
  const tasks = [source.inspection.task, ...source.children].filter(
    (t) => t.id === taskId,
  );
  return [
    input,
    source.userCorrection ?? "",
    ...tasks.flatMap((t) => [t.content, t.description]),
    ...source.inspection.comments.map((c) => c.content),
    ...(source.childComments ?? [])
      .filter((x) => x.taskId === taskId)
      .flatMap((x) => x.comments.map((c) => c.content)),
  ];
}
function validateUnderstanding(
  output: AiOutput,
  source: AiSource | null,
  input: string,
  texts: string[],
) {
  if (
    !source?.inspection.task.labels.includes("epic") ||
    !output.understanding ||
    output.patches.length
  )
    invalid();
  const s = source!,
    u = output.understanding!,
    ids = new Set([s.inspection.task.id, ...s.children.map((t) => t.id)]);
  for (const c of u.contributions) {
    if (
      !ids.has(c.taskId) ||
      !contributionTexts(s, c.taskId, input).some((t) => t.includes(c.evidence))
    )
      invalid();
  }
  for (const d of u.dependencies) validateDependency(d, ids, texts);
  for (const n of u.nextSteps) {
    if (!ids.has(n.taskId) || !texts.some((t) => t.includes(n.evidence)))
      invalid();
  }
}
function validateDependency(
  d: NonNullable<AiOutput["understanding"]>["dependencies"][number],
  ids: Set<string>,
  texts: string[],
) {
  if (
    !ids.has(d.from) ||
    !ids.has(d.to) ||
    d.from === d.to ||
    !texts.some((t) => t.includes(d.evidence))
  )
    invalid();
}
export function smartEvidence(component: string, evidence: string) {
  if (component === "T") return hasTimeEvidence(evidence);
  if (
    ["A", "R"].includes(component) &&
    /\b(?:kein\p{L}*|nicht|unbekannt|fehlt)\b/iu.test(evidence)
  )
    return false;
  if (component === "A")
    return /(?:akzeptier|zugestimmt|einverstanden|freigegeben|mir wichtig|ich will|ich möchte|Nutzen|Zustimmung|motivier|attraktiv|gewünscht)/i.test(
      evidence,
    );
  if (component === "R")
    return /(?:Ressource|Kapazität|Budget|Stunden?|Wochen?|Tage|Quellen|Erfahrung|Kenntnisse|Fähigkeit|verfügbar|machbar|realistisch|Zugang|Werkzeug|Personal)/i.test(
      evidence,
    );
  return true;
}
function hasTimeEvidence(evidence: string) {
  const date =
    /\b\d{4}-\d{2}-\d{2}\b/.test(evidence) ||
    /\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/.test(evidence);
  const names = new Set([
    "heute",
    "morgen",
    "übermorgen",
    "montag",
    "dienstag",
    "mittwoch",
    "donnerstag",
    "freitag",
    "samstag",
    "sonntag",
    "januar",
    "februar",
    "märz",
    "april",
    "mai",
    "juni",
    "juli",
    "august",
    "september",
    "oktober",
    "november",
    "dezember",
  ]);
  const named = (evidence.toLocaleLowerCase().match(/\p{L}+/gu) ?? []).some(
    (w) => names.has(w),
  );
  return (
    (date || named) && !/(?:kein|aufgehoben|ohne|unbekannt)/i.test(evidence)
  );
}
