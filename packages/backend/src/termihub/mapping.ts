import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { calendarMappingInput } from "@helios/contracts";
import type { createDatabase } from "../db";
import type { Db } from "../planning/store";
import { createIdentityService } from "../identity/service";
import { contexts, integrations } from "../work/schema";
import type { WorkConfig } from "../work/config";
import { WorkFault } from "../work/service";
import { termihubCalendarMappings, termihubCatalog } from "./schema";
import {
  contextFor,
  integrationFor,
  instanceRef,
  mappingsFor,
  type CalendarContext,
  type CalendarMapping,
  type TermiIntegration,
} from "./store";
type MappingInput = z.infer<typeof calendarMappingInput>;
type Catalog = (typeof termihubCatalog.$inferSelect)[];
async function assignOrganization(
  db: Db,
  i: TermiIntegration,
  catalog: Catalog,
  c: CalendarContext,
  requested: MappingInput["contexts"][number],
) {
  const ref = requested.organizationId ? instanceRef(i) : null;
  if (
    requested.organizationId === c.termihubEmployerId &&
    ref === c.termihubInstanceRef
  )
    return false;
  const observed = catalog.some(
    (v) =>
      v.kind === "organization" &&
      v.itemId === requested.organizationId &&
      v.available,
  );
  if (requested.organizationId && !observed)
    throw new WorkFault("TERMIHUB_ORGANIZATION_UNVERIFIED", 409);
  await db
    .update(contexts)
    .set({
      termihubEmployerId: requested.organizationId,
      termihubInstanceRef: ref,
      revision: c.revision + 1,
    })
    .where(eq(contexts.id, c.id));
  return true;
}
function sameMapping(
  prior: CalendarMapping | undefined,
  i: TermiIntegration,
  requested: MappingInput["calendars"][number],
) {
  return (
    prior?.credentialVersion === i.credentialVersion &&
    prior.mode === requested.mode &&
    prior.contextId === requested.contextId
  );
}
async function assignCalendar(
  db: Db,
  i: TermiIntegration,
  catalog: Catalog,
  old: CalendarMapping[],
  cs: Map<string, CalendarContext>,
  requested: MappingInput["calendars"][number],
) {
  if ((requested.mode === "context") !== (requested.contextId !== null))
    throw new WorkFault("INVALID_REQUEST", 400);
  if (requested.contextId && !cs.has(requested.contextId))
    throw new WorkFault("TERMIHUB_CONTEXT_REVISION_REQUIRED", 409);
  const prior = old.find((m) => m.calendarId === requested.calendarId);
  if (sameMapping(prior, i, requested)) return false;
  const known = catalog.some(
    (v) =>
      v.kind === "calendar" &&
      v.itemId === requested.calendarId &&
      v.available &&
      v.enabled,
  );
  const preservedExclusion =
    prior !== undefined && requested.mode === "excluded";
  if (!known && !preservedExclusion)
    throw new WorkFault("TERMIHUB_CALENDAR_UNVERIFIED", 409);
  await db
    .insert(termihubCalendarMappings)
    .values({
      integrationId: i.id,
      ...requested,
      credentialVersion: i.credentialVersion,
    })
    .onConflictDoUpdate({
      target: [
        termihubCalendarMappings.integrationId,
        termihubCalendarMappings.calendarId,
      ],
      set: {
        mode: requested.mode,
        contextId: requested.contextId,
        credentialVersion: i.credentialVersion,
      },
    });
  return true;
}
async function ownedContexts(
  db: Db,
  userId: string,
  requested: MappingInput["contexts"],
) {
  const cs = new Map<string, CalendarContext>();
  // Same transaction/client: keep revision validation and writes sequential.
  for (const item of requested) {
    const c = await contextFor(db, userId, item.contextId);
    if (c.revision !== item.contextRevision)
      throw new WorkFault("REVISION_CONFLICT", 409);
    cs.set(c.id, c);
  }
  return cs;
}
export function mappingAction(
  database: ReturnType<typeof createDatabase>,
  config: WorkConfig,
) {
  const identity = createIdentityService(database, config);
  return async (headers: Headers, input: unknown) => {
    const data = calendarMappingInput.parse(input);
    if (
      new Set(data.calendars.map((c) => c.calendarId)).size !==
        data.calendars.length ||
      new Set(data.contexts.map((c) => c.contextId)).size !==
        data.contexts.length
    )
      throw new WorkFault("INVALID_REQUEST", 400);
    return identity.withActive(
      headers,
      { mutation: true, stepUp: true },
      async (db, userId) => {
        const i = await integrationFor(db, userId);
        if (!i?.enabled || !i.encryptedToken || !i.baseUrl)
          throw new WorkFault("TERMIHUB_NOT_CONNECTED", 409);
        if (i.revision !== data.revision)
          throw new WorkFault("REVISION_CONFLICT", 409);
        const catalog = await db
          .select()
          .from(termihubCatalog)
          .where(
            and(
              eq(termihubCatalog.integrationId, i.id),
              eq(termihubCatalog.credentialVersion, i.credentialVersion),
            ),
          );
        const old = await mappingsFor(db, i.id),
          cs = await ownedContexts(db, userId, data.contexts);
        let changed = false;
        for (const requested of data.contexts) {
          if (
            await assignOrganization(
              db,
              i,
              catalog,
              cs.get(requested.contextId)!,
              requested,
            )
          )
            changed = true;
        }
        for (const requested of data.calendars) {
          if (await assignCalendar(db, i, catalog, old, cs, requested))
            changed = true;
        }
        if (!changed) return { revision: i.revision };
        const revision = i.revision + 1;
        await db
          .update(integrations)
          .set({
            revision,
            state: "saved",
            syncRequest: null,
            readClaim: null,
            syncClaimUntil: null,
            nextAllowedAt: null,
          })
          .where(eq(integrations.id, i.id));
        return { revision };
      },
    );
  };
}
