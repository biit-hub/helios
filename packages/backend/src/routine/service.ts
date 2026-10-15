import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  routineCommand,
  entryKey,
  type RoutineCommand,
  type RoutineStep,
  type RoutineCursor,
} from "@helios/contracts";
import type { Database, Db } from "../planning/store";
import type { WorkConfig } from "../work/config";
import { createIdentityService } from "../identity/service";
import { WorkFault } from "../work/service";
import { contexts, integrations } from "../work/schema";
import { dailyPlans } from "../planning/schema";
import { localDay } from "../planning/selection";
import { planningTimezone } from "../planning/service";
import { fingerprint } from "../tasks/hash";
import { createTodoistReader, type TodoistReader } from "../work/todoist";
import {
  routineDays,
  routineContexts,
  routineEvents,
  type RoutineDay,
} from "./schema";
import {
  ownedDay,
  current,
  ownedContext,
  advanceDay,
  advanceContext,
  record,
  view,
  requireRevision,
} from "./store";
import {
  freezeReview,
  reviewEntries,
  readReview,
  effectiveFeedback,
} from "./review";
import { createRoutineInbox } from "./inbox";
import { createRoutineReview } from "./review-actions";
import { enrichmentCandidates } from "./enrichment";
export function createRoutineService(
  database: Database,
  config: WorkConfig,
  reader: TodoistReader = createTodoistReader(fetch, config.TODOIST_ORIGIN),
  timezone = planningTimezone(),
) {
  const identity = createIdentityService(database, config);
  const today = () => localDay(new Date(), timezone);
  async function local(
    action: string,
    h: Headers,
    raw: unknown,
    fn: (
      db: Db,
      d: RoutineDay,
      input: RoutineCommand,
    ) => Promise<Record<string, unknown>>,
  ) {
    const input = routineCommand.parse(raw);
    const hash = fingerprint({ action, input });
    return identity.withActive(h, { mutation: true }, async (db, user) => {
      const [old] = await db
        .select()
        .from(routineEvents)
        .where(
          and(eq(routineEvents.userId, user), eq(routineEvents.key, input.key)),
        );
      if (old) {
        if (old.requestHash !== hash)
          throw new WorkFault("ROUTINE_CONFLICT", 409);
        return old.result;
      }
      let d: RoutineDay;
      if (action === "start") {
        const [existing] = await db
          .select()
          .from(routineDays)
          .where(
            and(eq(routineDays.userId, user), eq(routineDays.day, today())),
          );
        d =
          existing ??
          (
            await db
              .insert(routineDays)
              .values({
                id: randomUUID(),
                userId: user,
                day: today(),
                timezone,
                steps: { inbox: "started", contexts: "open", problems: "open" },
                cursor: { step: "inbox", contextId: null },
              })
              .returning()
          )[0]!;
      } else {
        const ref = requireRevision(input);
        d = await ownedDay(db, user, ref.id, ref.revision);
        current(d);
      }
      if (input.contextId) {
        if (action === "start") throw new WorkFault("INVALID_REQUEST", 400);
        await ownedContext(db, d, input.contextId, input.contextRevision);
      }
      const result = await fn(db, d, input);
      const next = await advanceDay(db, d);
      const out = { ...result, id: d.id, revision: next.revision };
      await record(
        db,
        next,
        input.key,
        hash,
        action === "navigate" ? "resume" : action,
        out,
        input.contextId ?? null,
        action === "review-close"
          ? result
          : {
              step: input.step,
              entryKeys: input.entryKeys,
              feedback: input.feedback,
              draftId: input.draftId,
              contextIds: input.contextIds,
            },
      );
      return out;
    });
  }
  async function snapshot(h: Headers, day = today()) {
    return identity.withActive(h, {}, async (db, user) => {
      if (!z.iso.date().safeParse(day).success)
        throw new WorkFault("INVALID_REQUEST", 400);
      const [d] = await db
        .select()
        .from(routineDays)
        .where(and(eq(routineDays.userId, user), eq(routineDays.day, day)));
      return { day, timezone, routine: d ? await view(db, d) : null };
    });
  }
  async function cursor(
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
            state ??
            (next.steps[step as "review"] === "done" ? "done" : "started"),
        },
      });
    } else
      await db
        .update(routineDays)
        .set({
          steps: {
            ...d.steps,
            [step]:
              state ??
              (d.steps[step as "inbox"] === "done" ? "done" : "started"),
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
    if (
      state &&
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
    } else if (
      state &&
      ["inbox", "contexts", "problems"].includes(target.step)
    ) {
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
    await db
      .update(routineDays)
      .set({ cursor: target })
      .where(eq(routineDays.id, d.id));
    return { cursor: target };
  }
  const inbox = createRoutineInbox(database, config, reader, local);
  const review = createRoutineReview(database, config, reader, local);
  return {
    snapshot,
    async details(
      h: Headers,
      id: string,
      kind: string,
      contextId?: string,
    ): Promise<Record<string, unknown>> {
      z.uuid().parse(id);
      const base = await identity.withActive(h, {}, async (db, user) => {
        const d = await ownedDay(db, user, id);
        const [integration] = await db
          .select()
          .from(integrations)
          .where(eq(integrations.userId, user));
        if (kind === "inbox") return { d, r: null, c: null, integration };
        if (!contextId) throw new WorkFault("INVALID_REQUEST", 400);
        const { r, c } = await ownedContext(db, d, contextId);
        return { d, r, c, integration };
      });
      let result: Record<string, unknown>;
      if (kind === "inbox") result = await inbox.read(h, base.d);
      else if (kind === "review")
        result = {
          items: await readReview(database, config, reader, h, base.r!),
        };
      else if (kind === "enrichment")
        result = await enrichmentCandidates(
          database,
          config,
          h,
          base.r!,
          base.d.timezone,
        );
      else throw new WorkFault("NOT_FOUND", 404);
      return identity.withActive(h, {}, async (db, user) => {
        const d = await ownedDay(db, user, base.d.id, base.d.revision);
        const [integration] = await db
          .select()
          .from(integrations)
          .where(eq(integrations.userId, user));
        if (
          integration?.credentialVersion !==
            base.integration?.credentialVersion ||
          integration?.revision !== base.integration?.revision
        )
          throw new WorkFault("ROUTINE_CONFLICT", 409);
        if (base.r) {
          const { c } = await ownedContext(
            db,
            d,
            base.r.contextId,
            base.r.revision,
          );
          if (c.revision !== base.c?.revision)
            throw new WorkFault("ROUTINE_CONFLICT", 409);
        }
        return {
          ...result,
          routineRevision: d.revision,
          contextRevision: base.r?.revision ?? null,
        };
      });
    },
    async handle(action: string, h: Headers, raw: unknown) {
      await identity.withActive(h, { mutation: true }, async () => {});
      if (action === "inbox-defer") return inbox.defer(h, raw);
      if (action === "inbox-move" || action === "inbox-delete")
        return inbox.mutate(action, h, raw);
      if (action === "feedback" || action === "review-close")
        return review.handle(action, h, raw);
      return local(action, h, raw, async (db, d, input) => {
        if (action === "start" || action === "resume") return {};
        if (action === "select-contexts") {
          if (
            !input.contextIds ||
            new Set(input.contextIds).size !== input.contextIds.length
          )
            throw new WorkFault("INVALID_REQUEST", 400);
          const all = await db
            .select()
            .from(contexts)
            .where(eq(contexts.userId, d.userId));
          if (
            input.contextIds.some(
              (id) => !all.some((c) => c.id === id && c.active),
            )
          )
            throw new WorkFault("CONTEXT_NOT_FOUND", 404);
          await db
            .update(routineContexts)
            .set({ selected: false })
            .where(eq(routineContexts.routineId, d.id));
          for (const [position, id] of input.contextIds.entries()) {
            const [r] = await db
              .select()
              .from(routineContexts)
              .where(
                and(
                  eq(routineContexts.routineId, d.id),
                  eq(routineContexts.contextId, id),
                ),
              );
            if (r) await advanceContext(db, r, { selected: true, position });
            else
              await db.insert(routineContexts).values({
                id: randomUUID(),
                routineId: d.id,
                contextId: id,
                position,
                steps: {
                  review: "open",
                  enrichment: "open",
                  planning: "open",
                },
              });
          }
          return {};
        }
        if (action === "navigate" || action === "skip" || action === "complete")
          return cursor(
            db,
            d,
            input,
            action === "skip"
              ? "skipped_open"
              : action === "complete"
                ? "done"
                : undefined,
          );
        if (action === "inbox-defer") {
          if (!input.taskId) throw new WorkFault("INVALID_REQUEST", 400);
          await db
            .update(routineDays)
            .set({
              deferredIds: [...new Set([...d.deferredIds, input.taskId])],
            })
            .where(eq(routineDays.id, d.id));
          return { taskId: input.taskId };
        }
        if (action === "inbox-reopen") {
          await db
            .update(routineDays)
            .set({ deferredIds: [] })
            .where(eq(routineDays.id, d.id));
          return {};
        }
        throw new WorkFault("NOT_FOUND", 404);
      });
    },
  };
}
export type LocalRoutineCommand = (
  action: string,
  h: Headers,
  raw: unknown,
  fn: (
    db: Db,
    d: RoutineDay,
    input: RoutineCommand,
  ) => Promise<Record<string, unknown>>,
) => Promise<Record<string, unknown>>;
