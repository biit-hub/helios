import { randomUUID } from "node:crypto";
import {
  createDatabase,
  createQueue,
  prepareQueue,
  registerSmokeHandler,
  workerHeartbeats,
  loadConfig,
  log,
} from "@helios/backend";
const config = loadConfig();
if (!config.WORKER_ENABLED || config.RESTORE_MODE) {
  log("info", "worker_disabled");
  process.exit(0);
}
const database = createDatabase(config.DATABASE_URL);
const boss = createQueue(config.DATABASE_URL);
const id = randomUUID();
let timer: ReturnType<typeof setInterval> | undefined;
let shuttingDown = false;
async function heartbeat() {
  await database.db
    .insert(workerHeartbeats)
    .values({ id, seenAt: new Date() })
    .onConflictDoUpdate({
      target: workerHeartbeats.id,
      set: { seenAt: new Date() },
    });
}
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(timer);
  await boss.stop({ graceful: true, timeout: 10000 });
  await database.close();
  process.exit(code);
}
try {
  await prepareQueue(boss);
  await registerSmokeHandler(boss, database);
  await heartbeat();
  timer = setInterval(() => {
    void heartbeat().catch(() => {
      log("error", "heartbeat_failed");
      void shutdown(1);
    });
  }, 10000);
  log("info", "worker_ready");
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
} catch {
  log("error", "worker_start_failed");
  await shutdown(1);
}
