import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { RoutineCommand } from "@helios/contracts";
import type { Db } from "../planning/store";
import { contexts } from "../work/schema";
import { WorkFault } from "../work/service";
import { routineContexts, type RoutineDay } from "./schema";
import { advanceContext } from "./store";
export async function selectContexts(
  db: Db,
  d: RoutineDay,
  input: RoutineCommand,
) {
  if (
    !input.contextIds ||
    new Set(input.contextIds).size !== input.contextIds.length
  )
    throw new WorkFault("INVALID_REQUEST", 400);
  const all = await db
    .select()
    .from(contexts)
    .where(eq(contexts.userId, d.userId));
  if (input.contextIds.some((id) => !all.some((c) => c.id === id && c.active)))
    throw new WorkFault("CONTEXT_NOT_FOUND", 404);
  await db
    .update(routineContexts)
    .set({ selected: false })
    .where(eq(routineContexts.routineId, d.id));
  for (const [position, id] of input.contextIds.entries()) {
    const [r] = await db
      .select()
      .from(routineContexts)
      .where(
        and(
          eq(routineContexts.routineId, d.id),
          eq(routineContexts.contextId, id),
        ),
      );
    if (r) await advanceContext(db, r, { selected: true, position });
    else
      await db.insert(routineContexts).values({
        id: randomUUID(),
        routineId: d.id,
        contextId: id,
        position,
        steps: {
          review: "open",
          enrichment: "open",
          planning: "open",
        },
      });
  }
}
