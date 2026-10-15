import { promptScopes, promptExamples, promptPrefix } from "./prompt-text";
import { z } from "zod";
import {
  aiOutput,
  aiPatch,
  smartAssessment,
  epicUnderstanding,
} from "@helios/contracts";
import type { AiDraftView } from "@helios/contracts";
export const PROMPT_VERSION = "helios-e8-v1";
export const SCHEMA_VERSION = "helios-ai-v2";
export function prompt(kind: AiDraftView["kind"]) {
  return (
    promptPrefix +
    promptScopes[kind] +
    promptExamples[kind] +
    " Antworte ausschliesslich nach diesem JSON-Schema: " +
    JSON.stringify(outputSchema(kind))
  );
}

const patchKinds: Record<AiDraftView["kind"], string[]> = {
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
  progress: [
    "comment",
    "check-add",
    "check-complete",
    "description-append",
    "remaining",
    "subtask",
  ],
  analysis: ["description-append", "check-add", "remaining"],
  clarification: ["description-append", "check-add", "remaining"],
};
export function outputSchema(kind: AiDraftView["kind"]) {
  const kinds = patchKinds[kind];
  const variants = kinds.map((k) =>
    z.strictObject({
      kind: z.literal(k),
      value:
        k === "remaining"
          ? z.string().regex(/^[0-9]{1,5}$/)
          : z.string().min(1).max(4000),
      target: k === "check-complete" ? z.string().min(1).max(500) : z.null(),
      evidence: z.string().min(1).max(2000),
      reason: z.string().min(1).max(1000),
    }),
  );
  return z.toJSONSchema(
    aiOutput.omit({ smart: true, understanding: true }).extend({
      ...(["smart", "epic", "decomposition"].includes(kind)
        ? { estimatedMinutes: z.null() }
        : {}),
      ...(kind === "smart" ? { smart: smartAssessment } : {}),
      ...(kind === "epic" ? { understanding: epicUnderstanding } : {}),
      patches: z
        .array(
          variants.length
            ? z.union(
                variants as [
                  (typeof variants)[number],
                  (typeof variants)[number],
                  ...typeof variants,
                ],
              )
            : aiPatch,
        )
        .max(kind === "epic" ? 0 : 8),
    }),
  );
}
