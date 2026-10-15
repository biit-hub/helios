import { and, eq } from "drizzle-orm";
import {
  agendaState,
  entryKey,
  type AgendaArea,
  type PlanEntry,
  type AgendaState,
} from "@helios/contracts";
import * as store from "./store";
import { dailyPlans, observations } from "./schema";
import { WorkFault } from "../work/service";
export type PlanLink = {
  planId: string;
  revision: number;
  action: "add" | "close";
  entry: PlanEntry;
  area: AgendaArea;
  day: string;
  contextId: string;
  requestHash: string;
};
export async function linkPlan(
  db: store.Db,
  link: PlanLink,
  operationId: string,
) {
  const [p] = await db
    .select()
    .from(dailyPlans)
    .where(eq(dailyPlans.id, link.planId));
  store.expected(p, link.revision);
  if (
    p.status !== "confirmed" ||
    p.projectId !== link.entry.source.project_id ||
    p.contextId !== link.contextId ||
    p.day !== link.day
  )
    throw store.conflict();
  const state = structuredClone(agendaState(p));
  const key = entryKey(link.entry);
  if (state.pending.some((item) => item.entry.taskId === link.entry.taskId))
    throw store.conflict();
  if (
    link.action === "add" &&
    (state.main.includes(key) ||
      state.reserve.includes(key) ||
      state.retired.includes(key))
  )
    throw new WorkFault("PLAN_DUPLICATE", 409);
  if (link.action === "close" && !state.reserve.includes(key))
    throw store.conflict();
  if (
    link.action === "add" &&
    p.entries.length +
      state.extra.length +
      state.pending.filter((item) => item.action === "add").length >=
      200
  )
    throw new WorkFault("PLAN_LIMIT", 409);
  state.pending.push({
    operationId,
    action: link.action,
    entry: link.entry,
    area: link.area,
  });
  const next = await store.change(db, p, { agenda: state });
  await observeLinked(
    db,
    next,
    link.action === "add"
      ? "task_addition_requested"
      : "reserve_completion_requested",
    link,
    operationId,
  );
}
export async function finishPlanLink(
  db: store.Db,
  link: PlanLink,
  operationId: string,
) {
  const [p] = await db
    .select()
    .from(dailyPlans)
    .where(eq(dailyPlans.id, link.planId));
  if (!p || p.contextId !== link.contextId || p.status !== "confirmed")
    throw store.conflict();
  const state = structuredClone(agendaState(p));
  if (!state.pending.some((item) => item.operationId === operationId)) return;
  const key = entryKey(link.entry);
  if (link.action === "add") {
    if (!state.main.includes(key) && !state.reserve.includes(key)) {
      if (![...p.entries, ...state.extra].some((e) => entryKey(e) === key))
        state.extra.push(link.entry);
      state[link.area].push(key);
    }
  } else {
    state.reserve = state.reserve.filter((id) => id !== key);
    if (!state.retired.includes(key)) state.retired.push(key);
  }
  state.pending = state.pending.filter(
    (item) => item.operationId !== operationId,
  );
  const focus =
    p.focusTaskId ??
    (link.action === "add" && link.area === "main" ? link.entry.taskId : null);
  const next = await store.change(db, p, { agenda: state, focusTaskId: focus });
  await observeLinked(
    db,
    next,
    link.action === "add" ? "task_consciously_added" : "reserve_completed",
    link,
    operationId,
  );
}
export async function recordAgenda(
  db: store.Db,
  p: store.Plan,
  event: string,
  key: string,
  hash: string,
  detail: Record<string, unknown>,
  taskId: string | null = null,
) {
  await db.insert(observations).values({
    id: crypto.randomUUID(),
    planId: p.id,
    contextId: p.contextId,
    revision: p.revision,
    event,
    taskId,
    key,
    requestHash: hash,
    detail,
  });
}
export async function previousAgenda(
  db: store.Db,
  planId: string,
  key: string,
  hash: string,
) {
  const [previous] = await db
    .select()
    .from(observations)
    .where(and(eq(observations.planId, planId), eq(observations.key, key)));
  if (previous && previous.requestHash !== hash) throw store.conflict();
  return !!previous;
}
export function assertOrder(actual: string[], order: string[]) {
  if (
    order.length !== actual.length ||
    new Set(order).size !== order.length ||
    order.some((id) => !actual.includes(id))
  )
    throw store.conflict();
}
export function transferEntry(
  state: AgendaState,
  key: string,
  area: AgendaArea,
) {
  const origin = state.main.includes(key)
    ? "main"
    : state.reserve.includes(key)
      ? "reserve"
      : null;
  if (!origin || state.pending.some((p) => entryKey(p.entry) === key))
    throw store.conflict();
  if (origin === area) return;
  state[origin] = state[origin].filter((id) => id !== key);
  state[area].push(key);
}

async function observeLinked(
  db: store.Db,
  p: store.Plan,
  event: string,
  link: PlanLink,
  operationId: string,
) {
  await db
    .insert(observations)
    .values({
      id: crypto.randomUUID(),
      planId: p.id,
      contextId: p.contextId,
      revision: p.revision,
      event,
      taskId: link.entry.taskId,
      detail: {
        sourceRevision: link.revision,
        operationId,
        instanceKey: entryKey(link.entry),
        area: link.area,
      },
    });
}
