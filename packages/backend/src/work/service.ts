import { runtimeProblems } from "./runtime-problems";
import { readWaiting } from "../tasks/waiting";
import { randomUUID, createHash } from "node:crypto";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { symmetricEncrypt, symmetricDecrypt } from "better-auth/crypto";
import { contextInput, externalId, problemMessages } from "@helios/contracts";
import type {
  ContextInput,
  ProblemCode,
  WorkSnapshot,
  TaskList,
} from "@helios/contracts";
import type { createDatabase } from "../db";
import { createIdentityService } from "../identity/service";
import { AuthFault } from "../identity/policy";
import type { WorkConfig } from "./config";
import * as s from "./schema";
import { createTodoistReader, TodoistFault } from "./todoist";
import type { TodoistReader } from "./todoist";
type Database = ReturnType<typeof createDatabase>;
type Db = Omit<Database["db"], "$client">;
type Integration = typeof s.integrations.$inferSelect;
type Context = typeof s.contexts.$inferSelect;
export class WorkFault extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
const conflict = () => new WorkFault("REVISION_CONFLICT", 409);
const stale = (date: Date | null) =>
  !date || Date.now() - date.getTime() > 5 * 60000;
async function ensure(db: Db, userId: string) {
  await db
    .insert(s.integrations)
    .values({ id: randomUUID(), userId, credentialVersion: randomUUID() })
    .onConflictDoNothing();
  await db
    .insert(s.contexts)
    .values({
      id: randomUUID(),
      userId,
      kind: "private",
      name: "Privat",
      theme: "copper",
    })
    .onConflictDoNothing();
  const [i] = await db
    .select()
    .from(s.integrations)
    .where(eq(s.integrations.userId, userId));
  if (!i) throw new Error("Missing integration");
  return i;
}
async function owned(db: Db, userId: string, id: string) {
  const [c] = await db
    .select()
    .from(s.contexts)
    .where(and(eq(s.contexts.id, id), eq(s.contexts.userId, userId)));
  if (!c) throw new WorkFault("CONTEXT_NOT_FOUND", 404);
  return c;
}
async function problem(
  db: Db,
  i: Integration,
  code: ProblemCode,
  contextId: string | null = null,
) {
  const key = i.id + ":" + (contextId ?? "global") + ":" + code;
  await db
    .insert(s.integrationProblems)
    .values({
      id: randomUUID(),
      key,
      userId: i.userId,
      integrationId: i.id,
      code,
      contextId,
    })
    .onConflictDoUpdate({
      target: s.integrationProblems.key,
      set: {
        occurrences: sql`${s.integrationProblems.occurrences}+1`,
        revision: sql`${s.integrationProblems.revision}+1`,
        lastSeenAt: new Date(),
        status: sql`CASE WHEN ${s.integrationProblems.status}='resolved' THEN 'open' ELSE ${s.integrationProblems.status} END`,
        resolvedAt: null,
      },
    });
}
async function resolve(
  db: Db,
  i: Integration,
  codes: ProblemCode[],
  contextId: string | null = null,
) {
  for (const code of codes)
    await db
      .update(s.integrationProblems)
      .set({
        status: "resolved",
        resolvedAt: new Date(),
        revision: sql`${s.integrationProblems.revision}+1`,
      })
      .where(
        and(
          eq(
            s.integrationProblems.key,
            i.id + ":" + (contextId ?? "global") + ":" + code,
          ),
          sql`${s.integrationProblems.status} <> 'resolved'`,
        ),
      );
}
const technical: ProblemCode[] = [
  "auth_error",
  "network",
  "timeout",
  "rate_limit",
  "unexpected",
  "sync_failed",
  "not_connected",
  "key_unavailable",
];
export function createWorkService(
  database: Database,
  config: WorkConfig,
  reader: TodoistReader = createTodoistReader(fetch, config.TODOIST_ORIGIN),
) {
  const identity = createIdentityService(database, config);
  const authorized = <T>(
    headers: Headers,
    mutation: boolean,
    stepUp: boolean,
    fn: (db: Db, userId: string) => Promise<T>,
  ) => identity.withActive(headers, { mutation, stepUp }, fn);
  async function token(i: Integration) {
    if (!i.enabled || !i.encryptedToken)
      throw new WorkFault("NOT_CONNECTED", 409);
    if (!config.INTEGRATION_KEY) throw new WorkFault("KEY_UNAVAILABLE", 503);
    try {
      return await symmetricDecrypt({
        key: config.INTEGRATION_KEY,
        data: i.encryptedToken,
      });
    } catch {
      throw new WorkFault("KEY_UNAVAILABLE", 503);
    }
  }
  // Claim before network I/O. The guard/lock is released while waiting for Todoist;
  // authorization and both revisions are checked again before applying a result.
  async function claim(h: Headers, contextId?: string, stepUp = false) {
    return authorized(h, true, stepUp, async (db, userId) => {
      const i = await ensure(db, userId);
      if (!i.enabled || !i.encryptedToken)
        throw new WorkFault("NOT_CONNECTED", 409);
      if (i.nextAllowedAt && i.nextAllowedAt > new Date())
        throw new WorkFault("RETRY_LATER", 429);
      const c = contextId ? await owned(db, userId, contextId) : null;
      if (c && (!c.active || !c.projectId))
        throw new WorkFault("CONTEXT_INCOMPLETE", 409);
      const claim = randomUUID();
      await db
        .update(s.integrations)
        .set({ readClaim: claim, nextAllowedAt: new Date(Date.now() + 60000) })
        .where(eq(s.integrations.id, i.id));
      return { i, c, userId, claim };
    });
  }
  async function finish<T>(
    h: Headers,
    job: { i: Integration; c: Context | null; userId: string; claim: string },
    stepUp: boolean,
    fn: (db: Db, i: Integration) => Promise<T>,
  ) {
    return authorized(h, true, stepUp, async (db, userId) => {
      const i = await ensure(db, userId);
      if (
        userId !== job.userId ||
        i.revision !== job.i.revision ||
        i.credentialVersion !== job.i.credentialVersion ||
        i.readClaim !== job.claim
      )
        throw conflict();
      if (job.c) {
        const c = await owned(db, userId, job.c.id);
        if (
          c.revision !== job.c.revision ||
          !c.active ||
          c.projectId !== job.c.projectId
        )
          throw conflict();
      }
      await db
        .update(s.integrations)
        .set({ readClaim: null, nextAllowedAt: new Date(Date.now() + 15000) })
        .where(eq(s.integrations.id, i.id));
      return fn(db, i);
    });
  }
  async function failed(
    h: Headers,
    job: { i: Integration; c: Context | null; userId: string; claim: string },
    e: unknown,
  ) {
    const f =
      e instanceof TodoistFault
        ? e
        : new TodoistFault(
            e instanceof WorkFault && e.code === "KEY_UNAVAILABLE"
              ? "key_unavailable"
              : "sync_failed",
          );
    await finish(h, job, false, async (db, i) => {
      await problem(db, i, f.code, job.c?.id ?? null);
      if (job.c) {
        await problem(db, i, "sync_failed", job.c.id);
        if (f.code === "project_missing")
          await db
            .update(s.projectCatalog)
            .set({ available: false })
            .where(
              and(
                eq(s.projectCatalog.integrationId, i.id),
                eq(s.projectCatalog.projectId, job.c.projectId!),
              ),
            );
      }
      await db
        .update(s.integrations)
        .set({
          state: f.code,
          lastCheckedAt: new Date(),
          nextAllowedAt: new Date(
            Date.now() + Math.max(15, f.retrySeconds) * 1000,
          ),
        })
        .where(eq(s.integrations.id, i.id));
    });
    throw new WorkFault(
      f.code,
      f.code === "rate_limit" ? 429 : f.code === "key_unavailable" ? 503 : 502,
    );
  }
  async function saveContext(h: Headers, input: ContextInput) {
    const initial = await authorized(h, true, false, async (db, userId) => {
      const i = await ensure(db, userId);
      return { i, c: input.id ? await owned(db, userId, input.id) : null };
    });
    if (initial.c && initial.c.revision !== input.revision) throw conflict();
    if (!initial.c && input.revision !== 0) throw conflict();
    const remap =
      input.projectId !== (initial.c?.projectId ?? null) ||
      !!(input.projectId && input.active && !initial.c?.active);
    let verified: Awaited<ReturnType<TodoistReader["project"]>> | null = null;
    if (remap) {
      await identity.requireActive(h, true);
      if (input.projectId) {
        verified = await reader.project(
          await token(initial.i),
          input.projectId,
        );
        if (
          verified.id !== input.projectId ||
          verified.is_deleted ||
          verified.is_archived ||
          verified.inbox_project
        )
          throw new WorkFault("PROJECT_NOT_ASSIGNABLE", 409);
      }
    }
    return authorized(h, true, remap, async (db, userId) => {
      const i = await ensure(db, userId);
      if (
        i.revision !== initial.i.revision ||
        i.credentialVersion !== initial.i.credentialVersion
      )
        throw conflict();
      const old = input.id ? await owned(db, userId, input.id) : null;
      if (old && old.revision !== input.revision) throw conflict();
      if (old?.kind === "private" && !input.active)
        throw new WorkFault("PRIVATE_REQUIRED");
      if (input.projectId && remap) {
        await validateProjectAssignment(db, userId, i, input, old?.id);
      }
      const id = old?.id ?? randomUUID();
      const values = {
        name: input.name,
        theme: input.theme,
        active: input.active,
        projectId: input.projectId,
        termihubEmployerId: input.termihubEmployerId,
        termihubInstanceRef: input.termihubInstanceRef,
        revision: (old?.revision ?? 0) + 1,
        ...(remap ? { lastSyncAt: null } : {}),
      };
      if (old)
        await db.update(s.contexts).set(values).where(eq(s.contexts.id, id));
      else
        await db
          .insert(s.contexts)
          .values({ ...values, id, userId, kind: "employer" });
      if (remap)
        await db.insert(s.contextProjectHistory).values({
          id: randomUUID(),
          contextId: id,
          previousProjectId: old?.projectId ?? null,
          projectId: input.projectId,
          revision: values.revision,
        });
      if (verified)
        await db
          .update(s.projectCatalog)
          .set({ name: verified.name, retrievedAt: new Date() })
          .where(
            and(
              eq(s.projectCatalog.integrationId, i.id),
              eq(s.projectCatalog.projectId, verified.id),
            ),
          );
      return { id, revision: values.revision };
    });
  }
  async function changeIntegration(action: string, h: Headers, input: unknown) {
    const data = z
      .strictObject({
        revision: z.number().int().nonnegative(),
        ...(action === "token-save"
          ? {
              token: z
                .string()
                .trim()
                .min(1)
                .max(512)
                .regex(/^[!-~]+$/),
            }
          : {}),
      })
      .parse(input) as { revision: number; token?: string };
    return authorized(h, true, true, async (db, userId) => {
      const i = await ensure(db, userId);
      if (i.revision !== data.revision) throw conflict();
      if (action === "token-save" && !config.INTEGRATION_KEY)
        throw new WorkFault("KEY_UNAVAILABLE", 503);
      if (action === "integration-enable" && !i.encryptedToken)
        throw new WorkFault("NOT_CONNECTED", 409);
      const rotated = action === "token-save" || action === "token-remove";
      const credentialVersion = rotated ? randomUUID() : i.credentialVersion;
      const encryptedToken =
        action === "token-save"
          ? await symmetricEncrypt({
              key: config.INTEGRATION_KEY!,
              data: data.token!,
            })
          : action === "token-remove"
            ? null
            : i.encryptedToken;
      await db
        .update(s.integrations)
        .set({
          encryptedToken,
          credentialVersion,
          enabled: action === "token-save" || action === "integration-enable",
          revision: i.revision + 1,
          state:
            action === "token-save" || action === "integration-enable"
              ? "not_tested"
              : "not_connected",
          lastCatalogAt: rotated ? null : i.lastCatalogAt,
          lastCheckedAt: null,
          nextAllowedAt: null,
        })
        .where(eq(s.integrations.id, i.id));
      if (rotated)
        await db
          .update(s.projectCatalog)
          .set({ available: false })
          .where(eq(s.projectCatalog.integrationId, i.id));
      return { ok: true };
    });
  }
  async function refreshCatalog(h: Headers, input: unknown) {
    z.strictObject({}).parse(input);
    const job = await claim(h);
    try {
      const projects = await reader.projects(await token(job.i));
      if (new Set(projects.map((p) => p.id)).size !== projects.length)
        throw new TodoistFault("unexpected");
      return await finish(h, job, false, async (db, i) => {
        const now = new Date();
        await db
          .update(s.projectCatalog)
          .set({ available: false })
          .where(eq(s.projectCatalog.integrationId, i.id));
        for (const p of projects)
          await db
            .insert(s.projectCatalog)
            .values({
              integrationId: i.id,
              projectId: p.id,
              name: p.name,
              inbox: p.inbox_project === true,
              available: !p.is_deleted && !p.is_archived,
              credentialVersion: i.credentialVersion,
              retrievedAt: now,
            })
            .onConflictDoUpdate({
              target: [
                s.projectCatalog.integrationId,
                s.projectCatalog.projectId,
              ],
              set: {
                name: p.name,
                inbox: p.inbox_project === true,
                available: !p.is_deleted && !p.is_archived,
                credentialVersion: i.credentialVersion,
                retrievedAt: now,
              },
            });
        const cs = await db
          .select()
          .from(s.contexts)
          .where(
            and(eq(s.contexts.userId, i.userId), eq(s.contexts.active, true)),
          );
        for (const c of cs) {
          if (c.projectId) {
            const valid = projects.some(
              (p) =>
                p.id === c.projectId &&
                !p.is_deleted &&
                !p.is_archived &&
                !p.inbox_project,
            );
            if (valid)
              await resolve(
                db,
                i,
                ["project_missing", "invalid_mapping"],
                c.id,
              );
            else await problem(db, i, "project_missing", c.id);
          }
        }
        await db
          .update(s.integrations)
          .set({ state: "ready", lastCheckedAt: now, lastCatalogAt: now })
          .where(eq(s.integrations.id, i.id));
        await resolve(db, i, technical);
        return { ok: true, count: projects.length };
      });
    } catch (e) {
      if (
        e instanceof AuthFault ||
        (e instanceof WorkFault && e.code === "REVISION_CONFLICT")
      )
        throw e;
      return failed(h, job, e);
    }
  }
  async function refreshTasks(h: Headers, input: unknown) {
    const { contextId } = z.strictObject({ contextId: z.uuid() }).parse(input);
    const job = await claim(h, contextId);
    try {
      const t = await token(job.i);
      const p = await reader.project(t, job.c!.projectId!);
      if (
        p.id !== job.c!.projectId ||
        p.inbox_project ||
        p.is_deleted ||
        p.is_archived
      )
        throw new TodoistFault("project_missing");
      const tasks = await reader.tasks(t, p.id);
      const sections = await reader.sections(t, p.id);
      if (
        tasks.some((t) => t.project_id !== p.id) ||
        sections.some((t) => t.project_id !== p.id) ||
        new Set(tasks.map((t) => t.id)).size !== tasks.length
      )
        throw new TodoistFault("unexpected");
      return await finish(h, job, false, async (db, i) => {
        const now = new Date();
        await db
          .update(s.taskProjections)
          .set({
            state: "unknown",
            revision: sql`${s.taskProjections.revision}+1`,
          })
          .where(
            and(
              eq(s.taskProjections.integrationId, i.id),
              eq(s.taskProjections.contextId, contextId),
              eq(s.taskProjections.projectId, p.id),
            ),
          );
        for (const task of tasks) {
          const values = {
            contextId,
            projectId: p.id,
            credentialVersion: i.credentialVersion,
            data: task,
            state: task.is_deleted
              ? ("deleted" as const)
              : task.checked
                ? ("completed" as const)
                : ("active" as const),
            sectionName:
              sections.find((s) => s.id === task.section_id)?.name ?? null,
            fingerprint: createHash("sha256")
              .update(JSON.stringify(task))
              .digest("hex"),
            retrievedAt: now,
          };
          await db
            .insert(s.taskProjections)
            .values({ ...values, integrationId: i.id, taskId: task.id })
            .onConflictDoUpdate({
              target: [
                s.taskProjections.integrationId,
                s.taskProjections.taskId,
              ],
              set: {
                ...values,
                revision: sql`${s.taskProjections.revision}+1`,
              },
            });
        }
        await db
          .update(s.contexts)
          .set({ lastSyncAt: now })
          .where(eq(s.contexts.id, contextId));
        await db
          .update(s.integrations)
          .set({ state: "ready", lastCheckedAt: now })
          .where(eq(s.integrations.id, i.id));
        await resolve(
          db,
          i,
          [...technical, "project_missing", "invalid_mapping", "stale_cache"],
          contextId,
        );
        return { ok: true, count: tasks.length };
      });
    } catch (e) {
      if (
        e instanceof AuthFault ||
        (e instanceof WorkFault && e.code === "REVISION_CONFLICT")
      )
        throw e;
      return failed(h, job, e);
    }
  }
  async function readComments(h: Headers, input: unknown) {
    const { contextId, taskId } = z
      .strictObject({ contextId: z.uuid(), taskId: externalId })
      .parse(input);
    const job = await claim(h, contextId);
    try {
      const cached = await authorized(h, true, false, async (db, userId) => {
        await owned(db, userId, contextId);
        const [row] = await db
          .select()
          .from(s.taskProjections)
          .where(
            and(
              eq(s.taskProjections.integrationId, job.i.id),
              eq(s.taskProjections.taskId, taskId),
              eq(s.taskProjections.contextId, contextId),
              eq(s.taskProjections.projectId, job.c!.projectId!),
              eq(s.taskProjections.credentialVersion, job.i.credentialVersion),
            ),
          );
        if (!row) throw new WorkFault("TASK_NOT_FOUND", 404);
        return row;
      });
      const t = await token(job.i);
      const current = await reader.task(t, taskId);
      if (current.project_id !== job.c!.projectId || current.is_deleted) {
        await finish(h, job, false, async (db) => {
          await db
            .update(s.taskProjections)
            .set({ state: "unknown" })
            .where(
              and(
                eq(s.taskProjections.integrationId, cached.integrationId),
                eq(s.taskProjections.taskId, taskId),
              ),
            );
        });
        throw new WorkFault("TASK_NO_LONGER_IN_CONTEXT", 409);
      }
      const comments = await reader.comments(t, taskId);
      return finish(h, job, false, async () => ({ comments }));
    } catch (e) {
      if (e instanceof TodoistFault && e.code === "task_unavailable") {
        await finish(h, job, false, async (db) => {
          await db
            .update(s.taskProjections)
            .set({ state: "unknown" })
            .where(
              and(
                eq(s.taskProjections.integrationId, job.i.id),
                eq(s.taskProjections.contextId, contextId),
                eq(s.taskProjections.taskId, taskId),
              ),
            );
        });
        throw new WorkFault("task_unavailable", 409);
      }
      if (e instanceof AuthFault || e instanceof WorkFault) throw e;
      return failed(h, job, e);
    }
  }
  async function checkProblem(h: Headers, input: unknown) {
    const { id, revision } = z
      .strictObject({
        id: z.uuid(),
        revision: z.number().int().nonnegative(),
      })
      .parse(input);
    return authorized(h, true, false, async (db, userId) => {
      const [p] = await db
        .select()
        .from(s.integrationProblems)
        .where(
          and(
            eq(s.integrationProblems.id, id),
            eq(s.integrationProblems.userId, userId),
          ),
        );
      if (!p) throw new WorkFault("PROBLEM_NOT_FOUND", 404);
      if (p.revision !== revision) throw conflict();
      if (p.status !== "resolved")
        await db
          .update(s.integrationProblems)
          .set({
            status: "checked",
            checkedAt: new Date(),
            revision: p.revision + 1,
          })
          .where(eq(s.integrationProblems.id, id));
      return { ok: true };
    });
  }
  const actionHandlers = new Map<
    string,
    (h: Headers, input: unknown) => Promise<unknown>
  >([
    ["context-save", (h, input) => saveContext(h, contextInput.parse(input))],
    ...[
      "token-save",
      "token-remove",
      "integration-enable",
      "integration-disable",
    ].map(
      (name) =>
        [
          name,
          (h: Headers, input: unknown) => changeIntegration(name, h, input),
        ] as const,
    ),
    ["catalog-refresh", refreshCatalog],
    ["tasks-refresh", refreshTasks],
    ["comments-read", readComments],
    ["problem-check", checkProblem],
  ]);
  return {
    async snapshot(h: Headers): Promise<WorkSnapshot> {
      return authorized(h, false, false, async (db, userId) => {
        const i = await ensure(db, userId);
        const cs = await db
          .select()
          .from(s.contexts)
          .where(eq(s.contexts.userId, userId));
        const ps = await db
          .select()
          .from(s.projectCatalog)
          .where(
            and(
              eq(s.projectCatalog.integrationId, i.id),
              eq(s.projectCatalog.credentialVersion, i.credentialVersion),
            ),
          );
        for (const c of cs) {
          if (c.active && c.projectId && c.lastSyncAt && stale(c.lastSyncAt)) {
            const [prior] = await db
              .select()
              .from(s.integrationProblems)
              .where(
                eq(
                  s.integrationProblems.key,
                  i.id + ":" + c.id + ":stale_cache",
                ),
              );
            if (!prior || prior.status === "resolved")
              await problem(db, i, "stale_cache", c.id);
          }
        }
        await runtimeProblems(db, i);
        const issues = await db
          .select()
          .from(s.integrationProblems)
          .where(eq(s.integrationProblems.userId, userId));
        return {
          contexts: cs.map((c) => ({
            id: c.id,
            name: c.name,
            theme: c.theme,
            active: c.active,
            projectId: c.projectId,
            revision: c.revision,
            termihubEmployerId: c.termihubEmployerId,
            termihubInstanceRef: c.termihubInstanceRef,
            kind: c.kind,
            lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
            configured: !!(
              c.active &&
              c.projectId &&
              i.enabled &&
              i.encryptedToken &&
              ps.some(
                (p) => p.projectId === c.projectId && p.available && !p.inbox,
              )
            ),
          })),
          integration: {
            revision: i.revision,
            enabled: i.enabled,
            hasToken: !!i.encryptedToken,
            keyAvailable: !!config.INTEGRATION_KEY,
            state: i.state,
            lastCheckedAt: i.lastCheckedAt?.toISOString() ?? null,
            lastCatalogAt: i.lastCatalogAt?.toISOString() ?? null,
            nextAllowedAt: i.nextAllowedAt?.toISOString() ?? null,
          },
          projects: ps.map((p) => ({
            id: p.projectId,
            name: p.name,
            inbox: p.inbox,
            available: p.available,
            assignedTo:
              cs.find((c) => c.active && c.projectId === p.projectId)?.id ??
              null,
          })),
          problems: issues.map((p) => ({
            id: p.id,
            code: p.code as ProblemCode,
            contextId: p.contextId,
            status: p.status,
            occurrences: p.occurrences,
            lastSeenAt: p.lastSeenAt.toISOString(),
            revision: p.revision,
          })),
        };
      });
    },
    async tasks(h: Headers, contextId: string): Promise<TaskList> {
      return authorized(h, false, false, async (db, userId) => {
        const i = await ensure(db, userId);
        const c = await owned(db, userId, contextId);
        const [project] = c.projectId
          ? await db
              .select()
              .from(s.projectCatalog)
              .where(
                and(
                  eq(s.projectCatalog.integrationId, i.id),
                  eq(s.projectCatalog.projectId, c.projectId),
                  eq(s.projectCatalog.credentialVersion, i.credentialVersion),
                  eq(s.projectCatalog.available, true),
                  eq(s.projectCatalog.inbox, false),
                ),
              )
          : [];
        const configured = !!(c.active && c.projectId && project);
        const rows =
          configured && i.enabled && i.encryptedToken
            ? await db
                .select()
                .from(s.taskProjections)
                .where(
                  and(
                    eq(s.taskProjections.integrationId, i.id),
                    eq(s.taskProjections.contextId, c.id),
                    eq(s.taskProjections.projectId, c.projectId!),
                    eq(
                      s.taskProjections.credentialVersion,
                      i.credentialVersion,
                    ),
                  ),
                )
            : [];
        return {
          tasks: rows.map((t) => ({
            data: t.data,
            waiting: (() => {
              try {
                return readWaiting(t.data.description);
              } catch {
                return null;
              }
            })(),
            state: t.state,
            sectionName: t.sectionName,
            retrievedAt: t.retrievedAt.toISOString(),
          })),
          lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
          stale: stale(c.lastSyncAt) || i.state !== "ready",
          configured,
          connected: !!(i.enabled && i.encryptedToken),
        };
      });
    },
    async handle(action: string, h: Headers, input: unknown) {
      await authorized(h, true, false, async () => {});
      const handler = actionHandlers.get(action);
      if (!handler) throw new WorkFault("NOT_FOUND", 404);
      return handler(h, input);
    },
  };
}
const workErrorMessages: Record<string, string> = {
  AI_SOURCE_TOO_LARGE:
    "Die KI-Quelle ist zu umfangreich. Ziele und Checklisten bleiben manuell bearbeitbar; bitte die Aufgabe oder einen kleineren Teilbaum gezielt prüfen.",
  MARKDOWN_AMBIGUOUS:
    "Der Ziel- oder Linkabschnitt ist mehrdeutig. Bitte die ursprüngliche Beschreibung prüfen.",
  DOCUMENT_LINK_INVALID:
    "Bitte einen sicheren HTTP-, HTTPS- oder Obsidian-Link ohne eingebettete Zugangsdaten angeben.",
  EPIC_RECURRENCE_UNSAFE:
    "Ein wiederholendes Epic würde als neue Instanz offen bleiben. Wiederholung zuerst bewusst ändern oder entfernen.",
  EPIC_HIERARCHY_LIMIT:
    "Das Epic enthält zu viele offene Kinder für diesen sicheren Einzeldurchlauf. Bitte zuerst Teilbäume prüfen.",
  AI_OUTCOME_UNRESOLVED:
    "Die externe Wirkung ist nicht eindeutig ausgeschlossen. Zuerst dieselbe Operation prüfen; unbekannte Writes werden nicht neu erzeugt.",
  AI_PROFILE_CHANGED:
    "Modell oder Prompt wurden geändert. Quelle prüfen und KI bewusst erneut versuchen; Originaltext bleibt erhalten.",
  AI_LOCAL_MODEL_REQUIRED:
    "Ollama meldet kein nachgewiesenes lokales Textmodell. Cloud- und Remote-Modelle werden abgewiesen.",
  AI_UNAVAILABLE:
    "Die lokale KI ist nicht erreichbar oder nicht konfiguriert. Formular und gespeicherte Pläne bleiben nutzbar.",
  AI_MODEL_MISSING:
    "Das konfigurierte lokale Modell ist nicht installiert. Es wird nichts automatisch heruntergeladen.",
  AI_TIMEOUT:
    "Die lokale KI hat nicht rechtzeitig geantwortet. Originaleingabe bleibt erhalten.",
  AI_INVALID_OUTPUT:
    "Die KI-Antwort war nicht gültig. Es wurde nichts gespeichert.",
  AI_PATCH_INVALID:
    "Die KI hat einen nicht belegten oder unzulässigen Vorschlag geliefert. Es wurde nichts angewandt.",
  AI_SOURCE_STALE:
    "Die Quelle wurde verändert. Entwurf und Eingaben bleiben erhalten; Quelle neu prüfen.",
  AI_SCOPE_DENIED:
    "Diese Aufgabe darf in diesem Kontext nicht durch KI analysiert werden.",
  AI_DRAFT_CONFLICT:
    "Der Entwurf wurde zwischenzeitlich geändert. Aktuellen Stand laden.",
  AI_NO_SELECTION:
    "Bitte mindestens einen offenen Vorschlag bewusst auswählen.",
  AI_TITLE_REQUIRED:
    "Für die Erfassung muss der Titel bewusst ausgewählt sein.",
  CHECKLIST_AMBIGUOUS:
    "Die Checklistenstruktur ist mehrdeutig. Bestehende Beschreibung zuerst prüfen.",

  ...problemMessages,
  RECURRENCE_CONFIRMATION_REQUIRED:
    "Die Datumsänderung würde die Wiederholung entfernen. Dies ausdrücklich bestätigen oder einen vollständigen neuen Wiederholungstext verwenden.",
  TASK_SOURCE_CONFLICT:
    "Todoist wurde zwischenzeitlich geändert. Eingaben erhalten und die aktuelle Quelle prüfen.",
  TASK_SCOPE_CONFLICT:
    "Kontext oder Projekt passen nicht mehr zur bestätigten Quelle.",
  HIERARCHY_CONFIRMATION_REQUIRED:
    "Die angezeigte Auswirkung auf Eltern und Kinder ausdrücklich bestätigen.",
  CONFIRMATION_REQUIRED:
    "Abschluss oder endgültige Löschung ausdrücklich bestätigen.",
  FUN_EPIC_CONFLICT:
    "Die fun-Kategorie würde innerhalb dieses Epics uneinheitlich. Die Kategorie zuerst für das gesamte Epic bewusst konsistent in Todoist bearbeiten.",
  FUN_PRIVATE_ONLY:
    "Das Label fun ist ausschliesslich für private Aufgaben vorgesehen.",
  EPIC_CHILDREN_POLICY:
    "Vor dem Epic-Abschluss alle offenen Teilbäume ausdrücklich zum Trennen bestätigen oder abbrechen.",
  WAITING_AMBIGUOUS:
    "Der Wartedetails-Abschnitt ist mehrdeutig oder enthält unbekannten Inhalt. Bitte zuerst direkt in Todoist prüfen.",

  PROGRESS_DRAFT_REQUIRED:
    "Den Teilfortschritt zuerst im gemeinsamen Fortschrittsdialog dokumentieren. Die Originaleingabe bleibt im Entwurf erhalten.",
  ROUTINE_CONFLICT:
    "Der gespeicherte Routinenstand wurde zwischenzeitlich geändert. Eingaben erhalten, Stand neu laden und bewusst erneut auswählen.",
  ROUTINE_DAY_CHANGED:
    "Der lokale Kalendertag hat gewechselt. Den heutigen Routinenstand laden; der bisherige Tag bleibt erhalten.",
  REVIEW_STILL_OPEN:
    "Es fehlen noch ausdrückliche Rückmeldungen. Du kannst den Rückblick auch überspringen und offen lassen.",
  REVIEW_INSTANCE_CONFLICT:
    "Die historische Taskinstanz passt nicht mehr zur gewählten Rückmeldung. Quelle und gespeicherten Stand erneut prüfen.",
  REVIEW_SOURCE_UNKNOWN:
    "Der historische oder externe Zustand ist ungeklärt. Der Rückblick bleibt erhalten und wiederaufnehmbar.",
  REVIEW_OUTCOME_UNRESOLVED:
    "Für diese Rückmeldung läuft bereits eine Operation oder ein Abschluss ist nachgewiesen. Den Einzelergebnisstand prüfen.",
  PLAN_NOT_CONFIRMED:
    "Der heutige Kontextplan ist noch nicht vollständig bestätigt. Du kannst die Planung offen lassen.",
  INBOX_UNAVAILABLE:
    "Der native Todoist-Eingang ist momentan nicht zugänglich. Andere Routinenabschnitte bleiben nutzbar.",
  PLAN_TASK_UNAVAILABLE:
    "Diese Aufgabe ist aktuell nicht für den Tagesplan geeignet. Aufgabenstand und Kontext prüfen.",
  PLAN_INSTANCE_CHANGED:
    "Die angezeigte Wiederholungsinstanz hat sich geändert. Aktuelle Aufgabe laden und bewusst erneut auswählen.",
  PLAN_DUPLICATE:
    "Diese Taskinstanz ist bereits im Tagesplan enthalten oder für heute abgeschlossen.",
  FOCUS_TRANSFER_REQUIRED:
    "Wähle zuerst bewusst eine andere Hauptaufgabe als Fokus, bevor du die Fokuskarte in die Reserve verschiebst.",
  PLAN_LIMIT:
    "Die technische Grenze dieses Tagesplans ist erreicht. Die bestehende Auswahl bleibt erhalten.",
  PLAN_CONFLICT:
    "Der Plan oder seine Todoist-Quelle wurde geändert. Bitte neu laden und den Konflikt prüfen.",
  PLAN_LOCKED:
    "Dieser Plan wurde bereits zur Bestätigung übergeben. Er wird nicht automatisch ersetzt.",
  PLAN_DAY_CHANGED:
    "Der lokale Kalendertag hat gewechselt. Bitte den aktuellen Tag laden.",
  SOURCE_STALE:
    "Bitte zuerst die Aufgaben des gewählten Kontexts aktualisieren.",
  REVISION_CONFLICT:
    "Die Daten wurden zwischenzeitlich geändert. Neu laden und erneut prüfen.",
  PROJECT_ALREADY_ASSIGNED:
    "Dieses Projekt ist bereits einem aktiven Kontext zugeordnet.",
  RETRY_LATER: "Bitte die Abrufpause abwarten.",
  KEY_UNAVAILABLE:
    "Der Integrationsschlüssel ist nicht verfügbar. Lokale Konfiguration prüfen.",
};
function errorResponse(
  status: number,
  code: string,
  message = "Die Anfrage konnte nicht bestätigt werden.",
) {
  return { status, body: { error: { code, message } } };
}
export function publicWorkError(e: unknown) {
  if (e instanceof TodoistFault)
    return errorResponse(
      e.code === "rate_limit" ? 429 : 502,
      e.code,
      problemMessages[e.code],
    );
  if (e instanceof AuthFault) {
    const message =
      e.code === "STEP_UP_REQUIRED"
        ? "Bitte zuerst Passwort und neuen Authenticator-Code bestätigen."
        : undefined;
    return errorResponse(e.status, e.code, message);
  }
  if (e instanceof z.ZodError)
    return errorResponse(400, "INVALID_REQUEST", "Bitte die Eingaben prüfen.");
  if (e instanceof WorkFault)
    return errorResponse(e.status, e.code, workErrorMessages[e.code]);
  return errorResponse(
    503,
    "SERVICE_UNAVAILABLE",
    "Der Dienst ist momentan nicht verfügbar.",
  );
}

async function validateProjectAssignment(
  db: Db,
  userId: string,
  i: Integration,
  input: ContextInput,
  contextId: string | undefined,
) {
  if (!input.projectId) return;
  const [p] = await db
    .select()
    .from(s.projectCatalog)
    .where(
      and(
        eq(s.projectCatalog.integrationId, i.id),
        eq(s.projectCatalog.projectId, input.projectId),
        eq(s.projectCatalog.credentialVersion, i.credentialVersion),
        eq(s.projectCatalog.available, true),
        eq(s.projectCatalog.inbox, false),
      ),
    );
  if (!p || !i.enabled || !i.encryptedToken)
    throw new WorkFault("PROJECT_NOT_ASSIGNABLE", 409);
  const duplicate = await db
    .select()
    .from(s.contexts)
    .where(
      and(
        eq(s.contexts.userId, userId),
        eq(s.contexts.projectId, input.projectId),
        eq(s.contexts.active, true),
      ),
    );
  if (input.active && duplicate.some((c) => c.id !== contextId))
    throw new WorkFault("PROJECT_ALREADY_ASSIGNED", 409);
}
