import type { AiOutput, AiDraftView } from "@helios/contracts";
import type { AiSource } from "../ai/schema";
import { WorkFault } from "../work/service";
export function validateEpicOutput(
  kind: AiDraftView["kind"],
  input: string,
  source: AiSource | null,
  output: AiOutput,
  texts: string[],
) {
  const bad = () => {
    throw new WorkFault("AI_PATCH_INVALID", 409);
  };
  if (
    ["smart", "epic"].includes(kind) &&
    /\b\d+(?:[.,]\d+)?\s*%/.test(JSON.stringify(output))
  )
    bad();
  if (
    ["smart", "epic", "decomposition"].includes(kind) &&
    output.estimatedMinutes !== null
  )
    bad();
  if (kind !== "smart" && output.smart) bad();
  if (kind !== "epic" && output.understanding) bad();
  if (kind === "smart") {
    if (
      !output.smart ||
      new Set(output.smart.map((s) => s.component)).size !== 5
    )
      bad();
    for (const s of output.smart ?? []) {
      if (
        s.component === "T" &&
        s.status === "known" &&
        /(?:Termin.*aufgehoben|kein.*Termin)/i.test(
          source?.userCorrection ?? "",
        )
      )
        bad();
      if (s.status === "known" && !smartEvidence(s.component, s.evidence ?? ""))
        bad();
      if (
        s.status === "known" &&
        (!s.evidence || !texts.some((t) => t.includes(s.evidence!)))
      )
        bad();
      if (s.status !== "known" && !s.question) bad();
    }
    for (const p of output.patches) {
      // Concrete dates/numbers in a proposed goal must already occur in an allowed source.
      const tokens = p.value.match(/\d+(?:[.,:/-]\d+)*/g) ?? [];
      if (tokens.some((n) => !texts.some((t) => t.includes(n)))) bad();
      if (
        /\b(?:morgen|übermorgen|nächste Woche|Ende (?:der|des))\b/i.test(
          p.value,
        ) &&
        !texts.some((t) => t.includes(p.value))
      )
        bad();
    }
  }
  if (kind === "epic") {
    if (
      !source?.inspection.task.labels.includes("epic") ||
      !output.understanding ||
      output.patches.length
    )
      bad();
    const known = [source!.inspection.task, ...source!.children];
    const ids = new Set(known.map((t) => t.id));
    for (const c of output.understanding?.contributions ?? [])
      if (
        !ids.has(c.taskId) ||
        ![
          ...(source?.childComments ?? [])
            .filter((x) => x.taskId === c.taskId)
            .flatMap((x) => x.comments.map((v) => v.content)),
          source?.userCorrection ?? "",
          input,
          ...known
            .filter((t) => t.id === c.taskId)
            .flatMap((t) => [t.content, t.description]),
          ...source!.inspection.comments.map((c) => c.content),
        ].some((t) => t.includes(c.evidence))
      )
        bad();
    for (const d of output.understanding?.dependencies ?? [])
      if (
        !ids.has(d.from) ||
        !ids.has(d.to) ||
        d.from === d.to ||
        !texts.some((t) => t.includes(d.evidence))
      )
        bad();
    for (const n of output.understanding?.nextSteps ?? [])
      if (!ids.has(n.taskId) || !texts.some((t) => t.includes(n.evidence)))
        bad();
  }
  void input;
}

export function smartEvidence(component: string, evidence: string) {
  if (component === "T") {
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
