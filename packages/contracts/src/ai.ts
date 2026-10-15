import { z } from "zod";
import { taskPatch } from "./tasks";
export const aiKind = z.enum([
  "capture",
  "analysis",
  "clarification",
  "progress",
]);
export const aiPatch = z.strictObject({
  kind: z.enum([
    "title",
    "description-append",
    "comment",
    "check-add",
    "check-complete",
    "remaining",
    "due",
    "deadline",
    "project",
    "subtask",
  ]),
  value: z.string().trim().min(1).max(4000),
  target: z.string().max(500).nullable(),
  evidence: z.string().trim().min(1).max(2000),
  reason: z.string().trim().min(1).max(1000),
});
export const aiOutput = z.strictObject({
  clarity: z.enum(["clear", "needs_context", "uncertain"]),
  feasibility: z.enum([
    "executable",
    "missing_prerequisite",
    "blocked",
    "uncertain",
  ]),
  missing: z.array(z.string().trim().min(1).max(500)).max(6),
  reason: z.string().max(1000),
  nextStep: z.string().max(1000).nullable(),
  estimatedMinutes: z.number().int().min(1).max(14400).nullable(),
  uncertainty: z.string().trim().min(1).max(1000),
  patches: z.array(aiPatch).max(8),
});
export type AiOutput = z.infer<typeof aiOutput> & {
  validationNotes?: string[];
  modelDigest?: string;
};
export type AiPatch = z.infer<typeof aiPatch>;
export type DraftPatch = AiPatch & {
  id: string;
  selected: boolean;
  rejected: boolean;
  edited: string;
  operationId: string | null;
  status: string;
};
export const aiRequest = z.strictObject({
  key: z.uuid(),
  kind: aiKind,
  contextId: z.uuid().nullable(),
  taskId: z.string().min(1).max(200).optional(),
  input: z.string().max(8000),
  manualFields: taskPatch.optional(),
  expectedInstanceKey: z.string().min(1).max(500).optional(),
});
export const draftEdit = z.strictObject({
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
  patches: z
    .array(
      z.strictObject({
        id: z.uuid(),
        selected: z.boolean(),
        rejected: z.boolean(),
        value: z.string().trim().min(1).max(12000),
        target: z.string().max(500).nullable().optional(),
      }),
    )
    .max(8),
});
export const draftRef = z.strictObject({
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
});
export const draftApply = draftRef.extend({
  key: z.uuid(),
  projectId: z.string().max(200).nullable(),
  confirmProject: z.boolean(),
});
export type AiDraftView = {
  instanceKey?: string | null;
  id: string;
  contextId: string | null;
  taskId: string | null;
  kind: z.infer<typeof aiKind>;
  input: string;
  timezone: string;
  manualFields: z.infer<typeof taskPatch>;
  revision: number;
  status: string;
  code: string | null;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  sourceFingerprint: string;
  patches: DraftPatch[];
  output: AiOutput | null;
  staleDate: boolean;
  confirmedClear: boolean;
  checklist: { text: string; checked: boolean }[];
  createdAt: string;
  operationId: string | null;
};
