import { PgBoss } from "pg-boss";
import { smokeJobSchema } from "@helios/contracts";
import { technicalProbes } from "./schema";
import type { createDatabase } from "./db";
export const SMOKE_QUEUE = "helios.technical-smoke";
export function createQueue(url: string) {
  const boss = new PgBoss({ connectionString: url, schema: "pgboss" });
  boss.on("error", () =>
    console.error(JSON.stringify({ level: "error", event: "queue_error" })),
  );
  return boss;
}
export async function prepareQueue(boss: PgBoss) {
  await boss.start();
  await boss.createQueue(SMOKE_QUEUE, {
    retryLimit: 3,
    retryDelay: 2,
    expireInSeconds: 60,
  });
}
export async function registerSmokeHandler(
  boss: PgBoss,
  database: ReturnType<typeof createDatabase>,
) {
  await boss.work(SMOKE_QUEUE, async (jobs) => {
    for (const job of jobs) {
      const data = smokeJobSchema.parse(job.data);
      await database.db
        .insert(technicalProbes)
        .values({ id: data.probeId })
        .onConflictDoNothing();
    }
  });
}
// Queue enqueue and application write share a PostgreSQL transaction.
export async function enqueueSmokeTransaction(
  boss: PgBoss,
  database: ReturnType<typeof createDatabase>,
  probeId: string,
  rollback = false,
) {
  const data = smokeJobSchema.parse({ probeId });
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    const jobId = await boss.send(SMOKE_QUEUE, data, {
      db: { executeSql: async (text, values) => client.query(text, values) },
    });
    if (rollback) await client.query("ROLLBACK");
    else await client.query("COMMIT");
    return jobId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
