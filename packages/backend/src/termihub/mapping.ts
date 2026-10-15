import { and, eq } from "drizzle-orm";
import { calendarMappingInput } from "@helios/contracts";
import type { createDatabase } from "../db";
import { createIdentityService } from "../identity/service";
import { contexts, integrations } from "../work/schema";
import type { WorkConfig } from "../work/config";
import { WorkFault } from "../work/service";
import { termihubCalendarMappings, termihubCatalog } from "./schema";
import { contextFor, integrationFor, instanceRef, mappingsFor } from "./store";
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
        const old = await mappingsFor(db, i.id);
        const cs = new Map<string, Awaited<ReturnType<typeof contextFor>>>();
        for (const requested of data.contexts) {
          const c = await contextFor(db, userId, requested.contextId);
          if (c.revision !== requested.contextRevision)
            throw new WorkFault("REVISION_CONFLICT", 409);
          cs.set(c.id, c);
        }
        let changed = false;
        for (const requested of data.contexts) {
          const c = cs.get(requested.contextId)!;
          const ref = requested.organizationId ? instanceRef(i) : null;
          if (
            requested.organizationId === c.termihubEmployerId &&
            ref === c.termihubInstanceRef
          )
            continue;
          if (
            requested.organizationId &&
            !catalog.some(
              (v) =>
                v.kind === "organization" &&
                v.itemId === requested.organizationId &&
                v.available,
            )
          )
            throw new WorkFault("TERMIHUB_ORGANIZATION_UNVERIFIED", 409);
          await db
            .update(contexts)
            .set({
              termihubEmployerId: requested.organizationId,
              termihubInstanceRef: ref,
              revision: c.revision + 1,
            })
            .where(eq(contexts.id, c.id));
          changed = true;
        }
        for (const requested of data.calendars) {
          if ((requested.mode === "context") !== (requested.contextId !== null))
            throw new WorkFault("INVALID_REQUEST", 400);
          if (requested.contextId && !cs.has(requested.contextId))
            throw new WorkFault("TERMIHUB_CONTEXT_REVISION_REQUIRED", 409);
          const prior = old.find((m) => m.calendarId === requested.calendarId);
          if (
            prior &&
            prior.credentialVersion === i.credentialVersion &&
            prior.mode === requested.mode &&
            prior.contextId === requested.contextId
          )
            continue;
          const known = catalog.some(
            (v) =>
              v.kind === "calendar" &&
              v.itemId === requested.calendarId &&
              v.available &&
              v.enabled,
          );
          if (!known && !(prior && requested.mode === "excluded"))
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
