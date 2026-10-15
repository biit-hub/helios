import { assertCommandDecision } from "./patches";
import { queueFollowUp } from "./follow-up";
import { readChecklist } from "./checklist";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { entryKey } from "@helios/contracts";
import type { AiDraftView, TaskCommand } from "@helios/contracts";
import { aiDrafts, aiTaskSignals, type AiDraft, type AiSource } from "./schema";
import type { Db } from "../planning/store";
import { WorkFault } from "../work/service";
import { fingerprint } from "../tasks/service";
import { assertDraftScope, clarityHash, draftFingerprint } from "./source";
export type DraftLink = {
  id: string;
  revision: number;
  patchId: string;
  sourceFingerprint: string;
  commandHash: string;
  credentialVersion: string;
  contextRevision: number | null;
};
export const draftConflict = () => new WorkFault("AI_DRAFT_CONFLICT", 409);
export async function ownedDraft(
  db: Db,
  user: string,
  id: string,
  revision?: number,
) {
  const [d] = await db
    .select()
    .from(aiDrafts)
    .where(and(eq(aiDrafts.id, id), eq(aiDrafts.userId, user)));
  if (!d) throw new WorkFault("AI_DRAFT_NOT_FOUND", 404);
  if (revision !== undefined && d.revision !== revision) throw draftConflict();
  return d;
}
export async function signal(db: Db, d: AiDraft) {
  if (!d.contextId || !d.taskId || !d.credentialVersion) return null;
  const [s] = await db
    .select()
    .from(aiTaskSignals)
    .where(
      and(
        eq(aiTaskSignals.contextId, d.contextId),
        eq(aiTaskSignals.taskId, d.taskId),
        eq(aiTaskSignals.credentialVersion, d.credentialVersion),
      ),
    );
  return s ?? null;
}
export async function saveSignal(
  db: Db,
  d: AiDraft,
  patch: Partial<typeof aiTaskSignals.$inferInsert>,
) {
  if (!d.contextId || !d.taskId || !d.credentialVersion) throw draftConflict();
  await db
    .insert(aiTaskSignals)
    .values({
      id: randomUUID(),
      userId: d.userId,
      contextId: d.contextId,
      taskId: d.taskId,
      credentialVersion: d.credentialVersion,
      ...patch,
    })
    .onConflictDoUpdate({
      target: [
        aiTaskSignals.contextId,
        aiTaskSignals.taskId,
        aiTaskSignals.credentialVersion,
      ],
      set: { ...patch, updatedAt: new Date() },
    });
}
export async function changeDraft(
  db: Db,
  d: AiDraft,
  patch: Partial<typeof aiDrafts.$inferInsert>,
) {
  const [next] = await db
    .update(aiDrafts)
    .set({ ...patch, revision: d.revision + 1, updatedAt: new Date() })
    .where(and(eq(aiDrafts.id, d.id), eq(aiDrafts.revision, d.revision)))
    .returning();
  if (!next) throw draftConflict();
  return next;
}
export async function linkDraft(
  db: Db,
  user: string,
  link: DraftLink,
  operationId: string,
  command: TaskCommand,
) {
  const d = await ownedDraft(db, user, link.id, link.revision);
  await assertDraftScope(db, d);
  const p = d.patches.find((x) => x.id === link.patchId);
  if (
    !["ready", "partial"].includes(d.status) ||
    d.operationId ||
    !p?.selected ||
    p.rejected ||
    p.status !== "pending" ||
    d.sourceFingerprint !== link.sourceFingerprint ||
    fingerprint(command) !== link.commandHash ||
    d.credentialVersion !== link.credentialVersion ||
    d.contextRevision !== link.contextRevision
  )
    throw draftConflict();
  assertCommandDecision(d, p, command);
  await changeDraft(db, d, {
    status: "applying",
    operationId,
    patches: d.patches.map((x) =>
      x.id === p.id ? { ...x, operationId, status: "queued" } : x,
    ),
  });
}
export async function finishDraftLink(
  db: Db,
  link: DraftLink,
  operationId: string,
  status: string,
  source: AiSource | null,
  code: string | null,
) {
  const [d] = await db.select().from(aiDrafts).where(eq(aiDrafts.id, link.id));
  if (!d || d.operationId !== operationId) return;
  const success = status === "succeeded";
  const patches = d.patches.map((p) =>
    p.id === link.patchId || (d.kind === "capture" && p.selected && !p.rejected)
      ? { ...p, operationId, status: success ? "verified" : status }
      : p,
  );
  if (success && d.kind === "capture")
    for (const p of patches) if (!p.selected) p.rejected = true;
  const done =
    success && patches.every((p) => p.status === "verified" || p.rejected);
  await changeDraft(db, d, {
    patches,
    code,
    status: done ? "applied" : success ? "ready" : "partial",
    operationId: success ? null : operationId,
    ...(success
      ? {
          source,
          sourceFingerprint: draftFingerprint(d, source),
          ...(d.kind === "capture" && source
            ? { taskId: source.inspection.task.id }
            : {}),
        }
      : {}),
    ...(done ? { finishedAt: new Date() } : {}),
  });
  if (
    success &&
    source &&
    !patches.some((p) => p.selected && !p.rejected && p.status !== "verified")
  )
    await queueFollowUp(db, d, source);
}
export function draftView(d: AiDraft, clear = false): AiDraftView {
  const due = d.source?.inspection.task.due?.date?.slice(0, 10);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: d.timezone,
  }).format(new Date());
  return {
    id: d.id,
    instanceKey: d.source
      ? entryKey({
          taskId: d.source.inspection.task.id,
          source: d.source.inspection.task,
        })
      : null,
    contextId: d.contextId,
    taskId: d.taskId,
    kind: d.kind,
    input: d.input,
    timezone: d.timezone,
    manualFields: d.manualFields,
    revision: d.revision,
    status: d.status,
    code: d.code,
    model: d.model,
    promptVersion: d.promptVersion,
    schemaVersion: d.schemaVersion,
    sourceFingerprint: d.sourceFingerprint,
    patches: d.patches,
    output: d.output,
    staleDate: !!due && due < today,
    confirmedClear: clear,
    checklist: safeChecklist(d),
    createdAt: d.createdAt.toISOString(),
    operationId: d.operationId,
  };
}
export async function confirmedClear(db: Db, d: AiDraft) {
  const s = await signal(db, d);
  return !!d.source && s?.clearFingerprint === clarityHash(d.source);
}

export async function resumeDraftLink(
  db: Db,
  link: DraftLink,
  operationId: string,
) {
  const [d] = await db.select().from(aiDrafts).where(eq(aiDrafts.id, link.id));
  if (!d || d.operationId !== operationId) throw draftConflict();
  await assertDraftScope(db, d);
  await changeDraft(db, d, {
    status: "applying",
    code: null,
    patches: d.patches.map((p) =>
      p.operationId === operationId ? { ...p, status: "queued" } : p,
    ),
  });
}

function safeChecklist(d: AiDraft) {
  try {
    return readChecklist(d.source?.inspection.task.description ?? "").map(
      ({ text, checked }) => ({ text, checked }),
    );
  } catch {
    return [];
  }
}
