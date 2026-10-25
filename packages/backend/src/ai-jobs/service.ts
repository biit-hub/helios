import { jobArtifact, deleteJob } from "./access";
import { jobClosure } from "./closure";
import { mutateJob, jobLifecycleCommand } from "./lifecycle";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  aiJobCreate,
  aiJobSettingSave,
  aiJobQueueCommand,
  aiJobOutputs,
  aiJobStatuses,
  type AiJobSettings,
} from "@helios/contracts";
import { createIdentityService } from "../identity/service";
import type { Database } from "../planning/store";
import type { WorkConfig } from "../work/config";
import { WorkFault } from "../work/service";
import { createTaskService } from "../tasks/service";
import { createTodoistReader, type TodoistReader } from "../work/todoist";
import { fingerprint } from "../tasks/hash";
import { aiJobSettings } from "./schema";
import {
  createModelDiscovery,
  selectedModel,
  type ModelDiscovery,
} from "./models";
import {
  existingJob,
  insertJob,
  jobDetail,
  listJobs,
  mutateQueue,
  jobConflict,
  type PreparedJob,
} from "./store";
import { parentFingerprint } from "./journal";
import { referenceForTask, assertOrdinaryAiTask } from "./reference";

export function createAiJobService(
  database: Database,
  config: WorkConfig,
  discover: ModelDiscovery = createModelDiscovery(),
  reader: TodoistReader = createTodoistReader(fetch, config.TODOIST_ORIGIN),
) {
  const identity = createIdentityService(database, config);
  const tasks = createTaskService(database, config, reader);
  function mutable() {
    if (config.RESTORE_MODE) throw new WorkFault("RESTORE_BLOCKED", 503);
  }
  async function settings(headers: Headers): Promise<AiJobSettings> {
    await identity.requireActive(headers);
    const catalog = await discover();
    return identity.withActive(headers, {}, async (db, userId) => {
      const rows = await db
        .select()
        .from(aiJobSettings)
        .where(eq(aiJobSettings.userId, userId));
      return {
        ...catalog,
        outputs: aiJobOutputs.map((output) => {
          const row = rows.find((s) => s.output === output);
          const model = catalog.models.find((m) => m.name === row?.model);
          const available =
            !!row?.enabled &&
            !!model?.available &&
            model.local &&
            model.digest === row.digest;
          let reason: string | null = "AI_JOB_TYPE_DISABLED";
          if (row?.enabled)
            reason = available ? null : "AI_JOB_MODEL_UNAVAILABLE";
          return {
            output,
            enabled: row?.enabled ?? false,
            model: row?.model ?? null,
            revision: row?.revision ?? 0,
            available,
            reason,
          };
        }),
      };
    });
  }
  async function saveSetting(headers: Headers, raw: unknown) {
    mutable();
    const input = aiJobSettingSave.parse(raw);
    const hash = fingerprint(input);
    const accepted = await identity.withActive(
      headers,
      { mutation: true },
      async (db, userId) => {
        const [old] = await db
          .select()
          .from(aiJobSettings)
          .where(
            and(
              eq(aiJobSettings.userId, userId),
              eq(aiJobSettings.output, input.output),
            ),
          );
        if (old?.lastKey !== input.key) return false;
        if (old.lastHash !== hash) throw jobConflict();
        return true;
      },
    );
    if (accepted) return settings(headers);
    const catalog = input.model ? await discover() : null;
    const model =
      input.enabled && catalog
        ? selectedModel(catalog, input.model)
        : (catalog?.models.find(
            (m) => m.name === input.model && m.available && m.local,
          ) ?? null);
    await identity.withActive(
      headers,
      { mutation: true },
      async (db, userId) => {
        const [old] = await db
          .select()
          .from(aiJobSettings)
          .where(
            and(
              eq(aiJobSettings.userId, userId),
              eq(aiJobSettings.output, input.output),
            ),
          );
        if (old?.lastKey === input.key) {
          if (old.lastHash !== hash) throw jobConflict();
          return;
        }
        if ((old?.revision ?? 0) !== input.revision)
          throw new WorkFault("AI_JOB_CONFIG_CHANGED", 409);
        const digest =
          model?.digest ?? (old?.model === input.model ? old?.digest : null);
        if (input.model && !digest)
          throw new WorkFault("AI_JOB_MODEL_UNAVAILABLE", 409);
        const values = {
          enabled: input.enabled,
          model: input.model,
          digest: input.model ? digest : null,
          revision: input.revision + 1,
          lastKey: input.key,
          lastHash: hash,
          updatedAt: new Date(),
        };
        if (old)
          await db
            .update(aiJobSettings)
            .set(values)
            .where(
              and(
                eq(aiJobSettings.userId, userId),
                eq(aiJobSettings.output, input.output),
              ),
            );
        else
          await db
            .insert(aiJobSettings)
            .values({ userId, output: input.output, ...values });
      },
    );
    return settings(headers);
  }
  async function create(headers: Headers, raw: unknown) {
    mutable();
    const input = aiJobCreate.parse(raw);
    const base = await identity.withActive(
      headers,
      { mutation: true },
      async (db, userId) => {
        const old = await existingJob(db, userId, input);
        const [setting] = await db
          .select()
          .from(aiJobSettings)
          .where(
            and(
              eq(aiJobSettings.userId, userId),
              eq(aiJobSettings.output, input.output),
            ),
          );
        if (!old && !setting?.enabled)
          throw new WorkFault("AI_JOB_TYPE_DISABLED", 409);
        if (input.origin) {
          const reference = await referenceForTask(
            db,
            userId,
            input.origin.contextId,
            input.origin.taskId,
          );
          if (reference && !old)
            throw new WorkFault("AI_JOB_REFERENCE_ONLY", 409);
        }
        return { old, setting, userId };
      },
    );
    if (base.old) return detail(headers, input.key);
    const model = selectedModel(await discover(), base.setting!.model);
    if (model.digest !== base.setting!.digest)
      throw new WorkFault("AI_JOB_MODEL_UNAVAILABLE", 409);
    const prepared: PreparedJob = {
      input,
      requestHash: fingerprint(input),
      userId: base.userId,
      model,
      settingsRevision: base.setting!.revision,
    };
    if (!input.origin) {
      await identity.withActive(headers, { mutation: true }, (db, userId) =>
        insertJob(db, userId, prepared, "queued"),
      );
    } else {
      const source = await tasks.inspect(
        headers,
        input.origin.contextId,
        input.origin.taskId,
      );
      if (
        source.basis !== input.origin.basis ||
        source.task.checked ||
        source.task.is_deleted
      )
        throw new WorkFault("AI_JOB_ORIGIN_CHANGED", 409);
      await assertOrdinaryAiTask(
        database.db,
        base.userId,
        input.origin.contextId,
        source.task,
      );
      await tasks.enqueueDelegation(
        headers,
        {
          key: input.key,
          action: "create",
          contextId: input.origin.contextId,
          projectId: source.task.project_id,
          parentId: source.task.id,
          fields: {
            content: "KI Aufgabe " + input.key,
            description: "",
            labels: source.task.labels.includes("fun") ? ["fun"] : [],
          },
        },
        {
          prepared,
          title: source.task.content,
          link: {
            id: input.key,
            requestHash: prepared.requestHash,
            parentId: source.task.id,
            parentFingerprint: parentFingerprint(source.task),
          },
        },
      );
    }
    return detail(headers, input.key);
  }
  async function detail(headers: Headers, id: string) {
    z.uuid().parse(id);
    return identity.withActive(headers, {}, (db, userId) =>
      jobDetail(db, userId, id),
    );
  }
  return {
    async artifact(headers: Headers, jobId: string, id: string) {
      z.uuid().parse(jobId);
      z.uuid().parse(id);
      return identity.withActive(headers, {}, (db, user) =>
        jobArtifact(db, user, jobId, id),
      );
    },
    async reference(headers: Headers, contextId: string, taskId: string) {
      z.uuid().parse(contextId);
      z.string().min(1).max(200).parse(taskId);
      return identity.withActive(headers, {}, async (db, userId) => ({
        id: await referenceForTask(db, userId, contextId, taskId),
      }));
    },
    settings,
    detail,
    async list(headers: Headers, raw: unknown = {}) {
      const input = z
        .strictObject({
          page: z.coerce.number().int().min(1).max(100000).default(1),
          status: z.enum(aiJobStatuses).optional(),
          oldest: z.boolean().default(false),
          search: z.string().trim().max(200).default(""),
        })
        .parse(raw);
      return identity.withActive(headers, {}, (db, userId) =>
        listJobs(
          db,
          userId,
          input.page,
          input.status,
          input.oldest,
          input.search,
        ),
      );
    },
    async handle(action: string, headers: Headers, raw: unknown) {
      if (action === "create") return create(headers, raw);
      if (action === "close") {
        mutable();
        await jobClosure(database, config, tasks)(headers, raw);
        return detail(headers, aiJobQueueCommand.parse(raw).id);
      }
      if (action === "delete") {
        mutable();
        const input = aiJobQueueCommand.parse(raw);
        await identity.withActive(headers, { mutation: true }, (db, user) =>
          deleteJob(db, user, input),
        );
        return { deleted: true };
      }
      if (action === "settings") return saveSetting(headers, raw);
      if (action === "answer" || action === "refine" || action === "retry") {
        mutable();
        const input = jobLifecycleCommand.parse(raw);
        await identity.withActive(headers, { mutation: true }, (db, userId) =>
          mutateJob(db, userId, input, action),
        );
        return detail(headers, input.id);
      }
      if (action === "prioritize" || action === "stop") {
        mutable();
        const input = aiJobQueueCommand.parse(raw);
        await identity.withActive(headers, { mutation: true }, (db, userId) =>
          mutateQueue(db, userId, input, action),
        );
        return detail(headers, input.id);
      }
      throw new WorkFault("NOT_FOUND", 404);
    },
  };
}
