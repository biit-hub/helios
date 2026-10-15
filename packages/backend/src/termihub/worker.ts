import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { PgBoss } from "pg-boss";
import type { createDatabase } from "../db";
import type { WorkConfig } from "../work/config";
import { createIdentityService } from "../identity/service";
import { planningTimezone } from "../planning/service";
import { localDay } from "../planning/selection";
import { integrations, contexts } from "../work/schema";
import {
  createTransport,
  networkConfig,
  type TermiHubNetworkConfig,
} from "./transport";
import { createTermiHubReader, type TermiHubReader } from "./reader";
import { createTermiHubSync, requiresManualRetry } from "./sync";
import { syncRequestSchema } from "./request";
import { readCalendarDay } from "./store";
import { cleanupExpiredSnapshots } from "./cleanup";
export const TERMIHUB_QUEUE = "helios.termihub-read";
const jobInput = z.strictObject({
  integrationId: z.uuid(),
  requestId: z.uuid(),
});
export function createTermiHubWorker(
  database: ReturnType<typeof createDatabase>,
  config: WorkConfig,
  boss: PgBoss,
  options: {
    reader?: TermiHubReader;
    network?: TermiHubNetworkConfig;
    timezone?: string;
  } = {},
) {
  const identity = createIdentityService(database, config),
    timezone = options.timezone ?? planningTimezone();
  // Validate optional network settings only when this integration actually reads.
  // A TermiHub-only configuration fault must not prevent Todoist jobs starting.
  const reader =
    options.reader ??
    createTermiHubReader(async (...args) => {
      const network =
        options.network ??
        networkConfig({ ...process.env, HELIOS_ENV: config.HELIOS_ENV });
      return createTransport(network)(...args);
    });
  const sync = createTermiHubSync(database, config, reader);
  async function dispatch() {
    if (config.RESTORE_MODE || !config.WORKER_ENABLED) return;
    const all = await database.db
      .select()
      .from(integrations)
      .where(
        and(eq(integrations.type, "termihub"), eq(integrations.enabled, true)),
      );
    for (const original of all) {
      const request = await identity
        .withBackgroundUser(original.userId, async (db) => {
          const [i] = await db
            .select()
            .from(integrations)
            .where(eq(integrations.id, original.id));
          if (!i?.enabled || !i.baseUrl || !i.encryptedToken) return null;
          if (i.nextAllowedAt && i.nextAllowedAt > new Date()) return null;
          if (i.syncRequest) {
            const parsed = syncRequestSchema.safeParse(i.syncRequest);
            if (parsed.success)
              return { integrationId: i.id, requestId: parsed.data.id };
            await db
              .update(integrations)
              .set({
                syncRequest: null,
                readClaim: null,
                syncClaimUntil: null,
                state: "TERMIHUB_REQUEST_INVALID",
              })
              .where(eq(integrations.id, i.id));
            return null;
          }
          if (requiresManualRetry(i.state)) return null;
          const day = localDay(new Date(), timezone);
          const cs = await db
            .select()
            .from(contexts)
            .where(
              and(eq(contexts.userId, i.userId), eq(contexts.active, true)),
            );
          let due =
            !i.lastSyncAt || Date.now() - i.lastSyncAt.getTime() >= 900000;
          if (!due)
            for (const c of cs) {
              const view = await readCalendarDay(
                db,
                i.userId,
                c,
                day,
                timezone,
              );
              if (!view.snapshotId || view.state === "stale") {
                due = true;
                break;
              }
            }
          if (!due) return null;
          const intent = syncRequestSchema.parse({
            id: randomUUID(),
            kind: "scheduled",
            sessionId: null,
            day,
            timezone,
            createdAt: new Date().toISOString(),
            attempts: 0,
            credentialVersion: i.credentialVersion,
            integrationRevision: i.revision,
          });
          await db
            .update(integrations)
            .set({ syncRequest: intent, state: "queued" })
            .where(eq(integrations.id, i.id));
          return { integrationId: i.id, requestId: intent.id };
        })
        .catch(() => null);
      if (request)
        await boss.send(TERMIHUB_QUEUE, request, {
          singletonKey: request.integrationId + ":" + request.requestId,
          retryLimit: 2,
          retryDelay: 30,
          expireInSeconds: 360,
        });
    }
  }
  async function register() {
    await boss.createQueue(TERMIHUB_QUEUE, {
      retryLimit: 2,
      retryDelay: 30,
      expireInSeconds: 360,
    });
    await boss.work(
      TERMIHUB_QUEUE,
      { localConcurrency: 1, batchSize: 1 },
      async (jobs) => {
        for (const job of jobs) {
          const data = jobInput.parse(job.data);
          await sync.run(data.integrationId, data.requestId);
        }
      },
    );
  }
  return {
    register,
    dispatch,
    run: sync.run,
    cleanup: () => cleanupExpiredSnapshots(database, config),
  };
}
