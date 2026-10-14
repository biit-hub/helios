import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./db";
import { loadConfig } from "./config";
const database = createDatabase(loadConfig().DATABASE_URL);
try {
  await migrate(database.db, {
    migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)),
  });
  console.log(JSON.stringify({ level: "info", event: "migrations_completed" }));
} catch {
  console.error(JSON.stringify({ level: "error", event: "migrations_failed" }));
  process.exitCode = 1;
} finally {
  await database.close();
}
