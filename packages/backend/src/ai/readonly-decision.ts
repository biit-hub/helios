import { draftRef } from "@helios/contracts";
import { createIdentityService } from "../identity/service";
import type { Database } from "../planning/store";
import type { WorkConfig } from "../work/config";
import { ownedDraft, draftView, changeDraft, draftConflict } from "./store";
import { assertDraftScope } from "./source";
export async function rejectReadonlyDraft(
  database: Database,
  config: WorkConfig,
  h: Headers,
  raw: unknown,
) {
  const input = draftRef.parse(raw);
  return createIdentityService(database, config).withActive(
    h,
    { mutation: true },
    async (db, user) => {
      const d = await ownedDraft(db, user, input.id, input.revision);
      await assertDraftScope(db, d);
      if (
        !["smart", "epic", "decomposition"].includes(d.kind) ||
        d.status !== "ready" ||
        d.operationId ||
        d.patches.length
      )
        throw draftConflict();
      return draftView(
        await changeDraft(db, d, {
          status: "rejected",
          claim: null,
          finishedAt: new Date(),
        }),
      );
    },
  );
}
