import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { beforeAll, afterAll, it, expect } from "vitest";
import {
  createDatabase,
  createQueue,
  prepareQueue,
  registerSmokeHandler,
  enqueueSmokeTransaction,
  loadConfig,
  SMOKE_QUEUE,
} from "@helios/backend";
const config = loadConfig();
if (config.HELIOS_ENV !== "test")
  throw new Error("Integration tests require HELIOS_ENV=test");
const database = createDatabase(config.DATABASE_URL);
const boss = createQueue(config.DATABASE_URL);
beforeAll(async () => {
  await migrate(database.db, {
    migrationsFolder: fileURLToPath(
      new URL("../../packages/backend/migrations", import.meta.url),
    ),
  });
  await prepareQueue(boss);
  await registerSmokeHandler(boss, database);
});
afterAll(async () => {
  await boss.stop();
  await database.close();
});
it("executes a real queue job and persists an idempotent result", async () => {
  const id = randomUUID();
  await enqueueSmokeTransaction(boss, database, id);
  await expect
    .poll(
      async () =>
        (
          await database.pool.query(
            "SELECT id FROM technical_probes WHERE id=$1",
            [id],
          )
        ).rowCount,
      { timeout: 20000 },
    )
    .toBe(1);
  await enqueueSmokeTransaction(boss, database, id);
  await new Promise((r) => setTimeout(r, 3000));
  expect(
    (
      await database.pool.query("SELECT id FROM technical_probes WHERE id=$1", [
        id,
      ])
    ).rowCount,
  ).toBe(1);
});
it("rolls back queue insertion with the application transaction", async () => {
  const id = randomUUID();
  await enqueueSmokeTransaction(boss, database, id, true);
  const r = await database.pool.query(
    "SELECT id FROM pgboss.job WHERE name=$1 AND data->>'probeId'=$2",
    [SMOKE_QUEUE, id],
  );
  expect(r.rowCount).toBe(0);
});
it("does not process invalid payloads as successful probes", async () => {
  const id = randomUUID();
  await boss.send(
    SMOKE_QUEUE,
    { probeId: id, unexpected: true },
    { retryLimit: 0 },
  );
  await new Promise((r) => setTimeout(r, 3000));
  expect(
    (
      await database.pool.query("SELECT id FROM technical_probes WHERE id=$1", [
        id,
      ])
    ).rowCount,
  ).toBe(0);
});
