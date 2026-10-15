import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "../planning/store";
import { fingerprint } from "../tasks/service";
import { aiDrafts, type AiDraft, type AiSource } from "./schema";
import { analysisHash, sourceHash, assertDraftScope } from "./source";
import { PROMPT_VERSION, SCHEMA_VERSION } from "./prompt";
export async function queueFollowUp(db: Db, d: AiDraft, source: AiSource) {
  if (!d.contextId || !d.credentialVersion) return;
  await assertDraftScope(db, d);
  const taskId = source.inspection.task.id,
    hash = analysisHash(source);
  const [old] = await db
    .select({ id: aiDrafts.id })
    .from(aiDrafts)
    .where(
      and(
        eq(aiDrafts.contextId, d.contextId),
        eq(aiDrafts.taskId, taskId),
        eq(aiDrafts.analysisFingerprint, hash),
        eq(aiDrafts.kind, "analysis"),
      ),
    )
    .limit(1);
  if (old) return;
  await db.insert(aiDrafts).values({
    id: randomUUID(),
    userId: d.userId,
    contextId: d.contextId,
    taskId,
    key: randomUUID(),
    requestHash: fingerprint({ hash, kind: "analysis" }),
    kind: "analysis",
    input: "",
    timezone: d.timezone,
    model: d.model,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    source,
    sourceFingerprint: sourceHash(source),
    analysisFingerprint: hash,
    contextRevision: d.contextRevision,
    credentialVersion: d.credentialVersion,
    integrationRevision: d.integrationRevision,
  });
}
