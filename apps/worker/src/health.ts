import { createDatabase, loadConfig } from "@helios/backend";
const database = createDatabase(loadConfig().DATABASE_URL);
try {
  const result = await database.pool.query(
    "SELECT 1 FROM worker_heartbeats WHERE seen_at > now() - interval '35 seconds' LIMIT 1",
  );
  if (!result.rowCount) process.exitCode = 1;
} catch {
  process.exitCode = 1;
} finally {
  await database.close();
}
