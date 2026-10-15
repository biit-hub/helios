import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import {
  createDatabase,
  loadWorkConfig,
  contexts,
  integrations,
  taskProjections,
  dailyPlans,
  planHistory,
} from "@helios/backend";
import { view } from "../../packages/backend/src/planning/store";
const config = loadWorkConfig();
if (
  config.HELIOS_ENV !== "test" ||
  !new URL(config.DATABASE_URL).pathname.endsWith("_test")
)
  throw Error("Synthetic isolated browser database required");
const database = createDatabase(config.DATABASE_URL);
try {
  const [c] = await database.db
    .select()
    .from(contexts)
    .where(eq(contexts.kind, "private"));
  if (!c?.projectId) throw Error("Synthetic context missing");
  const [i] = await database.db
    .select()
    .from(integrations)
    .where(eq(integrations.userId, c.userId));
  const rows = await database.db
    .select()
    .from(taskProjections)
    .where(
      and(
        eq(taskProjections.contextId, c.id),
        eq(taskProjections.state, "active"),
      ),
    );
  for (const offset of [7, 3]) {
    const when = new Date(Date.now() - offset * 86400000);
    const [p] = await database.db
      .insert(dailyPlans)
      .values({
        id: randomUUID(),
        contextId: c.id,
        day: when.toISOString().slice(0, 10),
        timezone: "Europe/Zurich",
        revision: 1,
        status: "confirmed",
        entries: rows
          .slice(0, 5)
          .map((r, n) => ({
            taskId: r.taskId,
            source: r.data,
            position: n + 1,
            sectionName: r.sectionName,
            reasons: ["Synthetischer früherer Plan"],
          })),
        focusTaskId: null,
        projectId: c.projectId,
        contextRevision: c.revision,
        credentialVersion: i!.credentialVersion,
        sourceAt: when,
        confirmedAt: when,
      })
      .returning();
    await database.db
      .insert(planHistory)
      .values({
        id: randomUUID(),
        planId: p!.id,
        revision: 1,
        snapshot: view(p!),
      });
  }
} finally {
  await database.close();
}
