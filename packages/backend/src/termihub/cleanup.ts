import { inArray, lte, and, asc } from "drizzle-orm";
import type { createDatabase } from "../db";
import type { WorkConfig } from "../work/config";
import { calendarSnapshots } from "./schema";
import { SNAPSHOT_RETENTION_MS } from "./policy";
export async function cleanupExpiredSnapshots(
  database: ReturnType<typeof createDatabase>,
  config: WorkConfig,
  now = new Date(),
) {
  if (config.RESTORE_MODE) return 0;
  const cutoff = new Date(now.getTime() - SNAPSHOT_RETENTION_MS);
  return database.db.transaction(async (db) => {
    const expired = await db
      .select({ id: calendarSnapshots.id })
      .from(calendarSnapshots)
      .where(lte(calendarSnapshots.retrievedAt, cutoff))
      .orderBy(asc(calendarSnapshots.retrievedAt), asc(calendarSnapshots.id))
      .limit(200);
    if (!expired.length) return 0;
    const removed = await db
      .delete(calendarSnapshots)
      .where(
        and(
          inArray(
            calendarSnapshots.id,
            expired.map((row) => row.id),
          ),
          lte(calendarSnapshots.retrievedAt, cutoff),
        ),
      )
      .returning({ id: calendarSnapshots.id });
    return removed.length;
  });
}
