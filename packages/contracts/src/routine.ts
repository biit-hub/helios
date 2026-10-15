import { z } from "zod";
import type { PlanView, PlanEntry } from "./planning";
import type { TodoistTask } from "./work";
export const routineSteps = [
  "inbox",
  "contexts",
  "review",
  "enrichment",
  "planning",
  "problems",
] as const;
export type RoutineStep = (typeof routineSteps)[number];
export type RoutineStepState = "open" | "started" | "done" | "skipped_open";
export type RoutineCursor = { step: RoutineStep; contextId: string | null };
export const routineCommand = z.strictObject({
  key: z.uuid(),
  id: z.uuid().optional(),
  revision: z.number().int().nonnegative().optional(),
  contextId: z.uuid().nullable().optional(),
  contextRevision: z.number().int().nonnegative().optional(),
  step: z.enum(routineSteps).optional(),
  contextIds: z.array(z.uuid()).max(100).optional(),
  taskId: z.string().min(1).max(200).optional(),
  basis: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  projectId: z.string().min(1).max(200).optional(),
  items: z
    .array(
      z.strictObject({
        entryKey: z.string().min(1).max(500),
        basis: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .min(1)
    .max(200)
    .optional(),
  entryKeys: z.array(z.string().min(1).max(500)).min(1).max(200).optional(),
  feedback: z.enum(["completed", "not_started", "partial"]).optional(),
  draftId: z.uuid().optional(),
  acknowledgeDestructive: z.boolean().default(false),
  acknowledgeHierarchy: z.boolean().default(false),
});
export type RoutineCommand = z.infer<typeof routineCommand>;
export type ReviewFeedbackView = {
  id: string;
  entryKey: string;
  status: "unknown" | "not_started" | "partial" | "completed";
  requested: string | null;
  operationId: string | null;
  draftId: string | null;
  confirmedAt: string | null;
  operationStatus: string | null;
  code: string | null;
};
export type RoutineContextView = {
  id: string;
  contextId: string;
  revision: number;
  selected: boolean;
  position: number;
  steps: Record<"review" | "enrichment" | "planning", RoutineStepState>;
  reviewPlan: PlanView | null;
  reviewHistoryId: string | null;
  feedback: ReviewFeedbackView[];
};
export type RoutineView = {
  pendingReviews?: {key:string;command:RoutineCommand}[];
  id: string;
  day: string;
  timezone: string;
  startedAt: string;
  revision: number;
  steps: Record<"inbox" | "contexts" | "problems", RoutineStepState>;
  cursor: RoutineCursor;
  deferredIds: string[];
  inboxSuccesses: number;
  contexts: RoutineContextView[];
  complete: boolean;
};
export type RoutineSnapshot = {
  day: string;
  timezone: string;
  routine: RoutineView | null;
};
export type InboxCard = {
  task: TodoistTask;
  basis: string;
  children: { id: string; content: string }[];
} | null;
export type ReviewItem = {
  entry: PlanEntry;
  entryKey: string;
  feedback: ReviewFeedbackView | null;
  native: "active" | "completed" | "instance_changed" | "unknown";
  basis: string | null;
  code: string | null;
};
