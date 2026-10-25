import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  uuid,
  integer,
  bigint,
  bigserial,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
  check,
  customType,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { AiJobOutput, AiJobFormat, AiJobStatus } from "@helios/contracts";
import { user } from "../identity/schema";
import { contexts } from "../work/schema";
import { planOperations } from "../planning/schema";
const time = (name: string) => timestamp(name, { withTimezone: true });
const binary = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const aiJobSettings = pgTable(
  "ai_job_settings",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    output: text("output").$type<AiJobOutput>().notNull(),
    enabled: boolean("enabled").notNull().default(false),
    model: text("model"),
    digest: text("digest"),
    revision: integer("revision").notNull().default(0),
    lastKey: uuid("last_key"),
    lastHash: text("last_hash"),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.output] }),
    check("ai_job_settings_output", sql`output IN ('text','research','file')`),
    check("ai_job_settings_revision", sql`revision>=0`),
    check(
      "ai_job_settings_enabled",
      sql`NOT enabled OR (model IS NOT NULL AND digest IS NOT NULL)`,
    ),
  ],
);

export const aiJobs = pgTable(
  "ai_jobs",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    originalPrompt: text("original_prompt").notNull(),
    requestHash: text("request_hash").notNull(),
    output: text("output").$type<AiJobOutput>().notNull(),
    format: text("format").$type<AiJobFormat>(),
    model: text("model").notNull(),
    digest: text("digest").notNull(),
    settingsRevision: integer("settings_revision").notNull(),
    parameters: jsonb("parameters").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<AiJobStatus>().notNull(),
    revision: integer("revision").notNull().default(0),
    code: text("code"),
    queueOrder: bigserial("queue_order", { mode: "number" }).notNull(),
    priorityOrder: bigint("priority_order", { mode: "number" }),
    queuedAt: time("queued_at"),
    prioritizedAt: time("prioritized_at"),
    runId: uuid("run_id"),
    runNumber: integer("run_number").notNull().default(0),
    heartbeatAt: time("heartbeat_at"),
    deadlineAt: time("deadline_at"),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
    closedAt: time("closed_at"),
  },
  (t) => [
    index("ai_jobs_owner_date").on(t.userId, t.createdAt),
    index("ai_jobs_queue").on(t.status, t.priorityOrder, t.queueOrder),
    uniqueIndex("ai_jobs_one_running")
      .on(sql`(true)`)
      .where(sql`helios_ai_job_running(status)`),
    check("ai_jobs_output", sql`output IN ('text','research','file')`),
    check(
      "ai_jobs_format",
      sql`(output='file' AND format IS NOT NULL AND format IN ('docx','xlsx','csv','pdf','md')) OR (output<>'file' AND format IS NULL)`,
    ),
    check(
      "ai_jobs_status",
      sql`status IN ('linking','queued','running','awaiting_input','ready','closed','stopped','error')`,
    ),
    check("ai_jobs_revision", sql`revision>=0 AND run_number>=0`),
    check("ai_jobs_prompt", sql`length(original_prompt) BETWEEN 1 AND 12000`),
    check(
      "ai_jobs_queue_presence",
      sql`status<>'queued' OR (queue_order IS NOT NULL AND queued_at IS NOT NULL)`,
    ),
    check(
      "ai_jobs_running_claim",
      sql`NOT helios_ai_job_running(status) OR (run_id IS NOT NULL AND deadline_at IS NOT NULL)`,
    ),
  ],
);
export const aiJobRefs = pgTable(
  "ai_job_refs",
  {
    jobId: uuid("job_id")
      .primaryKey()
      .references(() => aiJobs.id, { onDelete: "cascade" }),
    contextId: uuid("context_id")
      .notNull()
      .references(() => contexts.id),
    projectId: text("project_id").notNull(),
    taskId: text("task_id").notNull(),
    title: text("title").notNull(),
    parentFingerprint: text("parent_fingerprint").notNull(),
    contextRevision: integer("context_revision").notNull(),
    credentialVersion: uuid("credential_version").notNull(),
    integrationRevision: integer("integration_revision").notNull(),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => planOperations.id),
    childId: text("child_id"),
    state: text("state")
      .$type<
        "pending" | "verified" | "unknown" | "error" | "closing" | "closed"
      >()
      .notNull()
      .default("pending"),
    closeOperationId: uuid("close_operation_id").references(
      () => planOperations.id,
    ),
    closeKey: uuid("close_key"),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_job_reference_child").on(t.childId),
    check(
      "ai_job_reference_state",
      sql`state IN ('pending','verified','unknown','error','closing','closed')`,
    ),
  ],
);
export const aiJobEvents = pgTable(
  "ai_job_events",
  {
    id: uuid("id").primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => aiJobs.id, { onDelete: "cascade" }),
    key: uuid("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    kind: text("kind").notNull(),
    revision: integer("revision").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_job_event_key").on(t.jobId, t.key),
    index("ai_job_event_order").on(t.jobId, t.revision, t.createdAt),
  ],
);
export const aiJobAttempts = pgTable(
  "ai_job_attempts",
  {
    id: uuid("id").primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => aiJobs.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    status: text("status").notNull(),
    model: text("model").notNull(),
    digest: text("digest").notNull(),
    parameters: jsonb("parameters").$type<Record<string, unknown>>().notNull(),
    inputHash: text("input_hash").notNull(),
    promptVersion: text("prompt_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    rawOutput: text("raw_output"),
    metrics: jsonb("metrics")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    code: text("code"),
    startedAt: time("started_at").notNull().defaultNow(),
    finishedAt: time("finished_at"),
  },
  (t) => [
    uniqueIndex("ai_job_attempt_number").on(t.jobId, t.number),
    check(
      "ai_job_attempt_limits",
      sql`number>0 AND (raw_output IS NULL OR length(raw_output)<=65536)`,
    ),
  ],
);
export const aiJobTurns = pgTable(
  "ai_job_turns",
  {
    id: uuid("id").primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => aiJobs.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"question" | "answer" | "refinement">().notNull(),
    text: text("text").notNull(),
    questionId: uuid("question_id").references(
      (): AnyPgColumn => aiJobTurns.id,
      { onDelete: "cascade" },
    ),
    attemptId: uuid("attempt_id").references(() => aiJobAttempts.id),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_job_question_answer").on(t.questionId),
    index("ai_job_turn_order").on(t.jobId, t.createdAt),
    check("ai_job_turn_kind", sql`kind IN ('question','answer','refinement')`),
    check("ai_job_turn_limits", sql`length(text) BETWEEN 1 AND 12000`),
    check(
      "ai_job_answer_reference",
      sql`(kind='answer') = (question_id IS NOT NULL)`,
    ),
  ],
);
export const aiJobResults = pgTable(
  "ai_job_results",
  {
    id: uuid("id").primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => aiJobs.id, { onDelete: "cascade" }),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => aiJobAttempts.id),
    version: integer("version").notNull(),
    text: text("text").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    sources: jsonb("sources")
      .$type<{ title: string; url: string; retrievedAt: string }[]>()
      .notNull()
      .default([]),
    uncertainties: jsonb("uncertainties")
      .$type<string[]>()
      .notNull()
      .default([]),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_job_result_version").on(t.jobId, t.version),
    uniqueIndex("ai_job_result_attempt").on(t.attemptId),
    check("ai_job_result_limits", sql`version>0 AND length(text)<=65536`),
  ],
);
export const aiJobArtifacts = pgTable(
  "ai_job_artifacts",
  {
    id: uuid("id").primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => aiJobs.id, { onDelete: "cascade" }),
    resultId: uuid("result_id")
      .notNull()
      .references(() => aiJobResults.id, { onDelete: "cascade" }),
    format: text("format").$type<AiJobFormat>().notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    data: binary("data").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_job_one_artifact").on(t.resultId),
    check(
      "ai_job_artifact_format",
      sql`format IN ('docx','xlsx','csv','pdf','md')`,
    ),
    check(
      "ai_job_artifact_size",
      sql`size=octet_length(data) AND size BETWEEN 1 AND 10485760`,
    ),
  ],
);
export type AiJobRow = typeof aiJobs.$inferSelect;
export type AiJobRefRow = typeof aiJobRefs.$inferSelect;
