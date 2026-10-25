import { resetBrowserFixture } from "../fixtures/browser-reset";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  createDatabase,
  bootstrapIdentity,
  loadIdentityConfig,
} from "@helios/backend";
const config = loadIdentityConfig();
if (
  config.HELIOS_ENV !== "test" ||
  !new URL(config.DATABASE_URL).pathname.endsWith("_test")
)
  throw new Error("Browser fixtures require isolated test environment");
const db = createDatabase(config.DATABASE_URL);
try {
  await migrate(db.db, {
    migrationsFolder: fileURLToPath(
      new URL("../../packages/backend/migrations", import.meta.url),
    ),
  });
  await resetBrowserFixture((sql) => db.pool.query(sql));
  const result = await bootstrapIdentity(
    db,
    config,
    "synthetic_user",
    "Synthetic passphrase 72!",
  );
  mkdirSync("private", { recursive: true });
  writeFileSync("private/e2e-fixture.json", JSON.stringify(result), {
    mode: 0o600,
  });
} finally {
  await db.close();
}
