import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { createDatabase } from "../db";
import type { WorkConfig } from "../work/config";
import { WorkFault } from "../work/service";
import { contexts, integrations } from "../work/schema";
import { createIdentityService } from "../identity/service";
import { planningTimezone } from "../planning/service";
import { localDay } from "../planning/selection";
import { calendarDayDecisions } from "./schema";
import { dayRange } from "./intervals";
import { connectionActions } from "./credentials";
import { mappingAction } from "./mapping";
import {
  contextFor,
  integrationFor,
  readCalendarDay,
  settingsView,
} from "./store";
import {
  networkConfig,
  type Resolver,
  type TermiHubNetworkConfig,
} from "./transport";
import { syncRequestSchema } from "./request";
const dayInput = z.strictObject({ day: z.iso.date().optional() });
const scopeInput = dayInput.extend({ contextId: z.uuid().optional() });
const decisionInput = z.strictObject({
  contextId: z.uuid(),
  contextRevision: z.number().int().nonnegative(),
  day: z.iso.date(),
  revision: z.number().int().nonnegative(),
  noWorkConfirmed: z.boolean(),
});
export function createTermiHubService(
  database: ReturnType<typeof createDatabase>,
  config: WorkConfig,
  options: {
    network?: TermiHubNetworkConfig;
    resolver?: Resolver;
    timezone?: string;
  } = {},
) {
  const identity = createIdentityService(database, config);
  const timezone = options.timezone ?? planningTimezone();
  const network =
    options.network ??
    networkConfig({ ...process.env, HELIOS_ENV: config.HELIOS_ENV });
  const connections = connectionActions(
    database,
    config,
    network,
    options.resolver,
  );
  const saveMapping = mappingAction(database, config);
  const today = () => localDay(new Date(), timezone);
  function validateDay(day: string) {
    const range = dayRange(day, timezone);
    if (Math.abs(range.start - Date.now()) > 400 * 86400000)
      throw new WorkFault("TERMIHUB_DAY_INVALID", 400);
    return day;
  }
  async function orientations(headers: Headers, input: unknown = {}) {
    const data = scopeInput.parse(input),
      day = validateDay(data.day ?? today());
    return identity.withActive(headers, {}, async (db, userId) => {
      const cs = data.contextId
        ? [await contextFor(db, userId, data.contextId)]
        : await db
            .select()
            .from(contexts)
            .where(and(eq(contexts.userId, userId), eq(contexts.active, true)));
      const items = [];
      for (const c of cs)
        items.push({
          contextId: c.id,
          name: c.name,
          orientation: await readCalendarDay(db, userId, c, day, timezone),
        });
      return { isToday: day === today(), day, timezone, contexts: items };
    });
  }
  async function refresh(headers: Headers, input: unknown) {
    const data = dayInput.parse(input),
      day = validateDay(data.day ?? today());
    return identity.withActive(
      headers,
      { mutation: true },
      async (db, userId, sessionId) => {
        const i = await integrationFor(db, userId);
        if (!i?.enabled || !i.encryptedToken || !i.baseUrl)
          throw new WorkFault("TERMIHUB_NOT_CONNECTED", 409);
        if (!config.INTEGRATION_KEY)
          throw new WorkFault("KEY_UNAVAILABLE", 503);
        if (i.syncRequest) {
          const request = syncRequestSchema.safeParse(i.syncRequest);
          if (!request.success)
            throw new WorkFault("TERMIHUB_REQUEST_INVALID", 409);
          if (request.data.day === day && request.data.timezone === timezone)
            return { queued: true };
          throw new WorkFault("TERMIHUB_BUSY", 409);
        }
        if (i.readClaim && i.syncClaimUntil && i.syncClaimUntil > new Date())
          throw new WorkFault("TERMIHUB_BUSY", 409);
        if (i.nextAllowedAt && i.nextAllowedAt > new Date())
          throw new WorkFault("TERMIHUB_COOLDOWN", 429);
        const request = syncRequestSchema.parse({
          id: randomUUID(),
          kind: "manual",
          sessionId,
          day,
          timezone,
          createdAt: new Date().toISOString(),
          attempts: 0,
          credentialVersion: i.credentialVersion,
          integrationRevision: i.revision,
        });
        await db
          .update(integrations)
          .set({
            syncRequest: request,
            state: "queued",
            readClaim: null,
            syncClaimUntil: null,
            nextAllowedAt: new Date(Date.now() + 15000),
          })
          .where(eq(integrations.id, i.id));
        return { queued: true };
      },
    );
  }
  async function decision(headers: Headers, input: unknown) {
    const data = decisionInput.parse(input);
    if (data.day !== today()) throw new WorkFault("TERMIHUB_DAY_CHANGED", 409);
    return identity.withActive(
      headers,
      { mutation: true },
      async (db, userId) => {
        const c = await contextFor(db, userId, data.contextId);
        if (c.revision !== data.contextRevision)
          throw new WorkFault("REVISION_CONFLICT", 409);
        const view = await readCalendarDay(db, userId, c, data.day, timezone);
        if (data.noWorkConfirmed && view.work.length)
          throw new WorkFault("TERMIHUB_WORK_EXISTS", 409);
        const [old] = await db
          .select()
          .from(calendarDayDecisions)
          .where(
            and(
              eq(calendarDayDecisions.contextId, c.id),
              eq(calendarDayDecisions.day, data.day),
            ),
          );
        if ((old?.revision ?? 0) !== data.revision)
          throw new WorkFault("REVISION_CONFLICT", 409);
        const revision = data.revision + 1;
        await db
          .insert(calendarDayDecisions)
          .values({
            contextId: c.id,
            day: data.day,
            revision,
            noWorkConfirmed: data.noWorkConfirmed,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [calendarDayDecisions.contextId, calendarDayDecisions.day],
            set: {
              revision,
              noWorkConfirmed: data.noWorkConfirmed,
              updatedAt: new Date(),
            },
          });
        return { revision };
      },
    );
  }
  return {
    settings: (headers: Headers) =>
      identity.withActive(headers, {}, (db, userId) =>
        settingsView(db, userId, !!config.INTEGRATION_KEY),
      ),
    orientations,
    refresh,
    decision,
    async handle(action: string, headers: Headers, input: unknown) {
      if (action === "save") return connections.save(headers, input);
      if (["enable", "disable", "remove"].includes(action))
        return connections.change(
          action as "enable" | "disable" | "remove",
          headers,
          input,
        );
      if (action === "mapping") return saveMapping(headers, input);
      if (action === "refresh") return refresh(headers, input);
      if (action === "decision") return decision(headers, input);
      throw new WorkFault("NOT_FOUND", 404);
    },
  };
}
