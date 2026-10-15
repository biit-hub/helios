import { eq } from "drizzle-orm";
import type { Database } from "../planning/store";
import type { WorkConfig } from "../work/config";
import type { TodoistReader } from "../work/todoist";
import { WorkFault } from "../work/service";
import { aiDrafts } from "./schema";
import {
  assertDraftScope,
  currentSource,
  draftFingerprint,
  readSource,
} from "./source";
import type { DraftLink } from "./store";
export async function validateDraftMutation(
  database: Database,
  config: WorkConfig,
  reader: TodoistReader,
  link: DraftLink,
  operationId: string,
) {
  const [d] = await database.db
    .select()
    .from(aiDrafts)
    .where(eq(aiDrafts.id, link.id));
  if (
    !d ||
    d.operationId !== operationId ||
    d.status !== "applying" ||
    d.sourceFingerprint !== link.sourceFingerprint ||
    !d.patches.some(
      (p) =>
        p.id === link.patchId &&
        p.selected &&
        !p.rejected &&
        p.operationId === operationId,
    )
  )
    throw new WorkFault("AI_DRAFT_CONFLICT", 409);
  await assertDraftScope(database.db, d);
  const source = await currentSource(database, config, reader, d);
  if (draftFingerprint(d, source) !== link.sourceFingerprint)
    throw new WorkFault("AI_SOURCE_STALE", 409);
  return d;
}

export async function appliedDraftSource(
  database: Database,
  config: WorkConfig,
  reader: TodoistReader,
  link: DraftLink,
  createdTaskId?: string,
) {
  const [d] = await database.db
    .select()
    .from(aiDrafts)
    .where(eq(aiDrafts.id, link.id));
  if (!d) throw new WorkFault("AI_DRAFT_NOT_FOUND", 404);
  if (d.kind === "capture" && d.contextId && createdTaskId)
    return readSource(
      database,
      config,
      reader,
      d.userId,
      d.contextId,
      createdTaskId,
    );
  return currentSource(database, config, reader, d);
}
