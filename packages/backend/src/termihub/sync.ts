import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { symmetricDecrypt } from "better-auth/crypto";
import type { createDatabase } from "../db";
import { createIdentityService } from "../identity/service";
import { AuthFault } from "../identity/policy";
import { contexts, integrations } from "../work/schema";
import { WorkFault } from "../work/service";
import type { WorkConfig } from "../work/config";
import type { Db } from "../planning/store";
import type { TermiHubReader } from "./reader";
import { TermiHubFault } from "./transport";
import { calendarSnapshots, termihubCatalog } from "./schema";
import { normalizeDay } from "./intervals";
import { SNAPSHOT_FRESH_MS } from "./policy";
import { syncRequestSchema, type TermiHubSyncRequest } from "./request";
import { collectSource, type TermiHubSource } from "./source";
import {
  calendarIdsFor,
  instanceRef,
  mappingBasis,
  mappingsFor,
  type CalendarContext,
  type TermiIntegration,
} from "./store";
import { recordTermiHubProblem, resolveTermiHubProblems } from "./problems";
const terminalCodes = new Set([
  "TERMIHUB_AUTH",
  "TERMIHUB_PERMISSION",
  "KEY_UNAVAILABLE",
  "TERMIHUB_URL_INVALID",
  "TERMIHUB_URL_BLOCKED",
  "TERMIHUB_CONTRACT",
  "TERMIHUB_SCOPE",
  "TERMIHUB_TOO_LARGE",
  "TERMIHUB_REDIRECT",
]);
function failureCode(e: unknown) {
  if (e instanceof AuthFault) return "TERMIHUB_ACTOR_REVOKED";
  if (e instanceof TermiHubFault || e instanceof WorkFault) return e.code;
  return "TERMIHUB_RESPONSE";
}
export const requiresManualRetry = (state: string) => terminalCodes.has(state);
const contextSignature = (cs: CalendarContext[]) =>
  JSON.stringify(
    cs
      .map((c) => [c.id, c.revision])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
function activeContexts(db: Db, userId: string) {
  return db
    .select()
    .from(contexts)
    .where(and(eq(contexts.userId, userId), eq(contexts.active, true)));
}
async function current(
  db: Db,
  original: TermiIntegration,
  request: TermiHubSyncRequest,
  claim?: string,
) {
  const [i] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.id, original.id),
        eq(integrations.userId, original.userId),
        eq(integrations.type, "termihub"),
      ),
    );
  if (
    !i?.enabled ||
    !i.encryptedToken ||
    !i.baseUrl ||
    i.credentialVersion !== request.credentialVersion ||
    i.revision !== request.integrationRevision ||
    i.syncRequest?.id !== request.id ||
    (claim &&
      (i.readClaim !== claim ||
        !i.syncClaimUntil ||
        i.syncClaimUntil <= new Date()))
  )
    throw new WorkFault("TERMIHUB_SOURCE_CHANGED", 409);
  return i;
}
async function saveCatalog(
  db: Db,
  i: TermiIntegration,
  source: TermiHubSource,
  now: Date,
) {
  await db
    .update(termihubCatalog)
    .set({ available: false })
    .where(
      and(
        eq(termihubCatalog.integrationId, i.id),
        eq(termihubCatalog.kind, "calendar"),
      ),
    );
  for (const calendar of source.calendars)
    await db
      .insert(termihubCatalog)
      .values({
        integrationId: i.id,
        kind: "calendar",
        itemId: calendar.id,
        name: calendar.name,
        calendarType: calendar.type,
        enabled: calendar.enabled && calendar.visible,
        available: true,
        credentialVersion: i.credentialVersion,
        retrievedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          termihubCatalog.integrationId,
          termihubCatalog.kind,
          termihubCatalog.itemId,
        ],
        set: {
          name: calendar.name,
          calendarType: calendar.type,
          enabled: calendar.enabled && calendar.visible,
          available: true,
          credentialVersion: i.credentialVersion,
          retrievedAt: now,
        },
      });
  const organizations = new Map(
    source.work.map((work) => [work.organization.id, work.organization.name]),
  );
  // An absent organization in this bounded window is not deletion evidence.
  for (const [itemId, name] of organizations)
    await db
      .insert(termihubCatalog)
      .values({
        integrationId: i.id,
        kind: "organization",
        itemId,
        name,
        enabled: true,
        available: true,
        credentialVersion: i.credentialVersion,
        retrievedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          termihubCatalog.integrationId,
          termihubCatalog.kind,
          termihubCatalog.itemId,
        ],
        set: {
          name,
          available: true,
          credentialVersion: i.credentialVersion,
          retrievedAt: now,
        },
      });
}

export function createTermiHubSync(
  database: ReturnType<typeof createDatabase>,
  config: WorkConfig,
  reader: TermiHubReader,
) {
  const identity = createIdentityService(database, config);
  const guarded = <T>(
    i: TermiIntegration,
    request: TermiHubSyncRequest,
    fn: (db: Db) => Promise<T>,
  ) =>
    request.kind === "manual"
      ? identity.withOperationSession(request.sessionId!, i.userId, fn)
      : identity.withBackgroundUser(i.userId, fn);
  async function releaseStale(
    initial: TermiIntegration,
    requestId: string,
    claim: string,
  ) {
    try {
      await identity.withBackgroundUser(initial.userId, async (db) => {
        const [i] = await db
          .select()
          .from(integrations)
          .where(eq(integrations.id, initial.id));
        if (
          i?.credentialVersion === initial.credentialVersion &&
          i.revision === initial.revision &&
          i.syncRequest?.id === requestId &&
          i.readClaim === claim
        )
          await db
            .update(integrations)
            .set({
              state: "saved",
              readClaim: null,
              syncClaimUntil: null,
              syncRequest: null,
              nextAllowedAt: null,
            })
            .where(eq(integrations.id, i.id));
      });
    } catch {
      /* Disabled or recovering owners cannot receive results. */
    }
  }
  async function failedRead(
    initial: TermiIntegration,
    request: TermiHubSyncRequest,
    requestId: string,
    claim: string,
    captured: boolean,
    e: unknown,
  ) {
    const code = failureCode(e);
    const terminal =
      code === "TERMIHUB_ACTOR_REVOKED" ||
      terminalCodes.has(code) ||
      request.attempts >= 3;
    try {
      await identity.withBackgroundUser(initial.userId, async (db) => {
        const [i] = await db
          .select()
          .from(integrations)
          .where(eq(integrations.id, initial.id));
        if (
          !i ||
          i.credentialVersion !== initial.credentialVersion ||
          i.revision !== initial.revision ||
          i.syncRequest?.id !== requestId ||
          (captured && i.readClaim !== claim)
        )
          return;
        const delay =
          e instanceof TermiHubFault && e.code === "TERMIHUB_RATE_LIMIT"
            ? e.retryAfterSeconds * 1000
            : 30000 * 2 ** Math.max(0, request.attempts - 1);
        await db
          .update(integrations)
          .set({
            state: code === "TERMIHUB_ACTOR_REVOKED" ? "saved" : code,
            lastCheckedAt: new Date(),
            readClaim: null,
            syncClaimUntil: null,
            ...(terminal ? { syncRequest: null } : {}),
            nextAllowedAt: new Date(
              Date.now() + (terminal ? SNAPSHOT_FRESH_MS : delay),
            ),
          })
          .where(eq(integrations.id, i.id));
        if (code !== "TERMIHUB_ACTOR_REVOKED")
          await recordTermiHubProblem(db, i, code);
      });
    } catch {
      /* An inactive/recovering user cannot receive derived results. */
    }
  }

  async function run(
    integrationId: string,
    requestId: string,
  ): Promise<"skipped" | "synced" | "failed" | "discarded"> {
    if (config.RESTORE_MODE || !config.WORKER_ENABLED) return "skipped";
    const [initial] = await database.db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.id, integrationId),
          eq(integrations.type, "termihub"),
        ),
      );
    if (!initial?.syncRequest || initial.syncRequest.id !== requestId)
      return "skipped";
    const parsed = syncRequestSchema.safeParse(initial.syncRequest);
    if (!parsed.success) return "skipped";
    let request = parsed.data;
    const claim = randomUUID();
    let captured: {
      i: TermiIntegration;
      cs: CalendarContext[];
      maps: Awaited<ReturnType<typeof mappingsFor>>;
    } | null = null;
    try {
      captured = await guarded(initial, request, async (db) => {
        const i = await current(db, initial, request);
        if (
          (i.readClaim && i.syncClaimUntil && i.syncClaimUntil > new Date()) ||
          (request.attempts > 0 &&
            i.nextAllowedAt &&
            i.nextAllowedAt > new Date())
        )
          return null;
        if (request.attempts >= 3) {
          await db
            .update(integrations)
            .set({
              syncRequest: null,
              readClaim: null,
              syncClaimUntil: null,
              nextAllowedAt: new Date(Date.now() + SNAPSHOT_FRESH_MS),
            })
            .where(eq(integrations.id, i.id));
          return null;
        }
        request = { ...request, attempts: request.attempts + 1 };
        await db
          .update(integrations)
          .set({
            readClaim: claim,
            syncClaimUntil: new Date(Date.now() + 300000),
            syncRequest: request,
            state: "updating",
          })
          .where(eq(integrations.id, i.id));
        return {
          i,
          cs: await activeContexts(db, i.userId),
          maps: await mappingsFor(db, i.id, i.credentialVersion),
        };
      });
      if (!captured) return "skipped";
      if (!config.INTEGRATION_KEY) throw new WorkFault("KEY_UNAVAILABLE", 503);
      let token: string;
      try {
        token = await symmetricDecrypt({
          key: config.INTEGRATION_KEY,
          data: captured.i.encryptedToken!,
        });
      } catch {
        throw new WorkFault("KEY_UNAVAILABLE", 503);
      }
      const source = await collectSource(
        reader,
        captured.i,
        token,
        request.day,
        request.timezone,
        captured.cs,
        captured.maps,
      );
      const capturedSource = captured;
      await guarded(captured.i, request, async (db) => {
        const i = await current(db, capturedSource.i, request, claim);
        const cs = await activeContexts(db, i.userId);
        if (contextSignature(cs) !== contextSignature(capturedSource.cs))
          throw new WorkFault("TERMIHUB_SOURCE_CHANGED", 409);
        const now = new Date(),
          revision = i.syncRevision + 1;
        await saveCatalog(db, i, source, now);
        const available = source.calendars.filter(
          (c) => c.enabled && c.visible,
        );
        const allDecided = available.every((calendar) =>
          capturedSource.maps.some((m) => m.calendarId === calendar.id),
        );
        for (const c of cs) {
          const ids = calendarIdsFor(capturedSource.maps, c.id);
          const availableIds = ids.filter((id) =>
            available.some((calendar) => calendar.id === id),
          );
          const organizationId =
            c.termihubInstanceRef === instanceRef(i)
              ? c.termihubEmployerId
              : null;
          const data = normalizeDay({
            day: request.day,
            timezone: request.timezone,
            organizationId,
            calendarIds: ids,
            kind: c.kind,
            work: source.work,
            events: source.events.filter((event) =>
              ids.includes(event.calendar.id),
            ),
            travel: source.travel,
            complete: source.complete,
            mappingsComplete: allDecided && availableIds.length === ids.length,
          });
          data.warnings = [
            ...new Set([...data.warnings, ...source.warnings]),
          ].sort((a, b) => a.localeCompare(b));
          const basis = mappingBasis(
            i,
            c,
            capturedSource.maps,
            request.timezone,
          );
          const sourceHash = createHash("sha256")
            .update(JSON.stringify({ basis, day: request.day, data }))
            .digest("hex");
          await db.insert(calendarSnapshots).values({
            id: randomUUID(),
            userId: i.userId,
            integrationId: i.id,
            contextId: c.id,
            day: request.day,
            timezone: request.timezone,
            revision,
            credentialVersion: i.credentialVersion,
            integrationRevision: i.revision,
            contextRevision: c.revision,
            calendarIds: ids,
            organizationId,
            mappingBasis: basis,
            sourceHash,
            retrievedAt: now,
            freshUntil: new Date(now.getTime() + SNAPSHOT_FRESH_MS),
            data,
          });
        }
        await db
          .update(integrations)
          .set({
            syncRevision: revision,
            state: source.complete ? "ready" : "incomplete",
            lastCheckedAt: now,
            lastCatalogAt: now,
            ...(source.complete ? { lastSyncAt: now } : {}),
            syncRequest: null,
            readClaim: null,
            syncClaimUntil: null,
            nextAllowedAt: new Date(
              now.getTime() + (source.complete ? 15000 : SNAPSHOT_FRESH_MS),
            ),
          })
          .where(eq(integrations.id, i.id));
        await resolveTermiHubProblems(db, i, source.complete);
        if (!source.complete)
          await recordTermiHubProblem(db, i, "TERMIHUB_INCOMPLETE");
      });
      return "synced";
    } catch (e) {
      if (e instanceof WorkFault && e.code === "TERMIHUB_SOURCE_CHANGED") {
        await releaseStale(initial, requestId, claim);
        return "discarded";
      }
      await failedRead(
        initial,
        request,
        requestId,
        claim,
        captured !== null,
        e,
      );
      return "failed";
    }
  }
  return { run };
}
