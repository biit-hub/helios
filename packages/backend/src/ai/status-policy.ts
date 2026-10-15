import { randomUUID } from "node:crypto";
import { and, eq, sql, inArray } from "drizzle-orm";
import type { Database, Db } from "../planning/store";
import type { WorkConfig } from "../work/config";
import type { TodoistReader } from "../work/todoist";
import { planOperations, planSteps } from "../planning/schema";
import type { TaskPayload } from "../tasks/service";
import { fingerprint } from "../tasks/service";
import { WorkFault } from "../work/service";
import { aiDrafts, type AiDraft } from "./schema";
import { signal, saveSignal } from "./store";
import {
  readSource,
  analysisHash,
  clarityHash,
  managedScope,
  assertDraftScope,
} from "./source";
import { needsContext } from "./validation";
export type AnalysisLink = {
  id: string;
  fingerprint: string;
  desired: boolean;
};
type Operation = typeof planOperations.$inferSelect;
async function decision(db: Db, d: AiDraft) {
  const s = await signal(db, d);
  if (!s || s.analysisId !== d.id || !d.source || d.kind !== "analysis")
    throw new WorkFault("AI_STATUS_POLICY_DENIED", 409);
  const clear = s.clearFingerprint === clarityHash(d.source);
  if (
    !clear &&
    (!d.output || !["ready", "applied", "rejected"].includes(d.status))
  )
    throw new WorkFault("AI_STATUS_POLICY_DENIED", 409);
  const desired = d.output ? needsContext(d.output, clear) : false;
  return { desired, mayRemove: clear || s.labelOwned };
}
export async function authorizeAnalysis(
  db: Db,
  op: Operation,
  payload: TaskPayload,
) {
  const link = payload.analysisLink;
  const command = payload.command;
  const [d] = link
    ? await db.select().from(aiDrafts).where(eq(aiDrafts.id, link.id))
    : [];
  if (
    !d ||
    !link ||
    d.userId !== op.userId ||
    d.contextId !== op.contextId ||
    d.taskId !== command.taskId ||
    d.analysisFingerprint !== link.fingerprint ||
    command.action !== "update" ||
    Object.keys(command.fields ?? {}).join(",") !== "labels" ||
    !payload.source ||
    op.intentExpiresAt <= new Date()
  )
    throw new WorkFault("AI_STATUS_POLICY_DENIED", 409);
  const s = await assertDraftScope(db, d);
  if (
    !s ||
    s.i.credentialVersion !== payload.credentialVersion ||
    s.i.revision !== payload.integrationRevision ||
    s.c.revision !== payload.contextRevision
  )
    throw new WorkFault("AI_SCOPE_DENIED", 409);
  const state = await decision(db, d);
  if (state.desired !== link.desired || (!state.desired && !state.mayRemove))
    throw new WorkFault("AI_STATUS_POLICY_DENIED", 409);
  const expected = payload.source.labels.filter((l) => l !== "need_context");
  if (link.desired) expected.push("need_context");
  if (fingerprint(expected) !== fingerprint(command.fields?.labels))
    throw new WorkFault("AI_STATUS_POLICY_DENIED", 409);
  return s;
}
export async function validateAnalysisMutation(
  database: Database,
  config: WorkConfig,
  reader: TodoistReader,
  op: Operation,
  payload: TaskPayload,
) {
  await authorizeAnalysis(database.db, op, payload);
  const source = await readSource(
    database,
    config,
    reader,
    op.userId,
    op.contextId!,
    payload.command.taskId!,
  );
  if (analysisHash(source) !== payload.analysisLink!.fingerprint)
    throw new WorkFault("AI_SOURCE_STALE", 409);
}
export async function finishAnalysis(db: Db, payload: TaskPayload) {
  if (!payload.analysisLink) return;
  const [d] = await db
    .select()
    .from(aiDrafts)
    .where(eq(aiDrafts.id, payload.analysisLink.id));
  if (d) await saveSignal(db, d, { labelOwned: payload.analysisLink.desired });
}
export async function syncAnalysisStatus(
  database: Database,
  config: WorkConfig,
  reader: TodoistReader,
) {
  const drafts = await database.db
    .select()
    .from(aiDrafts)
    .where(
      and(
        eq(aiDrafts.kind, "analysis"),
        inArray(aiDrafts.status, [
          "ready",
          "applied",
          "rejected",
          "cancelled",
          "failed",
          "stale",
        ]),
      ),
    )
    .limit(100);
  for (const d of drafts) {
    try {
      await assertDraftScope(database.db, d);
      const state = await decision(database.db, d);
      if (!state.desired && !state.mayRemove) continue;
      const source = await readSource(
        database,
        config,
        reader,
        d.userId,
        d.contextId!,
        d.taskId!,
      );
      if (analysisHash(source) !== d.analysisFingerprint) continue;
      const labels = source.inspection.task.labels;
      if (labels.includes("need_context") === state.desired) continue;
      await database.db.transaction(async (db) => {
        await db.execute(sql.raw("select pg_advisory_xact_lock(1748012)"));
        const scope = await managedScope(db, d.userId, d.contextId!);
        const now = await decision(db, d);
        if (now.desired !== state.desired) return;
        const [old] = await db
          .select()
          .from(planOperations)
          .where(
            and(
              eq(planOperations.userId, d.userId),
              sql.join([
                sql.raw("payload->'analysisLink'->>'id' = "),
                sql.param(d.id),
                sql.raw(" AND payload->'analysisLink'->>'desired' = "),
                sql.param(String(state.desired)),
              ]),
            ),
          )
          .limit(1);
        if (old) return;
        const id = randomUUID();
        const link: AnalysisLink = {
          id: d.id,
          fingerprint: d.analysisFingerprint,
          desired: state.desired,
        };
        const desired = labels.filter((l) => l !== "need_context");
        if (state.desired) desired.push("need_context");
        const command = {
          key: randomUUID(),
          action: "update" as const,
          contextId: d.contextId,
          taskId: d.taskId!,
          basis: source.inspection.basis,
          fields: { labels: desired },
          acknowledgeHierarchy: false,
          acknowledgeDestructive: false,
          acknowledgeRecurrenceChange: false,
        };
        const payload: TaskPayload = {
          analysisLink: link,
          command,
          projectId: scope.c.projectId!,
          contextRevision: scope.c.revision,
          credentialVersion: scope.i.credentialVersion,
          integrationRevision: scope.i.revision,
          source: source.inspection.task,
          children: source.children,
        };
        await db.insert(planOperations).values({
          id,
          userId: d.userId,
          sessionId: "helios-ai-status",
          kind: "task",
          contextId: d.contextId,
          payload: payload as unknown as Record<string, unknown>,
          key: command.key,
          requestHash: fingerprint(payload),
          selectedIds: [d.taskId!],
          expectedRevision: 0,
          status: "queued",
          intentExpiresAt: new Date(Date.now() + 600000),
        });
        await db.insert(planSteps).values({
          id: randomUUID(),
          operationId: id,
          taskId: d.taskId!,
          requestId: randomUUID(),
        });
      });
    } catch {
      /* Scope changes are conservative no-ops; no fallback or external write. */
    }
  }
}
