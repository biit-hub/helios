import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { workerHeartbeats } from "../schema";
import { securityEvents } from "../identity/schema";
import { integrationProblems, integrations } from "./schema";
import type { Db } from "../planning/store";
// Materialize existing evidence into the shared problem register, without probing new services.
export async function runtimeProblems(
  db: Db,
  i: typeof integrations.$inferSelect,
) {
  const [last] = await db
    .select()
    .from(workerHeartbeats)
    .orderBy(desc(workerHeartbeats.seenAt))
    .limit(1);
  const key = i.id + ":global:worker_unavailable";
  if (last && Date.now() - last.seenAt.getTime() > 90000) {
    await db
      .insert(integrationProblems)
      .values({
        id: randomUUID(),
        userId: i.userId,
        integrationId: i.id,
        key,
        code: "worker_unavailable",
        lastSeenAt: last.seenAt,
      })
      .onConflictDoUpdate({
        target: integrationProblems.key,
        set: {
          status: "open",
          resolvedAt: null,
          lastSeenAt: last.seenAt,
          revision: sql`${integrationProblems.revision}+1`,
        },
        setWhere: eq(integrationProblems.status, "resolved"),
      });
  } else if (last) {
    await db
      .update(integrationProblems)
      .set({
        status: "resolved",
        resolvedAt: new Date(),
        revision: sql`${integrationProblems.revision}+1`,
      })
      .where(and(eq(integrationProblems.key, key), sql`status<>'resolved'`));
  }
  const [recovery] = await db
    .select()
    .from(securityEvents)
    .where(
      inArray(securityEvents.code, [
        "local_admin_recovery",
        "recovery_code_consumed",
      ]),
    )
    .orderBy(desc(securityEvents.createdAt))
    .limit(1);
  if (recovery)
    await db
      .insert(integrationProblems)
      .values({
        id: randomUUID(),
        userId: i.userId,
        integrationId: i.id,
        key: i.id + ":auth-recovery:" + recovery.id,
        code: "auth_recovery",
        firstSeenAt: recovery.createdAt,
        lastSeenAt: recovery.createdAt,
      })
      .onConflictDoNothing();
}
