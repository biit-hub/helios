import { and, eq, asc } from "drizzle-orm";
import {
  entryKey,
  type RoutineCommand,
  type RoutineStep,
  type RoutineCursor,
} from "@helios/contracts";
import { dailyPlans } from "../planning/schema";
import { WorkFault } from "../work/service";
import type { Db } from "../planning/store";
import { routineDays, routineContexts, type RoutineDay } from "./schema";
import { ownedContext, advanceContext } from "./store";
import { freezeReview, reviewEntries, effectiveFeedback } from "./review";
async function applyContextStep(
  db: Db,
  d: RoutineDay,
  input: RoutineCommand,
  step: RoutineStep,
  contextId: string | null,
  state?: "done" | "skipped_open",
) {
  if (!contextId || input.contextRevision === undefined)
    throw new WorkFault("INVALID_REQUEST", 400);
  const { r } = await ownedContext(db, d, contextId, input.contextRevision);
  let next = r;
  if (step === "review" && !r.reviewHistoryId)
    next = await freezeReview(db, d, r);
  if (state === "done" && step === "review") {
    const feedback = await effectiveFeedback(db, next);
    if (
      reviewEntries(next).some(
        (e) =>
          !feedback.some(
            (f) => f.entryKey === entryKey(e) && f.status !== "unknown",
          ),
      )
    )
      throw new WorkFault("REVIEW_STILL_OPEN", 409);
  }
  if (state === "done" && step === "planning") {
    const [p] = await db
      .select()
      .from(dailyPlans)
      .where(
        and(eq(dailyPlans.contextId, contextId), eq(dailyPlans.day, d.day)),
      );
    if (p?.status !== "confirmed" || p.agenda?.pending.length)
      throw new WorkFault("PLAN_NOT_CONFIRMED", 409);
  }
  await advanceContext(db, next, {
    steps: {
      ...next.steps,
      [step]:
        state ?? (next.steps[step as "review"] === "done" ? "done" : "started"),
    },
  });
}

async function initializeTarget(db: Db, d: RoutineDay, target: RoutineCursor) {
  if (
    ["review", "enrichment", "planning"].includes(target.step) &&
    target.contextId
  ) {
    let { r: targetContext } = await ownedContext(db, d, target.contextId);
    if (target.step === "review")
      targetContext = await freezeReview(db, d, targetContext);
    if (targetContext.steps[target.step as "review"] !== "done")
      await advanceContext(db, targetContext, {
        steps: { ...targetContext.steps, [target.step]: "started" },
      });
  } else if (["inbox", "contexts", "problems"].includes(target.step)) {
    const [latest] = await db
      .select()
      .from(routineDays)
      .where(eq(routineDays.id, d.id));
    if (latest!.steps[target.step as "inbox"] !== "done")
      await db
        .update(routineDays)
        .set({ steps: { ...latest!.steps, [target.step]: "started" } })
        .where(eq(routineDays.id, d.id));
  }
}
export async function cursor(
  db: Db,
  d: RoutineDay,
  input: RoutineCommand,
  state?: "done" | "skipped_open",
) {
  const step = input.step ?? d.cursor.step;
  const contextId = input.contextId ?? null;
  const selected = await db
    .select()
    .from(routineContexts)
    .where(
      and(
        eq(routineContexts.routineId, d.id),
        eq(routineContexts.selected, true),
      ),
    )
    .orderBy(asc(routineContexts.position));
  if (["review", "enrichment", "planning"].includes(step)) {
    await applyContextStep(db, d, input, step, contextId, state);
  } else
    await db
      .update(routineDays)
      .set({
        steps: {
          ...d.steps,
          [step]:
            state ?? (d.steps[step as "inbox"] === "done" ? "done" : "started"),
        },
      })
      .where(eq(routineDays.id, d.id));
  const order: RoutineCursor[] = [
    { step: "inbox", contextId: null },
    { step: "contexts", contextId: null },
    ...selected.flatMap((c) =>
      (["review", "enrichment", "planning"] as RoutineStep[]).map((step) => ({
        step,
        contextId: c.contextId,
      })),
    ),
    { step: "problems", contextId: null },
  ];
  const at = order.findIndex(
    (x) => x.step === step && x.contextId === contextId,
  );
  if (at < 0) throw new WorkFault("ROUTINE_SCOPE_DENIED", 409);
  const target = state
    ? order[Math.min(at + 1, order.length - 1)]!
    : order[at]!;
  if (state) await initializeTarget(db, d, target);
  await db
    .update(routineDays)
    .set({ cursor: target })
    .where(eq(routineDays.id, d.id));
  return { cursor: target };
}
