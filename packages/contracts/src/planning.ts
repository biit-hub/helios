import { z } from "zod";
import type { TodoistTask } from "./work";
export const planScope = z.strictObject({
  contextId: z.uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const planMutation = planScope.extend({
  revision: z.number().int().nonnegative(),
});
export const confirmPlanInput = planMutation.extend({
  key: z.uuid(),
  taskIds: z.array(z.string().min(1).max(200)).min(1).max(5),
});
export const focusInput = planMutation.extend({
  taskId: z.string().min(1).max(200),
});
export const resumeInput = planMutation.extend({ operationId: z.uuid() });
export type PlanEntry = {
  taskId: string;
  position: number;
  source: TodoistTask;
  sectionName: string | null;
  reasons: string[];
};
export type PlanState = "draft" | "confirming" | "partial" | "confirmed";
export type PlanView = {
  id: string;
  contextId: string;
  day: string;
  timezone: string;
  revision: number;
  status: PlanState;
  entries: PlanEntry[];
  focusTaskId: string | null;
  sourceAt: string;
  confirmedAt: string | null;
};
export type StepView = {
  taskId: string;
  status: string;
  code: string | null;
  attempts: number;
};
export type OperationView = {
  id: string;
  status: string;
  code: string | null;
  retryAt: string | null;
  steps: StepView[];
};
export type PlanningView = {
  availability?: Record<string, boolean>;
  day: string;
  timezone: string;
  plan: PlanView | null;
  operation: OperationView | null;
  history: PlanView[];
};
