import { and, eq, desc } from "drizzle-orm";
import { createIdentityService } from "../identity/service";
import { managedScope, clarityHash } from "../ai/source";
import { needsContext } from "../ai/validation";
import { aiDrafts, aiTaskSignals } from "../ai/schema";
import { taskProjections } from "../work/schema";
import type { Database } from "../planning/store";
import type { WorkConfig } from "../work/config";
import type { RoutineContext } from "./schema";
import { localDay } from "../planning/selection";
export async function enrichmentCandidates(
  database: Database,
  config: WorkConfig,
  h: Headers,
  r: RoutineContext,
  timezone = process.env.PLAN_TIMEZONE ?? "Europe/Zurich",
) {
  return createIdentityService(database, config).withActive(
    h,
    {},
    async (db, user) => {
      const s = await managedScope(db, user, r.contextId);
      const rows = await db
        .select()
        .from(taskProjections)
        .where(
          and(
            eq(taskProjections.contextId, r.contextId),
            eq(taskProjections.credentialVersion, s.i.credentialVersion),
            eq(taskProjections.state, "active"),
            eq(taskProjections.projectId, s.c.projectId!),
          ),
        );
      const drafts = await db
        .select()
        .from(aiDrafts)
        .where(
          and(
            eq(aiDrafts.userId, user),
            eq(aiDrafts.contextId, r.contextId),
            eq(aiDrafts.credentialVersion, s.i.credentialVersion),
            eq(aiDrafts.kind, "analysis"),
          ),
        )
        .orderBy(desc(aiDrafts.createdAt));
      const signals = await db
        .select()
        .from(aiTaskSignals)
        .where(
          and(
            eq(aiTaskSignals.contextId, r.contextId),
            eq(aiTaskSignals.credentialVersion, s.i.credentialVersion),
          ),
        );
      const day = localDay(new Date(), timezone);
      const candidates = rows.flatMap((row) => {
        if (row.data.checked || row.data.is_deleted) return [];
        const draft = drafts.find(
          (d) =>
            d.taskId === row.taskId &&
            d.output &&
            d.source?.inspection.task.content === row.data.content &&
            d.source.inspection.task.description === row.data.description,
        );
        const signal = signals.find((x) => x.taskId === row.taskId);
        const clear =
          !!draft?.source &&
          signal?.clearFingerprint === clarityHash(draft.source);
        const stale = !!row.data.due && row.data.due.date.slice(0, 10) < day;
        const unclear =
          !clear &&
          (row.data.labels.includes("need_context") ||
            (!!draft?.output && needsContext(draft.output, false)));
        if (!stale && !unclear) return [];
        const added = row.data.added_at ? new Date(row.data.added_at) : null;
        const newToday =
          !!added &&
          !Number.isNaN(added.getTime()) &&
          localDay(added, timezone) === day;
        return [
          {
            taskId: row.taskId,
            title: row.data.content,
            newToday,
            reasons: [
              ...(newToday ? ["Heute in Todoist erstellt"] : []),
              ...(stale ? ["Veraltetes Planungsdatum – keine Deadline"] : []),
              ...(unclear ? ["Konkreten Klärungsbedarf prüfen"] : []),
            ],
            draftId: draft?.id ?? null,
            deadline: row.data.deadline?.date ?? null,
            knownSince:
              drafts
                .filter((d) => d.taskId === row.taskId)
                .at(-1)
                ?.createdAt.toISOString() ?? row.retrievedAt.toISOString(),
          },
        ];
      });
      candidates.sort(
        (a, b) =>
          (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
          Number(b.newToday) - Number(a.newToday) ||
          a.knownSince.localeCompare(b.knownSince) ||
          a.taskId.localeCompare(b.taskId),
      );
      return { candidates };
    },
  );
}
