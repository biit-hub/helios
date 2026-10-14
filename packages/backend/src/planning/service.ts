import { eq, and } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import {
  planScope,
  planMutation,
  confirmPlanInput,
  focusInput,
  resumeInput,
} from "@helios/contracts";
import type { PlanningView } from "@helios/contracts";
import { createIdentityService } from "../identity/service";
import { WorkFault } from "../work/service";
import { taskProjections, integrations } from "../work/schema";
import { dailyPlans, planOperations, planSteps } from "./schema";
import { candidates, localDay } from "./selection";
import * as store from "./store";
import type { WorkConfig } from "../work/config";
export function planningTimezone(env: NodeJS.ProcessEnv = process.env) {
  const tz = env.PLAN_TIMEZONE ?? "Europe/Zurich";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    throw new Error("Invalid planning timezone");
  }
  return tz;
}
function availability(
  rows: (typeof taskProjections.$inferSelect)[],
  projectId: string,
  day: string,
) {
  const byId = new Map(rows.map((r) => [r.taskId, r]));
  return Object.fromEntries(
    rows.map((row) => {
      let current: typeof row | undefined = row;
      const seen = new Set<string>();
      let available = true;
      while (current) {
        if (
          seen.has(current.taskId) ||
          current.state !== "active" ||
          current.projectId !== projectId ||
          current.data.checked ||
          current.data.is_deleted ||
          ["Wartet", "Abgeschlossen"].includes(current.sectionName ?? "")
        ) {
          available = false;
          break;
        }
        seen.add(current.taskId);
        if (!current.data.parent_id) break;
        current = byId.get(current.data.parent_id);
        if (!current) available = false;
      }
      if (
        row.data.due?.date &&
        row.data.due.date.slice(0, 10) > day &&
        (!row.data.deadline || row.data.deadline.date > day)
      )
        available = false;
      return [row.taskId, available];
    }),
  );
}
export function createPlanningService(
  database: store.Database,
  config: WorkConfig,
  timezone = planningTimezone(),
) {
  const identity = createIdentityService(database, config);
  const currentDay = () => localDay(new Date(), timezone);
  function today(day: string) {
    if (day !== currentDay()) throw new WorkFault("PLAN_DAY_CHANGED", 409);
  }
  const guarded = <T>(
    h: Headers,
    fn: (db: store.Db, userId: string, sessionId: string) => Promise<T>,
  ) => identity.withActive(h, { mutation: true }, fn);
  async function snapshot(
    h: Headers,
    contextId: string,
    day = currentDay(),
  ): Promise<PlanningView> {
    return identity.withActive(h, {}, async (db, userId) => {
      planScope.parse({ contextId, day });
      if (
        Number.isNaN(Date.parse(day)) ||
        new Date(day).toISOString().slice(0, 10) !== day
      )
        throw new WorkFault("INVALID_REQUEST");
      const c = await store.scope(db, userId, contextId);
      const p = await store.planFor(db, contextId, day);
      if (!p)
        return { day, timezone, plan: null, operation: null, history: [] };
      const rows = await db
        .select()
        .from(taskProjections)
        .where(
          and(
            eq(taskProjections.contextId, c.id),
            eq(taskProjections.projectId, p.projectId),
            eq(taskProjections.credentialVersion, p.credentialVersion),
          ),
        );
      const [integration] = await db
        .select()
        .from(integrations)
        .where(eq(integrations.userId, userId));
      const matchingScope =
        c.active &&
        c.projectId === p.projectId &&
        integration?.credentialVersion === p.credentialVersion;
      const currentAvailability =
        p.day === currentDay()
          ? matchingScope
            ? availability(rows, p.projectId, p.day)
            : Object.fromEntries(p.entries.map((e) => [e.taskId, false]))
          : undefined;
      const [op] = await db
        .select()
        .from(planOperations)
        .where(eq(planOperations.planId, p.id));
      const steps = op
        ? await db
            .select()
            .from(planSteps)
            .where(eq(planSteps.operationId, op.id))
        : [];
      return {
        day,
        timezone: p.timezone,
        plan: store.view(p),
        availability: currentAvailability,
        operation: op
          ? {
              id: op.id,
              status: op.status,
              code: op.code,
              retryAt: op.retryAt?.toISOString() ?? null,
              steps: steps.map(({ taskId, status, code, attempts }) => ({
                taskId,
                status,
                code,
                attempts,
              })),
            }
          : null,
        history: await store.history(db, p),
      };
    });
  }
  async function propose(h: Headers, input: unknown) {
    const data = planMutation.parse(input);
    today(data.day);
    return guarded(h, async (db, userId) => {
      const c = await store.scope(db, userId, data.contextId);
      const i = await store.connected(db, userId, c);
      const old = await store.planFor(db, c.id, data.day);
      if ((old?.revision ?? 0) !== data.revision) throw store.conflict();
      if (old && old.status !== "draft")
        throw new WorkFault("PLAN_LOCKED", 409);
      if (
        !c.lastSyncAt ||
        Date.now() - c.lastSyncAt.getTime() > 300000 ||
        i.state !== "ready"
      )
        throw new WorkFault("SOURCE_STALE", 409);
      const rows = await db
        .select()
        .from(taskProjections)
        .where(
          and(
            eq(taskProjections.contextId, c.id),
            eq(taskProjections.integrationId, i.id),
            eq(taskProjections.credentialVersion, i.credentialVersion),
            eq(taskProjections.projectId, c.projectId!),
          ),
        );
      const entries = candidates(
        rows.map((r) => ({
          data: r.data,
          state: r.state,
          sectionName: r.sectionName,
          retrievedAt: r.retrievedAt.toISOString(),
        })),
        c.projectId!,
        data.day,
        c.kind,
      );
      for (const entry of entries)
        if (
          !entry.source.parent_id &&
          rows.some((r) => r.data.parent_id === entry.taskId)
        )
          entry.reasons.push(
            "Oberaufgabe mit Unteraufgaben: Abschnitt bleibt zum Schutz der Hierarchie unverändert.",
          );
      const values = {
        contextId: c.id,
        day: data.day,
        timezone,
        status: "draft" as const,
        entries,
        focusTaskId: entries[0]?.taskId ?? null,
        projectId: c.projectId!,
        contextRevision: c.revision,
        credentialVersion: i.credentialVersion,
        sourceAt: c.lastSyncAt,
        confirmedAt: null,
      };
      if (old) return store.view(await store.change(db, old, values));
      const [p] = await db
        .insert(dailyPlans)
        .values({ id: randomUUID(), revision: 1, ...values })
        .returning();
      await store.record(db, p!);
      return store.view(p!);
    });
  }
  async function confirm(h: Headers, input: unknown) {
    const data = confirmPlanInput.parse(input);
    today(data.day);
    if (new Set(data.taskIds).size !== data.taskIds.length)
      throw new WorkFault("INVALID_REQUEST");
    const hash = createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");
    return guarded(h, async (db, userId, sessionId) => {
      const [previous] = await db
        .select()
        .from(planOperations)
        .where(
          and(
            eq(planOperations.userId, userId),
            eq(planOperations.key, data.key),
          ),
        );
      if (previous) {
        if (previous.requestHash !== hash) throw store.conflict();
        return { operationId: previous.id };
      }
      const c = await store.scope(db, userId, data.contextId);
      const i = await store.connected(db, userId, c);
      const p = await store.planFor(db, c.id, data.day);
      store.expected(p, data.revision);
      if (
        p.status !== "draft" ||
        p.contextRevision !== c.revision ||
        p.credentialVersion !== i.credentialVersion ||
        p.projectId !== c.projectId
      )
        throw store.conflict();
      if (data.taskIds.some((id) => !p.entries.some((e) => e.taskId === id)))
        throw store.conflict();
      // Explicit subsets preserve the proposal's order, never reorder through click order.
      const entries = p.entries
        .filter((e) => data.taskIds.includes(e.taskId))
        .map((e, n) => ({ ...e, position: n + 1 }));
      const next = await store.change(db, p, {
        entries,
        status: "confirming",
        focusTaskId: entries[0]!.taskId,
      });
      const id = randomUUID();
      await db.insert(planOperations).values({
        id,
        userId,
        sessionId,
        planId: p.id,
        key: data.key,
        requestHash: hash,
        selectedIds: entries.map((e) => e.taskId),
        expectedRevision: next.revision,
        status: "queued",
        intentExpiresAt: new Date(Date.now() + 10 * 60000),
      });
      await db.insert(planSteps).values(
        entries.map((e) => ({
          id: randomUUID(),
          operationId: id,
          taskId: e.taskId,
          requestId: randomUUID(),
          status: "pending",
        })),
      );
      for (const e of entries)
        await store.observe(db, next, "proposal_selected", e.taskId);
      for (const entry of p.entries.filter(
        (e) => !data.taskIds.includes(e.taskId),
      ))
        await store.observe(db, next, "proposal_not_selected", entry.taskId);
      if (entries[0]?.taskId !== p.entries[0]?.taskId)
        await store.observe(
          db,
          next,
          "recommendation_overridden",
          entries[0]?.taskId ?? null,
        );
      await store.observe(db, next, "plan_confirmation_requested");
      return { operationId: id };
    });
  }
  async function focus(h: Headers, input: unknown) {
    const data = focusInput.parse(input);
    today(data.day);
    return guarded(h, async (db, userId) => {
      const c = await store.scope(db, userId, data.contextId);
      const p = await store.planFor(db, c.id, data.day);
      store.expected(p, data.revision);
      const i = await store.connected(db, userId, c);
      if (
        p.status !== "confirmed" ||
        p.projectId !== c.projectId ||
        p.credentialVersion !== i.credentialVersion ||
        !p.entries.some((e) => e.taskId === data.taskId)
      )
        throw store.conflict();
      const [task] = await db
        .select()
        .from(taskProjections)
        .where(
          and(
            eq(taskProjections.integrationId, i.id),
            eq(taskProjections.taskId, data.taskId),
            eq(taskProjections.contextId, c.id),
            eq(taskProjections.credentialVersion, i.credentialVersion),
            eq(taskProjections.state, "active"),
          ),
        );
      const rows = await db
        .select()
        .from(taskProjections)
        .where(
          and(
            eq(taskProjections.contextId, c.id),
            eq(taskProjections.credentialVersion, i.credentialVersion),
          ),
        );
      if (!task || !availability(rows, p.projectId, p.day)[data.taskId])
        throw store.conflict();
      const updated = await store.change(db, p, { focusTaskId: data.taskId });
      await store.observe(db, updated, "focus_manually_changed", data.taskId);
      if (data.taskId !== p.entries[0]?.taskId)
        await store.observe(
          db,
          updated,
          "recommendation_overridden",
          data.taskId,
        );
      return store.view(updated);
    });
  }
  async function resume(h: Headers, input: unknown) {
    const data = resumeInput.parse(input);
    today(data.day);
    return guarded(h, async (db, userId, sessionId) => {
      const c = await store.scope(db, userId, data.contextId);
      await store.connected(db, userId, c);
      const p = await store.planFor(db, c.id, data.day);
      store.expected(p, data.revision);
      const [op] = await db
        .select()
        .from(planOperations)
        .where(
          and(
            eq(planOperations.id, data.operationId),
            eq(planOperations.planId, p.id),
            eq(planOperations.userId, userId),
          ),
        );
      if (!op || op.status !== "partial" || p.status !== "partial")
        throw store.conflict();
      if (op.retryAt && op.retryAt > new Date())
        throw new WorkFault("RETRY_LATER", 429);
      const next = await store.change(db, p, { status: "confirming" });
      await db
        .update(planOperations)
        .set({
          status: "queued",
          sessionId,
          expectedRevision: next.revision,
          code: null,
          retryAt: null,
          intentExpiresAt: new Date(Date.now() + 10 * 60000),
          updatedAt: new Date(),
        })
        .where(eq(planOperations.id, op.id));
      return { operationId: op.id };
    });
  }
  const handlers = new Map<
    string,
    (h: Headers, input: unknown) => Promise<unknown>
  >([
    ["propose", propose],
    ["confirm", confirm],
    ["focus", focus],
    ["resume", resume],
  ]);
  return {
    snapshot,
    async handle(action: string, h: Headers, input: unknown) {
      await identity.withActive(h, { mutation: true }, async () => {});
      const handler = handlers.get(action);
      if (!handler) throw new WorkFault("NOT_FOUND", 404);
      return handler(h, input);
    },
  };
}
