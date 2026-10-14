import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  createDatabase,
  bootstrapIdentity,
  loadIdentityConfig,
} from "@helios/backend";
const config = loadIdentityConfig();
if (config.HELIOS_ENV !== "test")
  throw new Error("Browser fixtures require isolated test environment");
const db = createDatabase(config.DATABASE_URL);
try {
  await migrate(db.db, {
    migrationsFolder: fileURLToPath(
      new URL("../../packages/backend/migrations", import.meta.url),
    ),
  });
  await db.pool.query(
    "TRUNCATE auth_user,auth_flows,auth_limits,auth_rate_limit,auth_verification,auth_totp_uses,security_events CASCADE",
  );
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
