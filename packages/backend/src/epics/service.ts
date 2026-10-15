import { aiConfig, type AiConfig } from "../ai/config";
import { markdownView, cacheView } from "./view";
import { and, eq, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { documentChange, type EpicDetail } from "@helios/contracts";
import { createIdentityService } from "../identity/service";
import { createTaskService, taskScope, tokenFor } from "../tasks/service";
import { patchDocument, readGoal } from "../tasks/document";
import { managedScope, readSource } from "../ai/source";
import { aiDrafts, aiTaskSignals } from "../ai/schema";
import { taskProjections } from "../work/schema";
import { WorkFault } from "../work/service";
import { createTodoistReader, type TodoistReader } from "../work/todoist";
import type { WorkConfig } from "../work/config";
import type { Database } from "../planning/store";
import { fingerprint } from "../tasks/hash";
import { knownHierarchy } from "./hierarchy";
const ref = z.strictObject({
  contextId: z.uuid(),
  taskId: z.string().min(1).max(200),
});
const previewInput = ref.extend({ change: documentChange });
const correctionInput = ref.extend({
  basis: z.string().length(64),
  revision: z.number().int().nonnegative(),
  value: z.string().max(4000),
});
export function createEpicService(
  database: Database,
  config: WorkConfig,
  reader: TodoistReader = createTodoistReader(fetch, config.TODOIST_ORIGIN),
  profile: AiConfig = aiConfig(),
) {
  const identity = createIdentityService(database, config),
    tasks = createTaskService(database, config, reader);
  async function scoped(h: Headers, contextId: string) {
    return identity.withActive(h, {}, async (db, user) => ({
      scope: await managedScope(db, user, contextId),
      user,
    }));
  }
  async function detail(
    h: Headers,
    contextId: string,
    taskId: string,
  ): Promise<EpicDetail> {
    ref.parse({ contextId, taskId });
    const base = await scoped(h, contextId),
      inspection = await tasks.inspect(h, contextId, taskId);
    const token = await tokenFor(base.scope.i, config);
    const hierarchy = await knownHierarchy(
      database,
      reader,
      token,
      {
        contextId,
        credentialVersion: base.scope.i.credentialVersion,
        projectId: base.scope.c.projectId!,
      },
      await reader.tasks(token, base.scope.c.projectId!),
      taskId,
    );
    let source: Awaited<ReturnType<typeof readSource>> | null = null;
    if (
      !inspection.task.checked &&
      !inspection.task.is_deleted &&
      inspection.task.labels.includes("epic")
    ) {
      try {
        source = await readSource(
          database,
          config,
          reader,
          base.user,
          contextId,
          taskId,
        );
      } catch (e) {
        if (!(e instanceof WorkFault && e.code === "AI_SOURCE_TOO_LARGE"))
          throw e;
      }
    }
    if (
      source &&
      fingerprint(source.inspection.task) !== fingerprint(inspection.task)
    )
      throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
    return identity.withActive(h, {}, async (db, user) => {
      const now = await managedScope(db, user, contextId);
      if (
        now.c.revision !== base.scope.c.revision ||
        now.i.credentialVersion !== base.scope.i.credentialVersion ||
        now.i.revision !== base.scope.i.revision
      )
        throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
      const [signal] = await db
        .select()
        .from(aiTaskSignals)
        .where(
          and(
            eq(aiTaskSignals.contextId, contextId),
            eq(aiTaskSignals.taskId, taskId),
            eq(aiTaskSignals.credentialVersion, now.i.credentialVersion),
          ),
        );
      const drafts = await db
        .select()
        .from(aiDrafts)
        .where(
          and(
            eq(aiDrafts.userId, user),
            eq(aiDrafts.contextId, contextId),
            eq(aiDrafts.taskId, taskId),
            eq(aiDrafts.kind, "epic"),
            eq(aiDrafts.credentialVersion, now.i.credentialVersion),
          ),
        )
        .orderBy(desc(aiDrafts.createdAt))
        .limit(20);
      const cache = drafts.find(
        (d) =>
          d.output?.understanding &&
          !["rejected", "cancelled"].includes(d.status),
      );
      return {
        inspection,
        ...markdownView(inspection.task.description),
        ...hierarchy,
        correction: signal?.epicCorrection ?? "",
        correctionRevision: signal?.correctionRevision ?? 0,
        cache: cacheView(
          cache,
          source,
          signal?.epicCorrection ?? "",
          profile.model,
        ),
      };
    });
  }
  async function list(h: Headers, contextId: string) {
    z.uuid().parse(contextId);
    return identity.withActive(h, {}, async (db, user) => {
      const s = await managedScope(db, user, contextId);
      const rows = await db
        .select()
        .from(taskProjections)
        .where(
          and(
            eq(taskProjections.contextId, contextId),
            eq(taskProjections.projectId, s.c.projectId!),
            eq(taskProjections.credentialVersion, s.i.credentialVersion),
          ),
        );
      return rows
        .filter((row) => row.data.labels.includes("epic"))
        .map((row) => {
          let goal = "",
            goalConflict = false;
          try {
            goal = readGoal(row.data.description);
          } catch {
            goalConflict = true;
          }
          return {
            task: row.data,
            state: row.state,
            retrievedAt: row.retrievedAt.toISOString(),
            goal,
            goalConflict,
          };
        });
    });
  }
  async function handle(action: string, h: Headers, raw: unknown) {
    await identity.withActive(h, { mutation: true }, async () => {});
    if (action === "preview") {
      const v = previewInput.parse(raw);
      await scoped(h, v.contextId);
      const i = await tasks.inspect(h, v.contextId, v.taskId);
      if (i.task.checked) throw new WorkFault("TASK_ALREADY_CLOSED", 409);
      return {
        before: i.task.description,
        after: patchDocument(i.task.description, v.change),
        basis: i.basis,
        change: v.change,
      };
    }
    if (action === "correct") {
      const v = correctionInput.parse(raw),
        base = await scoped(h, v.contextId),
        i = await tasks.inspect(h, v.contextId, v.taskId);
      if (i.basis !== v.basis || !i.task.labels.includes("epic"))
        throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
      return identity.withActive(h, { mutation: true }, async (db, user) => {
        const now = await taskScope(db, user, v.contextId);
        if (
          now.i.credentialVersion !== base.scope.i.credentialVersion ||
          now.c?.revision !== base.scope.c.revision ||
          now.i.revision !== base.scope.i.revision
        )
          throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
        const where = and(
          eq(aiTaskSignals.contextId, v.contextId),
          eq(aiTaskSignals.taskId, v.taskId),
          eq(aiTaskSignals.credentialVersion, now.i.credentialVersion),
        );
        const [old] = await db.select().from(aiTaskSignals).where(where);
        if ((old?.correctionRevision ?? 0) !== v.revision)
          throw new WorkFault("REVISION_CONFLICT", 409);
        if (old)
          await db
            .update(aiTaskSignals)
            .set({
              epicCorrection: v.value,
              correctionRevision: v.revision + 1,
              updatedAt: new Date(),
            })
            .where(where);
        else
          await db.insert(aiTaskSignals).values({
            id: randomUUID(),
            userId: user,
            contextId: v.contextId,
            taskId: v.taskId,
            credentialVersion: now.i.credentialVersion,
            epicCorrection: v.value,
            correctionRevision: 1,
          });
        return { revision: v.revision + 1 };
      });
    }
    throw new WorkFault("NOT_FOUND", 404);
  }
  return { list, detail, handle };
}
