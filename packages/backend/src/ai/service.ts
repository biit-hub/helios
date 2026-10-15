import { patchCommand, captureFields } from "./patches";
import { aiTimezone, referenceDay } from "./dates";
import { randomUUID } from "node:crypto";
import { and, eq, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  entryKey,
  aiRequest,
  draftEdit,
  draftRef,
  draftApply,
  type TaskCommand,
} from "@helios/contracts";
import { createIdentityService } from "../identity/service";
import { createTaskService, taskScope, fingerprint } from "../tasks/service";
import { createTodoistReader, type TodoistReader } from "../work/todoist";
import { contexts } from "../work/schema";
import { planOperations } from "../planning/schema";
import type { Database } from "../planning/store";
import type { WorkConfig } from "../work/config";
import { WorkFault } from "../work/service";
import { aiConfig, type AiConfig } from "./config";
import { aiDrafts, aiTaskSignals, type AiDraft } from "./schema";
import { PROMPT_VERSION, SCHEMA_VERSION } from "./prompt";
import {
  readSource,
  sourceHash,
  analysisHash,
  clarityHash,
  assertDraftScope,
  projectionScope,
  managedScope,
  captureFingerprint,
} from "./source";
import {
  ownedDraft,
  changeDraft,
  draftView,
  confirmedClear,
  saveSignal,
  draftConflict,
  type DraftLink,
} from "./store";
import { readChecklist } from "./checklist";
export function createAiService(
  database: Database,
  config: WorkConfig,
  reader: TodoistReader = createTodoistReader(fetch, config.TODOIST_ORIGIN),
  model: AiConfig = aiConfig(),
) {
  const identity = createIdentityService(database, config);
  const tasks = createTaskService(database, config, reader);
  async function start(h: Headers, raw: unknown) {
    const input = aiRequest.parse(raw);
    if (input.kind !== "capture" && input.manualFields)
      throw new WorkFault("INVALID_REQUEST");
    const hash = fingerprint(input);
    const base = await identity.withActive(
      h,
      { mutation: true },
      async (db, user, session) => {
        const [old] = await db
          .select()
          .from(aiDrafts)
          .where(and(eq(aiDrafts.userId, user), eq(aiDrafts.key, input.key)));
        if (old) {
          if (old.requestHash !== hash) throw draftConflict();
          return { old, user, session, scope: null };
        }
        const initialScope = input.contextId
          ? await managedScope(db, user, input.contextId)
          : null;
        if (input.kind !== "capture") {
          if (!input.contextId || !input.taskId)
            throw new WorkFault("AI_SCOPE_DENIED", 409);
          await projectionScope(db, user, input.contextId, input.taskId);
        }
        if (
          ["capture", "progress", "clarification"].includes(input.kind) &&
          !input.input.trim()
        )
          throw new WorkFault("INVALID_REQUEST");
        return { user, session, old: null, scope: initialScope };
      },
    );
    if (base.old)
      return draftView(base.old, await confirmedClear(database.db, base.old));
    const source =
      input.taskId && input.contextId
        ? await readSource(
            database,
            config,
            reader,
            base.user,
            input.contextId,
            input.taskId,
          )
        : null;
    if (
      input.expectedInstanceKey &&
      (!source ||
        entryKey({
          taskId: source.inspection.task.id,
          source: source.inspection.task,
        }) !== input.expectedInstanceKey)
    )
      throw new WorkFault("PLAN_INSTANCE_CHANGED", 409);
    if (
      input.kind === "epic" &&
      !source?.inspection.task.labels.includes("epic")
    )
      throw new WorkFault("AI_SCOPE_DENIED", 409);
    if (input.kind === "capture" && input.taskId)
      throw new WorkFault("AI_SCOPE_DENIED", 409);
    return identity.withActive(
      h,
      { mutation: true },
      async (db, user, session) => {
        const scope = input.contextId
          ? await taskScope(db, user, input.contextId)
          : null;
        if (
          base.scope &&
          (scope?.i.credentialVersion !== base.scope.i.credentialVersion ||
            scope.i.revision !== base.scope.i.revision ||
            scope.c?.revision !== base.scope.c.revision)
        )
          throw new WorkFault("AI_SOURCE_STALE", 409);
        const createdAt = new Date();
        const timezone = aiTimezone();
        const intakeHash = captureFingerprint(
          input.input,
          input.manualFields ?? {},
          referenceDay(createdAt, timezone),
          timezone,
        );
        const d = {
          id: randomUUID(),
          userId: user,
          sessionId: session,
          key: input.key,
          requestHash: hash,
          kind: input.kind,
          input: input.input,
          timezone,
          createdAt,
          manualFields: input.manualFields ?? {},
          contextId: input.contextId,
          taskId: input.taskId ?? null,
          model: model.model,
          promptVersion: PROMPT_VERSION,
          schemaVersion: SCHEMA_VERSION,
          source,
          sourceFingerprint:
            input.kind === "capture" ? intakeHash : sourceHash(source),
          analysisFingerprint: source ? analysisHash(source) : intakeHash,
          contextRevision: scope?.c?.revision ?? null,
          credentialVersion: scope?.i.credentialVersion ?? null,
          integrationRevision: scope?.i.revision ?? null,
        };
        const [old] = await db
          .select()
          .from(aiDrafts)
          .where(and(eq(aiDrafts.userId, user), eq(aiDrafts.key, input.key)));
        if (old) {
          if (old.requestHash !== hash) throw draftConflict();
          return draftView(old);
        }
        if (input.kind !== "capture") {
          await assertDraftScope(db, { ...d } as AiDraft);
        }
        const [row] = await db.insert(aiDrafts).values(d).returning();
        return draftView(row!);
      },
    );
  }
  async function list(
    h: Headers,
    filter: { id?: string; contextId?: string; taskId?: string } = {},
  ) {
    return identity.withActive(h, {}, async (db, user) => {
      if (filter.id) z.uuid().parse(filter.id);
      if (filter.contextId) z.uuid().parse(filter.contextId);
      const rows = await db
        .select()
        .from(aiDrafts)
        .where(
          and(
            eq(aiDrafts.userId, user),
            ...(filter.id ? [eq(aiDrafts.id, filter.id)] : []),
            ...(filter.contextId
              ? [eq(aiDrafts.contextId, filter.contextId)]
              : []),
            ...(filter.taskId ? [eq(aiDrafts.taskId, filter.taskId)] : []),
          ),
        )
        .orderBy(desc(aiDrafts.createdAt))
        .limit(30);
      const ids = [
        ...new Set(rows.flatMap((d) => (d.taskId ? [d.taskId] : []))),
      ];
      const signals = ids.length
        ? await db
            .select()
            .from(aiTaskSignals)
            .where(
              and(
                eq(aiTaskSignals.userId, user),
                inArray(aiTaskSignals.taskId, ids),
              ),
            )
        : [];
      return {
        available: model.enabled,
        drafts: rows.map((d) =>
          draftView(
            d,
            !!d.source &&
              signals.some(
                (s) =>
                  s.contextId === d.contextId &&
                  s.taskId === d.taskId &&
                  s.credentialVersion === d.credentialVersion &&
                  s.clearFingerprint === clarityHash(d.source!),
              ),
          ),
        ),
      };
    });
  }
  async function edit(h: Headers, raw: unknown) {
    const input = draftEdit.parse(raw);
    return identity.withActive(h, { mutation: true }, async (db, user) => {
      const d = await ownedDraft(db, user, input.id, input.revision);
      await assertDraftScope(db, d);
      if (!["ready", "partial"].includes(d.status) || d.operationId)
        throw draftConflict();
      if (
        input.patches.length !== d.patches.length ||
        new Set(input.patches.map((p) => p.id)).size !== d.patches.length
      )
        throw draftConflict();
      const patches = d.patches.map((p) => {
        const v = input.patches.find((x) => x.id === p.id);
        if (!v) throw draftConflict();
        if (
          p.status !== "pending" &&
          (v.value !== p.edited ||
            v.selected !== p.selected ||
            v.rejected !== p.rejected)
        )
          throw draftConflict();
        if (v.selected && v.rejected) throw draftConflict();
        const target = v.target === undefined ? p.target : v.target;
        if (p.status !== "pending" && target !== p.target)
          throw draftConflict();
        if (
          p.kind === "check-complete" &&
          p.status === "pending" &&
          !readChecklist(d.source!.inspection.task.description).some(
            (x) => x.text === target && !x.checked,
          )
        )
          throw new WorkFault("AI_PATCH_INVALID", 409);
        if (p.kind !== "check-complete" && target !== null)
          throw new WorkFault("AI_PATCH_INVALID", 409);
        return {
          ...p,
          target,
          edited: v.value,
          selected: v.selected,
          rejected: v.rejected,
        };
      });
      const rejected = patches.length > 0 && patches.every((p) => p.rejected);
      const complete =
        patches.length > 0 &&
        patches.every((p) => p.rejected || p.status === "verified");
      return draftView(
        await changeDraft(db, d, {
          patches,
          ...(complete
            ? {
                status: rejected ? "rejected" : "applied",
                finishedAt: new Date(),
              }
            : {}),
        }),
      );
    });
  }
  async function apply(h: Headers, raw: unknown) {
    const input = draftApply.parse(raw);
    const applyHash = fingerprint(input);
    const d = await identity.withActive(
      h,
      { mutation: true },
      async (db, user) => {
        const [op] = await db
          .select()
          .from(planOperations)
          .where(
            and(
              eq(planOperations.userId, user),
              eq(planOperations.key, input.key),
            ),
          );
        if (op) {
          const link = (
            op.payload as { draftLink?: DraftLink & { applyHash?: string } }
          )?.draftLink;
          if (!link || link.applyHash !== applyHash || link.id !== input.id)
            throw draftConflict();
          return { old: op.id, d: await ownedDraft(db, user, input.id) };
        }
        return {
          old: null,
          d: await ownedDraft(db, user, input.id, input.revision),
        };
      },
    );
    if (d.old) return { operationId: d.old, draft: draftView(d.d) };
    let row = d.d;
    if (!["ready", "partial"].includes(row.status) || row.operationId)
      throw draftConflict();
    const chosen = row.patches.filter(
      (p) => p.selected && !p.rejected && p.status === "pending",
    );
    if (!chosen.length) throw new WorkFault("AI_NO_SELECTION", 409);
    let command: TaskCommand;
    let p = chosen[0]!;
    if (row.kind === "capture") {
      p = chosen.find((x) => x.kind === "title") ?? p;
      const fields = captureFields(row);
      const project = input.confirmProject ? input.projectId : null;
      const bound = await identity.withActive(
        h,
        { mutation: true },
        async (db, user) => {
          const current = await ownedDraft(db, user, row.id, input.revision);
          const [c] = project
            ? await db
                .select()
                .from(contexts)
                .where(
                  and(
                    eq(contexts.userId, user),
                    eq(contexts.projectId, project),
                    eq(contexts.active, true),
                  ),
                )
            : [];
          const scope = await taskScope(db, user, c?.id ?? null);
          return changeDraft(db, current, {
            contextId: c?.id ?? null,
            contextRevision: c?.revision ?? null,
            credentialVersion: scope.i.credentialVersion,
            integrationRevision: scope.i.revision,
          });
        },
      );
      row = bound;
      command = {
        key: input.key,
        action: "create",
        contextId: row.contextId,
        projectId: project,
        fields,
        acknowledgeDestructive: false,
        acknowledgeHierarchy: false,
        acknowledgeRecurrenceChange: false,
      };
    } else {
      if (input.projectId || input.confirmProject)
        throw new WorkFault("AI_PATCH_INVALID", 409);
      const source = await readSource(
        database,
        config,
        reader,
        row.userId,
        row.contextId!,
        row.taskId!,
      );
      if (sourceHash(source) !== row.sourceFingerprint)
        throw new WorkFault("AI_SOURCE_STALE", 409);
      const patch = patchCommand(row, p);
      command = {
        key: input.key,
        action: "update",
        contextId: row.contextId,
        ...(patch.action === "create"
          ? {}
          : { taskId: row.taskId!, basis: source.inspection.basis }),
        acknowledgeDestructive: false,
        acknowledgeHierarchy: false,
        acknowledgeRecurrenceChange: false,
        ...patch,
      };
    }
    const link: DraftLink & { applyHash: string } = {
      id: row.id,
      revision: row.revision,
      patchId: p.id,
      sourceFingerprint: row.sourceFingerprint,
      commandHash: fingerprint(command),
      credentialVersion: row.credentialVersion!,
      contextRevision: row.contextRevision,
      applyHash,
    };
    const result = await tasks.enqueueDraft(h, command, link);
    return {
      ...result,
      draft: draftView(await ownedDraft(database.db, row.userId, row.id)),
    };
  }
  async function simple(action: string, h: Headers, raw: unknown) {
    const input = draftRef.parse(raw);
    const base = await identity.withActive(
      h,
      { mutation: true },
      async (db, user) => ownedDraft(db, user, input.id, input.revision),
    );
    if (action === "clear") {
      if (!base.contextId || !base.taskId) throw draftConflict();
      const source = await readSource(
        database,
        config,
        reader,
        base.userId,
        base.contextId,
        base.taskId,
      );
      if (sourceHash(source) !== base.sourceFingerprint)
        throw new WorkFault("AI_SOURCE_STALE", 409);
      return identity.withActive(h, { mutation: true }, async (db, user) => {
        const d = await ownedDraft(db, user, input.id, input.revision);
        await assertDraftScope(db, d);
        await saveSignal(db, d, { clearFingerprint: clarityHash(source) });
        return draftView(await changeDraft(db, d, {}), true);
      });
    }
    return identity.withActive(
      h,
      { mutation: true },
      async (db, user, session) => {
        const d = await ownedDraft(db, user, input.id, input.revision);
        if (action === "reopen") {
          if (!d.operationId) throw draftConflict();
          await assertDraftScope(db, d);
          const [op] = await db
            .select()
            .from(planOperations)
            .where(
              and(
                eq(planOperations.id, d.operationId),
                eq(planOperations.userId, user),
              ),
            );
          const result = op?.result as {
            pending?: unknown;
            effects?: unknown[];
          } | null;
          if (
            !op ||
            op.status !== "failed" ||
            result?.pending ||
            (result?.effects?.length ?? 0) > 0
          )
            throw new WorkFault("AI_OUTCOME_UNRESOLVED", 409);
          await db
            .update(planOperations)
            .set({
              status: "cancelled",
              code: "DRAFT_SUPERSEDED",
              intentExpiresAt: new Date(0),
            })
            .where(eq(planOperations.id, op.id));
          return draftView(
            await changeDraft(db, d, {
              status: "ready",
              operationId: null,
              code: null,
              patches: d.patches.map((p) =>
                p.operationId === op.id
                  ? { ...p, status: "pending", operationId: null }
                  : p,
              ),
            }),
          );
        }
        if (action === "retry") {
          if (!["failed", "cancelled"].includes(d.status))
            throw draftConflict();
          await assertDraftScope(db, d);
          if (d.output)
            return draftView(
              await changeDraft(db, d, {
                status: "ready",
                code: null,
                claim: null,
                finishedAt: null,
              }),
            );
          return draftView(
            await changeDraft(db, d, {
              status: "queued",
              code: null,
              claim: null,
              jobId: null,
              attempts: 0,
              model: model.model,
              promptVersion: PROMPT_VERSION,
              schemaVersion: SCHEMA_VERSION,
              sessionId: session,
              finishedAt: null,
            }),
          );
        }
        if (
          action === "cancel" &&
          !d.operationId &&
          ["queued", "running", "ready", "failed"].includes(d.status)
        )
          return draftView(
            await changeDraft(db, d, {
              status: "cancelled",
              claim: null,
              finishedAt: new Date(),
            }),
          );
        throw draftConflict();
      },
    );
  }
  return {
    list,
    async handle(action: string, h: Headers, input: unknown) {
      await identity.withActive(h, { mutation: true }, async () => {});
      if (action === "start") return start(h, input);
      if (action === "edit") return edit(h, input);
      if (action === "apply") return apply(h, input);
      if (["retry", "cancel", "clear", "reopen"].includes(action))
        return simple(action, h, input);
      throw new WorkFault("NOT_FOUND", 404);
    },
  };
}
