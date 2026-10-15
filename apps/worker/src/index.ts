import { randomUUID } from "node:crypto";
import {
  createDatabase,
  createQueue,
  prepareQueue,
  registerSmokeHandler,
  workerHeartbeats,
  loadWorkConfig,
  createPlanExecutor,
  createAiWorker,
  log,
} from "@helios/backend";
const config = loadWorkConfig();
if (!config.WORKER_ENABLED || config.RESTORE_MODE) {
  log("info", "worker_disabled");
  process.exit(0);
}
const database = createDatabase(config.DATABASE_URL);
const boss = createQueue(config.DATABASE_URL);
const id = randomUUID();
const executor = createPlanExecutor(database, config);
const ai = createAiWorker(database, config, boss);
let aiTimer: ReturnType<typeof setInterval> | undefined;
let scanTimer: ReturnType<typeof setInterval> | undefined;
let aiBusy = false;
let scanBusy = false;
let operationsBusy = false;
const operationsTimer = setInterval(() => {
  if (operationsBusy) return;
  operationsBusy = true;
  void executor
    .runNext()
    .catch(() => log("error", "plan_operation_failed"))
    .finally(() => {
      operationsBusy = false;
    });
}, 3000);
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
  clearInterval(operationsTimer);
  clearInterval(aiTimer);
  clearInterval(scanTimer);
  ai.stop();
  await boss.stop({ graceful: true, timeout: 10000 });
  await database.close();
  process.exit(code);
}
try {
  await prepareQueue(boss);
  await registerSmokeHandler(boss, database);
  await ai.register();
  aiTimer = setInterval(() => {
    if (aiBusy) return;
    aiBusy = true;
    void ai
      .dispatch()
      .catch(() => log("error", "ai_dispatch_failed"))
      .finally(() => {
        aiBusy = false;
      });
  }, 2000);
  scanTimer = setInterval(() => {
    if (scanBusy) return;
    scanBusy = true;
    void ai
      .scan()
      .then(() => ai.syncStatus())
      .then(() => ai.cleanup())
      .catch(() => log("error", "ai_scan_failed"))
      .finally(() => {
        scanBusy = false;
      });
  }, 60000);
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
