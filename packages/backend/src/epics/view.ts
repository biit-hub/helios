import type { EpicDetail } from "@helios/contracts";
import type { AiDraft, AiSource } from "../ai/schema";
import { sourceHash } from "../ai/source";
import { PROMPT_VERSION, SCHEMA_VERSION } from "../ai/prompt";
import { readGoal } from "../tasks/document";
import { readChecklist } from "../ai/checklist";
import { WorkFault } from "../work/service";
export function markdownView(description: string) {
  let goal = "",
    checklist: { text: string; checked: boolean }[] = [],
    markdownError: string | null = null;
  try {
    goal = readGoal(description);
    checklist = readChecklist(description).map(({ text, checked }) => ({
      text,
      checked,
    }));
  } catch (e) {
    markdownError = e instanceof WorkFault ? e.code : "MARKDOWN_AMBIGUOUS";
  }
  return { goal, checklist, markdownError };
}
export function cacheView(
  cache: AiDraft | undefined,
  source: AiSource | null,
  correction: string,
  currentModel: string,
): EpicDetail["cache"] {
  if (!cache?.output || ["rejected", "cancelled"].includes(cache.status))
    return null;
  const fresh =
    !!source &&
    cache.sourceFingerprint === sourceHash(source) &&
    correction === (source.userCorrection ?? "") &&
    cache.promptVersion === PROMPT_VERSION &&
    cache.schemaVersion === SCHEMA_VERSION &&
    cache.model === currentModel;
  return {
    id: cache.id,
    fresh,
    createdAt: cache.createdAt.toISOString(),
    model: cache.model,
    promptVersion: cache.promptVersion,
    schemaVersion: cache.schemaVersion,
    output: cache.output,
  };
}
