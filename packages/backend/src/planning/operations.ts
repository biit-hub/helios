import { eq, and, or, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { symmetricDecrypt } from "better-auth/crypto";
import { createIdentityService } from "../identity/service";
import { AuthFault } from "../identity/policy";
import { WorkFault } from "../work/service";
import { createTodoistReader, TodoistFault } from "../work/todoist";
import type { TodoistReader } from "../work/todoist";
import type { WorkConfig } from "../work/config";
import type { TodoistTask } from "@helios/contracts";
import {
  integrationProblems,
  integrations,
  taskProjections,
} from "../work/schema";
import { dailyPlans, planOperations, planSteps } from "./schema";
import { taskBasis, localDay } from "./selection";
import { createTodoistMover } from "./todoist";
import type { TodoistMover } from "./todoist";
import * as store from "./store";
type Operation = typeof planOperations.$inferSelect;
type Step = typeof planSteps.$inferSelect;
const done = (s: Step) => ["verified", "local"].includes(s.status);
function faultCode(e: unknown) {
  if (e instanceof WorkFault || e instanceof AuthFault) return e.code;
  if (e instanceof TodoistFault) return e.code;
  return "OPERATION_UNAVAILABLE";
}
export function createPlanExecutor(
  database: store.Database,
  config: WorkConfig,
  reader: TodoistReader = createTodoistReader(fetch, config.TODOIST_ORIGIN),
  mover: TodoistMover = createTodoistMover(fetch, config.TODOIST_ORIGIN),
) {
  const identity = createIdentityService(database, config);
  async function authorize(op: Operation, integrationRevision?: number) {
    return identity.withOperationSession(
      op.sessionId,
      op.userId,
      async (db) => {
        const [p] = await db
          .select()
          .from(dailyPlans)
          .where(eq(dailyPlans.id, op.planId));
        store.expected(p, op.expectedRevision);
        const c = await store.scope(db, op.userId, p.contextId);
        const i = await store.connected(db, op.userId, c);
        if (
          p.status !== "confirming" ||
          p.contextRevision !== c.revision ||
          p.projectId !== c.projectId ||
          p.credentialVersion !== i.credentialVersion ||
          (integrationRevision !== undefined &&
            i.revision !== integrationRevision)
        )
          throw store.conflict();
        if (
          op.intentExpiresAt <= new Date() ||
          p.day !== localDay(new Date(), p.timezone)
        )
          throw new WorkFault("INTENT_EXPIRED", 409);
        if (
          i.state === "rate_limit" &&
          i.nextAllowedAt &&
          i.nextAllowedAt > new Date()
        )
          throw new TodoistFault(
            "rate_limit",
            Math.ceil((i.nextAllowedAt.getTime() - Date.now()) / 1000),
          );
        return { p, c, i };
      },
    );
  }
  async function credential(i: typeof integrations.$inferSelect) {
    if (!config.INTEGRATION_KEY || !i.encryptedToken)
      throw new WorkFault("KEY_UNAVAILABLE", 503);
    try {
      return await symmetricDecrypt({
        key: config.INTEGRATION_KEY,
        data: i.encryptedToken,
      });
    } catch {
      throw new WorkFault("KEY_UNAVAILABLE", 503);
    }
  }
  async function updateStep(step: Step, patch: Partial<Step>) {
    await database.db
      .update(planSteps)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(planSteps.id, step.id));
  }
  function checkSource(p: store.Plan, task: TodoistTask, step: Step) {
    const entry = p.entries.find((e) => e.taskId === step.taskId);
    if (
      !entry ||
      task.project_id !== p.projectId ||
      task.checked ||
      task.is_deleted ||
      taskBasis(task) !== taskBasis(entry.source)
    )
      throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
    const allowed =
      task.section_id === entry.source.section_id ||
      (step.attempts > 0 && task.section_id === step.targetSectionId);
    if (!allowed) throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
  }
  async function cache(
    p: store.Plan,
    i: typeof integrations.$inferSelect,
    task: TodoistTask,
    sectionName: string | null,
  ) {
    await database.db
      .update(taskProjections)
      .set({
        data: task,
        state: "active",
        sectionName,
        retrievedAt: new Date(),
        fingerprint: createHash("sha256")
          .update(JSON.stringify(task))
          .digest("hex"),
        revision: sql`${taskProjections.revision}+1`,
      })
      .where(
        and(
          eq(taskProjections.integrationId, i.id),
          eq(taskProjections.taskId, task.id),
          eq(taskProjections.contextId, p.contextId),
          eq(taskProjections.credentialVersion, p.credentialVersion),
        ),
      );
  }
  async function verify(
    op: Operation,
    step: Step,
    token: string,
    base: Awaited<ReturnType<typeof authorize>>,
    target: string,
  ) {
    const after = await reader.task(token, step.taskId);
    checkSource(base.p, after, {
      ...step,
      targetSectionId: target,
      attempts: Math.max(1, step.attempts),
    });
    if (after.section_id !== target)
      throw new WorkFault("MOVE_UNCONFIRMED", 409);
    await updateStep(step, {
      status: "verified",
      code: null,
      targetSectionId: target,
    });
    await authorize(op, base.i.revision);
    await cache(base.p, base.i, after, "In Arbeit");
  }
  async function localStep(
    op: Operation,
    step: Step,
    task: TodoistTask,
    token: string,
    base: Awaited<ReturnType<typeof authorize>>,
    rows: TodoistTask[],
  ) {
    if (task.parent_id) {
      let parent: string | null = task.parent_id;
      const seen = new Set<string>();
      while (parent) {
        const a = rows.find((t) => t.id === parent);
        if (!a || a.checked || a.is_deleted || seen.has(parent))
          throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
        seen.add(parent);
        parent = a.parent_id;
      }
    }
    const local = !!task.parent_id || rows.some((t) => t.parent_id === task.id);
    if (!local) return false;
    await authorize(op, base.i.revision);
    await updateStep(step, { status: "local", code: "HIERARCHY_KEPT" });
    const sections = await reader.sections(token, base.p.projectId);
    await cache(
      base.p,
      base.i,
      task,
      sections.find((s) => s.id === task.section_id)?.name ?? null,
    );
    return true;
  }
  async function executeStep(
    op: Operation,
    step: Step,
    token: string,
    base: Awaited<ReturnType<typeof authorize>>,
  ) {
    const task = await reader.task(token, step.taskId);
    checkSource(base.p, task, step);
    const rows = await reader.tasks(token, base.p.projectId);
    if (await localStep(op, step, task, token, base, rows)) return;
    const sections = await reader.sections(token, base.p.projectId);
    const targets = sections.filter(
      (s) => s.name === "In Arbeit" && s.project_id === base.p.projectId,
    );
    if (targets.length !== 1)
      throw new WorkFault(
        targets.length ? "SECTION_AMBIGUOUS" : "SECTION_MISSING",
        409,
      );
    const target = targets[0]!.id;
    if (step.targetSectionId && step.targetSectionId !== target)
      throw store.conflict();
    if (task.section_id === target) {
      await updateStep(step, {
        status: "verified",
        code: null,
        targetSectionId: target,
      });
      await cache(base.p, base.i, task, "In Arbeit");
      return;
    }
    if (op.status === "running" && step.attempts > 0)
      throw new WorkFault("OUTCOME_UNKNOWN", 409);
    await authorize(op, base.i.revision);
    await updateStep(step, {
      status: "sending",
      targetSectionId: target,
      attempts: step.attempts + 1,
      code: null,
    });
    try {
      await mover.move(token, step.taskId, target, step.requestId);
    } catch (e) {
      try {
        await verify(op, step, token, base, target);
        return;
      } catch {
        /* Reconcile first; never blindly replay a write. */
      }
      throw e;
    }
    await verify(op, step, token, base, target);
  }
  async function runStep(
    op: Operation,
    step: Step,
    token: string,
    base: Awaited<ReturnType<typeof authorize>>,
  ) {
    if (done(step)) {
      const task = await reader.task(token, step.taskId);
      checkSource(base.p, task, step);
      if (
        step.status === "verified" &&
        task.section_id !== step.targetSectionId
      )
        throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
      return;
    }
    try {
      await executeStep(op, step, token, base);
    } catch (e) {
      const code = faultCode(e);
      const unknown = [
        "timeout",
        "network",
        "MOVE_UNCONFIRMED",
        "OUTCOME_UNKNOWN",
      ].includes(code);
      const [latest] = await database.db
        .select()
        .from(planSteps)
        .where(eq(planSteps.id, step.id));
      if (!latest || !done(latest))
        await updateStep(step, {
          status: unknown ? "unknown" : "failed",
          code,
        });
      throw e;
    }
  }
  async function problem(
    db: store.Db,
    op: Operation,
    p: store.Plan,
    success: boolean,
  ) {
    const [i] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.userId, op.userId));
    if (!i) return;
    const key = "plan-operation:" + op.id;
    if (success) {
      await db
        .update(integrationProblems)
        .set({
          status: "resolved",
          resolvedAt: new Date(),
          revision: sql`${integrationProblems.revision}+1`,
        })
        .where(eq(integrationProblems.key, key));
      return;
    }
    await db
      .insert(integrationProblems)
      .values({
        id: randomUUID(),
        userId: op.userId,
        integrationId: i.id,
        contextId: p.contextId,
        key,
        code: "plan_operation_failed",
      })
      .onConflictDoUpdate({
        target: integrationProblems.key,
        set: {
          lastSeenAt: new Date(),
          occurrences: sql`${integrationProblems.occurrences}+1`,
          revision: sql`${integrationProblems.revision}+1`,
          status: sql`CASE WHEN ${integrationProblems.status}='resolved' THEN 'open' ELSE ${integrationProblems.status} END`,
          resolvedAt: null,
        },
      });
  }
  async function finish(op: Operation, error: unknown) {
    await database.db.transaction(async (db) => {
      await db.execute(sql`select pg_advisory_xact_lock(1748012)`);
      const [p] = await db
        .select()
        .from(dailyPlans)
        .where(eq(dailyPlans.id, op.planId));
      store.expected(p, op.expectedRevision);
      const steps = await db
        .select()
        .from(planSteps)
        .where(eq(planSteps.operationId, op.id));
      const success = !error && steps.every(done);
      const status = success ? "confirmed" : "partial";
      const next = await store.change(db, p, {
        status,
        confirmedAt: success ? new Date() : null,
      });
      await db
        .update(planOperations)
        .set({
          status,
          code: success ? null : faultCode(error),
          retryAt:
            error instanceof TodoistFault
              ? new Date(Date.now() + error.retrySeconds * 1000)
              : null,
          expectedRevision: next.revision,
          updatedAt: new Date(),
        })
        .where(eq(planOperations.id, op.id));
      if (error instanceof TodoistFault && error.code === "rate_limit")
        await db
          .update(integrations)
          .set({
            state: "rate_limit",
            nextAllowedAt: new Date(Date.now() + error.retrySeconds * 1000),
          })
          .where(eq(integrations.userId, op.userId));
      await problem(db, op, p, success);
      if (success) await store.observe(db, next, "plan_confirmed");
    });
  }
  async function execute(op: Operation) {
    let error: unknown = null;
    try {
      const base = await authorize(op);
      const token = await credential(base.i);
      const project = await reader.project(token, base.p.projectId);
      if (project.inbox_project || project.is_deleted || project.is_archived)
        throw store.conflict();
      const steps = await database.db
        .select()
        .from(planSteps)
        .where(eq(planSteps.operationId, op.id));
      for (const step of steps)
        checkSource(base.p, await reader.task(token, step.taskId), step);
      for (const entry of base.p.entries) {
        const step = steps.find((s) => s.taskId === entry.taskId)!;
        await runStep(op, step, token, base);
      }
      await authorize(op, base.i.revision);
    } catch (e) {
      error = e;
    }
    await finish(op, error);
  }
  return {
    async runNext() {
      if (config.RESTORE_MODE || !config.WORKER_ENABLED) return false;
      const client = await database.pool.connect();
      let locked = false;
      try {
        const result = await client.query(
          "SELECT pg_try_advisory_lock(1748013) AS locked",
        );
        locked = result.rows[0].locked;
        if (!locked) return false;
        const [op] = await database.db
          .select()
          .from(planOperations)
          .where(
            or(
              eq(planOperations.status, "queued"),
              eq(planOperations.status, "running"),
            ),
          )
          .orderBy(planOperations.createdAt)
          .limit(1);
        if (!op) return false;
        await database.db
          .update(planOperations)
          .set({ status: "running", updatedAt: new Date() })
          .where(eq(planOperations.id, op.id));
        await execute(op);
        return true;
      } finally {
        if (locked) await client.query("SELECT pg_advisory_unlock(1748013)");
        client.release();
      }
    },
  };
}
