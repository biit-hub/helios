import { createHash, randomUUID } from "node:crypto";
import { and, eq, desc, gt } from "drizzle-orm";
import type { CalendarOrientation, TermiHubSettings } from "@helios/contracts";
import { contexts, integrations } from "../work/schema";
import { WorkFault } from "../work/service";
import type { Db } from "../planning/store";
import {
  calendarSnapshots,
  calendarDayDecisions,
  termihubCalendarMappings,
  termihubCatalog,
} from "./schema";
import {
  SNAPSHOT_RETENTION_MS,
  emptyOrientation,
  snapshotOrientation,
} from "./policy";
export type TermiIntegration = typeof integrations.$inferSelect;
export type CalendarContext = typeof contexts.$inferSelect;
export type CalendarMapping = typeof termihubCalendarMappings.$inferSelect;
export async function integrationFor(db: Db, userId: string, create = false) {
  if (create)
    await db
      .insert(integrations)
      .values({
        id: randomUUID(),
        userId,
        type: "termihub",
        credentialVersion: randomUUID(),
      })
      .onConflictDoNothing();
  const [i] = await db
    .select()
    .from(integrations)
    .where(
      and(eq(integrations.userId, userId), eq(integrations.type, "termihub")),
    );
  return i ?? null;
}
export async function contextFor(db: Db, userId: string, contextId: string) {
  const [c] = await db
    .select()
    .from(contexts)
    .where(and(eq(contexts.id, contextId), eq(contexts.userId, userId)));
  if (!c || !c.active) throw new WorkFault("CONTEXT_NOT_FOUND", 404);
  return c;
}
export const instanceRef = (i: TermiIntegration) =>
  i.id + ":" + i.credentialVersion;
export async function mappingsFor(
  db: Db,
  integrationId: string,
  credentialVersion?: string,
) {
  return db
    .select()
    .from(termihubCalendarMappings)
    .where(
      and(
        eq(termihubCalendarMappings.integrationId, integrationId),
        credentialVersion
          ? eq(termihubCalendarMappings.credentialVersion, credentialVersion)
          : undefined,
      ),
    );
}
export function calendarIdsFor(mappings: CalendarMapping[], contextId: string) {
  return mappings
    .filter(
      (m) =>
        m.mode === "shared" ||
        (m.mode === "context" && m.contextId === contextId),
    )
    .map((m) => m.calendarId)
    .sort((a, b) => a.localeCompare(b));
}
export function mappingBasis(
  i: TermiIntegration,
  c: CalendarContext,
  mappings: CalendarMapping[],
  timezone: string,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        integration: i.id,
        credential: i.credentialVersion,
        revision: i.revision,
        context: c.id,
        contextRevision: c.revision,
        instance: c.termihubInstanceRef,
        organization: c.termihubEmployerId,
        calendars: calendarIdsFor(mappings, c.id),
        timezone,
      }),
    )
    .digest("hex");
}
export async function readCalendarDay(
  db: Db,
  userId: string,
  c: CalendarContext,
  day: string,
  timezone: string,
  now = new Date(),
): Promise<CalendarOrientation> {
  if (c.userId !== userId || !c.active)
    throw new WorkFault("CONTEXT_NOT_FOUND", 404);
  const [decision] = await db
    .select()
    .from(calendarDayDecisions)
    .where(
      and(
        eq(calendarDayDecisions.contextId, c.id),
        eq(calendarDayDecisions.day, day),
      ),
    );
  const empty = (state: CalendarOrientation["state"]) => ({
    ...emptyOrientation(day, timezone, state),
    noWorkConfirmed: decision?.noWorkConfirmed ?? false,
    decisionRevision: decision?.revision ?? 0,
    contextRevision: c.revision,
  });
  const i = await integrationFor(db, userId);
  if (!i?.enabled || !i.encryptedToken || !i.baseUrl)
    return empty("not_connected");
  const mappings = await mappingsFor(db, i.id, i.credentialVersion);
  const basis = mappingBasis(i, c, mappings, timezone);
  const [snapshot] = await db
    .select()
    .from(calendarSnapshots)
    .where(
      and(
        eq(calendarSnapshots.userId, userId),
        eq(calendarSnapshots.integrationId, i.id),
        eq(calendarSnapshots.contextId, c.id),
        eq(calendarSnapshots.day, day),
        eq(calendarSnapshots.timezone, timezone),
        eq(calendarSnapshots.credentialVersion, i.credentialVersion),
        eq(calendarSnapshots.integrationRevision, i.revision),
        eq(calendarSnapshots.contextRevision, c.revision),
        eq(calendarSnapshots.mappingBasis, basis),
        gt(
          calendarSnapshots.retrievedAt,
          new Date(now.getTime() - SNAPSHOT_RETENTION_MS),
        ),
      ),
    )
    .orderBy(desc(calendarSnapshots.revision))
    .limit(1);
  if (!snapshot) {
    const unmapped =
      !calendarIdsFor(mappings, c.id).length ||
      (c.kind === "employer" &&
        (!c.termihubEmployerId || c.termihubInstanceRef !== instanceRef(i)));
    return empty(
      unmapped
        ? "unmapped"
        : i.state === "ready"
          ? decision?.noWorkConfirmed
            ? "no_work_confirmed"
            : "no_data"
          : "unavailable",
    );
  }
  return {
    ...snapshotOrientation(
      snapshot,
      ["ready", "incomplete", "queued", "updating"].includes(i.state),
      decision?.noWorkConfirmed ?? false,
      now,
    ),
    decisionRevision: decision?.revision ?? 0,
    contextRevision: c.revision,
  };
}
export async function settingsView(
  db: Db,
  userId: string,
  keyAvailable: boolean,
): Promise<TermiHubSettings> {
  const i = await integrationFor(db, userId);
  const cs = await db
    .select()
    .from(contexts)
    .where(eq(contexts.userId, userId));
  const catalog = i
    ? await db
        .select()
        .from(termihubCatalog)
        .where(
          and(
            eq(termihubCatalog.integrationId, i.id),
            eq(termihubCatalog.credentialVersion, i.credentialVersion),
          ),
        )
    : [];
  const mappings = i ? await mappingsFor(db, i.id) : [];
  return {
    integrationId: i?.id ?? null,
    revision: i?.revision ?? 0,
    baseUrl: i?.baseUrl ?? "",
    enabled: i?.enabled ?? false,
    hasToken: !!i?.encryptedToken,
    keyAvailable,
    state: i?.state ?? "not_connected",
    syncing:
      !!i?.syncRequest ||
      !!(i?.readClaim && i.syncClaimUntil && i.syncClaimUntil > new Date()),
    lastCheckedAt: i?.lastCheckedAt?.toISOString() ?? null,
    lastCatalogAt: i?.lastCatalogAt?.toISOString() ?? null,
    lastSyncAt: i?.lastSyncAt?.toISOString() ?? null,
    nextAllowedAt: i?.nextAllowedAt?.toISOString() ?? null,
    calendars: catalog
      .filter((v) => v.kind === "calendar")
      .map((v) => ({
        id: v.itemId,
        name: v.name,
        type: v.calendarType ?? "unknown",
        enabled: v.enabled,
        available: v.available,
      })),
    organizations: catalog
      .filter((v) => v.kind === "organization" && v.available)
      .map((v) => ({ id: v.itemId, name: v.name })),
    mappings: mappings.map(
      ({ calendarId, mode, contextId, credentialVersion }) => ({
        calendarId,
        mode,
        contextId,
        verified: credentialVersion === i?.credentialVersion,
      }),
    ),
    contexts: cs.map((c) => ({
      id: c.id,
      name: c.name,
      revision: c.revision,
      kind: c.kind,
      active: c.active,
      organizationId: c.termihubEmployerId,
      instanceMatches: !!i && c.termihubInstanceRef === instanceRef(i),
    })),
  };
}
