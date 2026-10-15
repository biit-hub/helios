import type { PlanView } from "@helios/contracts";
import type { createDatabase } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { dailyPlans, planHistory, observations } from "./schema";
import { contexts, integrations, projectCatalog } from "../work/schema";
import { WorkFault } from "../work/service";
export type Database = ReturnType<typeof createDatabase>;
export type Db = Omit<Database["db"], "$client">;
export type Plan = typeof dailyPlans.$inferSelect;
export const conflict = () => new WorkFault("PLAN_CONFLICT", 409);
export function view(p: Plan): PlanView {
  return {
    id: p.id,
    contextId: p.contextId,
    day: p.day,
    timezone: p.timezone,
    revision: p.revision,
    status: p.status,
    entries: p.entries,
    ...(p.agenda ? { agenda: p.agenda } : {}),
    focusTaskId: p.focusTaskId,
    sourceAt: p.sourceAt.toISOString(),
    confirmedAt: p.confirmedAt?.toISOString() ?? null,
  };
}
export async function record(db: Db, p: Plan) {
  await db.insert(planHistory).values({
    id: crypto.randomUUID(),
    planId: p.id,
    revision: p.revision,
    snapshot: view(p),
  });
}
export async function observe(
  db: Db,
  p: Plan,
  event: string,
  taskId: string | null = null,
) {
  await db.insert(observations).values({
    id: crypto.randomUUID(),
    contextId: p.contextId,
    planId: p.id,
    revision: p.revision,
    event,
    taskId,
  });
}
export async function scope(db: Db, userId: string, contextId: string) {
  const [c] = await db
    .select()
    .from(contexts)
    .where(and(eq(contexts.id, contextId), eq(contexts.userId, userId)));
  if (!c) throw new WorkFault("CONTEXT_NOT_FOUND", 404);
  return c;
}
export async function connected(
  db: Db,
  userId: string,
  c: typeof contexts.$inferSelect,
) {
  const [i] = await db
    .select()
    .from(integrations)
    .where(eq(integrations.userId, userId));
  if (!c.active || !c.projectId || !i?.enabled || !i.encryptedToken)
    throw new WorkFault("CONTEXT_INCOMPLETE", 409);
  const [p] = await db
    .select()
    .from(projectCatalog)
    .where(
      and(
        eq(projectCatalog.integrationId, i.id),
        eq(projectCatalog.projectId, c.projectId),
        eq(projectCatalog.credentialVersion, i.credentialVersion),
        eq(projectCatalog.available, true),
        eq(projectCatalog.inbox, false),
      ),
    );
  if (!p) throw new WorkFault("PROJECT_NOT_ASSIGNABLE", 409);
  return i;
}
export async function planFor(db: Db, contextId: string, day: string) {
  const [p] = await db
    .select()
    .from(dailyPlans)
    .where(and(eq(dailyPlans.contextId, contextId), eq(dailyPlans.day, day)));
  return p;
}
export function expected(
  p: Plan | undefined,
  revision: number,
): asserts p is Plan {
  if (!p || p.revision !== revision) throw conflict();
}
export async function change(db: Db, p: Plan, patch: Partial<Plan>) {
  const [updated] = await db
    .update(dailyPlans)
    .set({ ...patch, revision: p.revision + 1 })
    .where(and(eq(dailyPlans.id, p.id), eq(dailyPlans.revision, p.revision)))
    .returning();
  if (!updated) throw conflict();
  await record(db, updated);
  return updated;
}
export async function history(db: Db, p: Plan) {
  const rows = await db
    .select()
    .from(planHistory)
    .where(eq(planHistory.planId, p.id))
    .orderBy(desc(planHistory.revision))
    .limit(30);
  return rows.map((r) => r.snapshot);
}
