import { and, eq } from "drizzle-orm";
import {
  agendaCommand,
  agendaState,
  agendaEntries,
  entryKey,
  type AgendaCommand,
  type PlanEntry,
} from "@helios/contracts";
import { createIdentityService } from "../identity/service";
import type { WorkConfig } from "../work/config";
import { createTaskService, fingerprint, tokenFor } from "../tasks/service";
import { createTodoistReader, type TodoistReader } from "../work/todoist";
import { WorkFault } from "../work/service";
import { planOperations } from "./schema";
import { localDay } from "./selection";
import * as store from "./store";
import {
  assertOrder,
  transferEntry,
  recordAgenda,
  previousAgenda,
  type PlanLink,
} from "./agenda-store";
import { eligibleEntries } from "./agenda-source";
import { taskProjections } from "../work/schema";
import { candidates } from "./selection";
export const agendaActions = new Set([
  "reorder",
  "transfer",
  "reserve-skip",
  "reserve-pause",
  "agenda-focus",
  "admit",
  "reserve-close",
]);
export function createAgendaService(
  database: store.Database,
  config: WorkConfig,
  timezone: string,
  reader: TodoistReader = createTodoistReader(fetch, config.TODOIST_ORIGIN),
) {
  const identity = createIdentityService(database, config);
  const tasks = createTaskService(database, config, reader);
  async function base(db: store.Db, user: string, data: AgendaCommand) {
    const c = await store.scope(db, user, data.contextId);
    const i = await store.connected(db, user, c);
    const p = await store.planFor(db, c.id, data.day);
    if (
      !p ||
      p.status !== "confirmed" ||
      p.projectId !== c.projectId ||
      p.credentialVersion !== i.credentialVersion
    )
      throw store.conflict();
    return { p, c, i };
  }
  async function local(
    action: string,
    h: Headers,
    data: AgendaCommand,
    hash: string,
  ) {
    return identity.withActive(h, { mutation: true }, async (db, user) => {
      const { p, c, i } = await base(db, user, data);
      if (await previousAgenda(db, p.id, data.key, hash)) return store.view(p);
      store.expected(p, data.revision);
      const state = structuredClone(agendaState(p));
      let focus = p.focusTaskId;
      if (action === "reorder") {
        if (!data.area || !data.order) throw new WorkFault("INVALID_REQUEST");
        assertOrder(state[data.area], data.order);
        state[data.area] = data.order;
      } else if (action === "transfer") {
        if (!data.area || !data.entryKey)
          throw new WorkFault("INVALID_REQUEST");
        const moving = agendaEntries(p, "main").find(
          (e) => entryKey(e) === data.entryKey,
        );
        if (
          data.area === "reserve" &&
          state.main.length > 1 &&
          moving?.taskId === focus
        )
          throw new WorkFault("FOCUS_TRANSFER_REQUIRED", 409);
        transferEntry(state, data.entryKey, data.area);
        const main = [...p.entries, ...state.extra].filter((e) =>
          state.main.includes(entryKey(e)),
        );
        if (!main.length) focus = null;
        else if (!focus) focus = main[0]!.taskId;
      } else if (action === "reserve-skip") {
        if (
          !state.reserve.length ||
          state.paused ||
          !state.reserve.includes(data.entryKey ?? "")
        )
          throw store.conflict();
        const rows = await db
          .select()
          .from(taskProjections)
          .where(
            and(
              eq(taskProjections.contextId, c.id),
              eq(taskProjections.credentialVersion, i.credentialVersion),
              eq(taskProjections.integrationId, i.id),
            ),
          );
        const executable = new Set(
          candidates(
            rows.map((row) => ({
              data: row.data,
              state: row.state,
              sectionName: row.sectionName,
              retrievedAt: row.retrievedAt.toISOString(),
            })),
            p.projectId,
            p.day,
            c.kind,
            Number.MAX_SAFE_INTEGER,
          ).map((entry) => entryKey(entry)),
        );
        if (state.reserve.find((key) => executable.has(key)) !== data.entryKey)
          throw store.conflict();
        if (state.reserve.filter((key) => executable.has(key)).length <= 1)
          state.paused = true;
        else
          state.reserve = [
            ...state.reserve.filter((key) => key !== data.entryKey),
            data.entryKey!,
          ];
      } else if (action === "reserve-pause") {
        if (data.paused === undefined) throw new WorkFault("INVALID_REQUEST");
        state.paused = data.paused;
      } else if (action === "agenda-focus") {
        const target = agendaEntries(p, "main").find(
          (e) =>
            e.taskId === data.taskId &&
            (!data.entryKey || entryKey(e) === data.entryKey),
        );
        if (!target) throw store.conflict();
        const rows = await db
          .select()
          .from(taskProjections)
          .where(
            and(
              eq(taskProjections.contextId, c.id),
              eq(taskProjections.credentialVersion, i.credentialVersion),
              eq(taskProjections.integrationId, i.id),
            ),
          );
        const eligible = candidates(
          rows.map((row) => ({
            data: row.data,
            state: row.state,
            sectionName: row.sectionName,
            retrievedAt: row.retrievedAt.toISOString(),
          })),
          p.projectId,
          p.day,
          c.kind,
          Number.MAX_SAFE_INTEGER,
        );
        if (!eligible.some((e) => entryKey(e) === entryKey(target)))
          throw new WorkFault("PLAN_TASK_UNAVAILABLE", 409);
        focus = target.taskId;
      }
      const next = await store.change(db, p, {
        agenda: state,
        focusTaskId: focus,
      });
      await recordAgenda(
        db,
        next,
        action,
        data.key,
        hash,
        {
          sourceRevision: data.revision,
          reason: data.reason ?? null,
          area: data.area ?? null,
          order: data.order ?? null,
        },
        data.taskId ?? null,
      );
      return store.view(next);
    });
  }
  async function external(
    action: string,
    h: Headers,
    data: AgendaCommand,
    hash: string,
  ) {
    const snapshot = await identity.withActive(
      h,
      { mutation: true },
      async (db, user) => {
        const old = await db
          .select()
          .from(planOperations)
          .where(
            and(
              eq(planOperations.userId, user),
              eq(planOperations.key, data.key),
            ),
          );
        if (old[0]) {
          const link = (old[0].payload as { planLink?: PlanLink } | null)
            ?.planLink;
          if (link?.requestHash !== hash) throw store.conflict();
          return { old: old[0].id };
        }
        const s = await base(db, user, data);
        store.expected(s.p, data.revision);
        return s;
      },
    );
    if ("old" in snapshot) return { operationId: snapshot.old };
    const { p, c, i } = snapshot;
    const inspection = await tasks.inspect(h, c.id, data.taskId ?? "");
    const key = entryKey({
      taskId: inspection.task.id,
      source: inspection.task,
    } as PlanEntry);
    let entry: PlanEntry;
    let command: Record<string, unknown>;
    if (action === "admit") {
      if (data.entryKey !== key)
        throw new WorkFault("PLAN_INSTANCE_CHANGED", 409);
      const token = await tokenFor(i, config);
      const eligible = await eligibleEntries(
        reader,
        token,
        p.projectId,
        p.day,
        c.kind,
      );
      const found = eligible.find(
        (e) => e.taskId === data.taskId && entryKey(e) === key,
      );
      if (!found) throw new WorkFault("PLAN_TASK_UNAVAILABLE", 409);
      entry = found;
      const workSections = inspection.sections.filter(
        (s) => s.name === "In Arbeit",
      );
      const localOnly =
        !!inspection.task.parent_id || inspection.children.length > 0;
      if (!localOnly && workSections.length !== 1)
        throw new WorkFault(
          workSections.length ? "SECTION_AMBIGUOUS" : "SECTION_MISSING",
          409,
        );
      const already = inspection.task.section_id === workSections[0]?.id;
      command = {
        action: localOnly || already ? "plan-select" : "move",
        ...(localOnly || already ? {} : { sectionId: workSections[0]!.id }),
      };
    } else {
      const found = agendaEntries(p, "reserve").find(
        (e) => entryKey(e) === data.entryKey,
      );
      if (!found || entryKey(found) !== key || found.taskId !== data.taskId)
        throw new WorkFault("PLAN_INSTANCE_CHANGED", 409);
      entry = found;
      if (data.basis !== inspection.basis)
        throw new WorkFault("TASK_SOURCE_CONFLICT", 409);
      command = {
        action: "close",
        acknowledgeHierarchy: data.acknowledgeHierarchy,
        acknowledgeDestructive: data.acknowledgeDestructive,
      };
    }
    const link: PlanLink = {
      planId: p.id,
      revision: p.revision,
      action: action === "admit" ? "add" : "close",
      entry,
      area: action === "admit" ? (data.area ?? "main") : "reserve",
      day: p.day,
      contextId: c.id,
      requestHash: hash,
      credentialVersion: i.credentialVersion,
      contextRevision: c.revision,
    };
    return tasks.enqueueLinked(
      h,
      {
        ...command,
        key: data.key,
        contextId: c.id,
        taskId: inspection.task.id,
        basis: inspection.basis,
      },
      link,
    );
  }
  return {
    async handle(action: string, h: Headers, raw: unknown) {
      await identity.withActive(h, { mutation: true }, async () => {});
      if (!agendaActions.has(action)) throw new WorkFault("NOT_FOUND", 404);
      const data = agendaCommand.parse(raw);
      if (data.day !== localDay(new Date(), timezone))
        throw new WorkFault("PLAN_DAY_CHANGED", 409);
      const hash = fingerprint({ action, data });
      return ["admit", "reserve-close"].includes(action)
        ? external(action, h, data, hash)
        : local(action, h, data, hash);
    },
  };
}
