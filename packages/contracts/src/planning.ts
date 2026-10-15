import type { CalendarPlanBasis, CalendarOrientation } from "./calendar";
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
  calendarBasis?: CalendarPlanBasis;
  id: string;
  contextId: string;
  day: string;
  timezone: string;
  revision: number;
  status: PlanState;
  entries: PlanEntry[];
  agenda?: AgendaState | null;
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
  calendar?: CalendarOrientation;
  calendarChanged?: boolean;
  editable?: boolean;
  agendaOperations?: OperationView[];
  instanceAvailability?: Record<string, boolean>;
  availability?: Record<string, boolean>;
  day: string;
  timezone: string;
  plan: PlanView | null;
  operation: OperationView | null;
  history: PlanView[];
};

export type AgendaArea = "main" | "reserve";
export type AgendaPending = {
  operationId: string;
  action: "add" | "close";
  entry: PlanEntry;
  area: AgendaArea;
};
export type AgendaState = {
  main: string[];
  reserve: string[];
  paused: boolean;
  extra: PlanEntry[];
  retired: string[];
  pending: AgendaPending[];
};
export function entryKey(entry: Pick<PlanEntry, "taskId" | "source">): string {
  return JSON.stringify([
    entry.taskId,
    entry.source.due?.is_recurring ? entry.source.due.date : null,
  ]);
}
export function agendaState(
  plan: Pick<PlanView, "entries" | "agenda">,
): AgendaState {
  return (
    plan.agenda ?? {
      main: plan.entries.map((entry) => entryKey(entry)),
      reserve: [],
      paused: false,
      extra: [],
      retired: [],
      pending: [],
    }
  );
}
export function agendaEntries(
  plan: Pick<PlanView, "entries" | "agenda">,
  area: AgendaArea,
): PlanEntry[] {
  const state = agendaState(plan);
  const entries = [...plan.entries, ...state.extra];
  return state[area]
    .map((key) => entries.find((entry) => entryKey(entry) === key))
    .filter((entry): entry is PlanEntry => !!entry);
}
const agendaBase = planMutation.extend({ key: z.uuid() });
export const agendaCommand = agendaBase.extend({
  area: z.enum(["main", "reserve"]).optional(),
  order: z.array(z.string().min(1).max(500)).max(200).optional(),
  entryKey: z.string().min(1).max(500).optional(),
  taskId: z.string().min(1).max(200).optional(),
  reason: z.string().trim().max(1000).optional(),
  paused: z.boolean().optional(),
  basis: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  acknowledgeHierarchy: z.boolean().default(false),
  acknowledgeDestructive: z.boolean().default(false),
});
export type AgendaCommand = z.infer<typeof agendaCommand>;
