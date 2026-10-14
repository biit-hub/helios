import { randomUUID } from "node:crypto";
import {
  createDatabase,
  createQueue,
  prepareQueue,
  enqueueSmokeTransaction,
  loadConfig,
} from "@helios/backend";
const config = loadConfig();
if (config.RESTORE_MODE) throw new Error("Jobs blocked during restore");
const database = createDatabase(config.DATABASE_URL);
const boss = createQueue(config.DATABASE_URL);
const probeId = randomUUID();
try {
  await prepareQueue(boss);
  await enqueueSmokeTransaction(boss, database, probeId);
  let done = false;
  for (let i = 0; i < 40; i++) {
    const r = await database.pool.query(
      "SELECT id FROM technical_probes WHERE id=$1",
      [probeId],
    );
    if (r.rowCount) {
      done = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!done) throw new Error("Smoke job timeout");
  console.log(JSON.stringify({ event: "smoke_job_completed", probeId }));
} catch {
  console.error(JSON.stringify({ event: "smoke_job_failed" }));
  process.exitCode = 1;
} finally {
  await boss.stop();
  await database.close();
}
