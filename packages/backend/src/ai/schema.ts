import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  boolean,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../identity/schema";
import { contexts } from "../work/schema";
import type {
  AiDraftView,
  AiOutput,
  DraftPatch,
  TaskInspection,
  TodoistTask,
} from "@helios/contracts";
export type AiSource = {
  inspection: TaskInspection;
  parent: TodoistTask | null;
  ancestors?: TodoistTask[];
  children: TodoistTask[];
};
export const aiDrafts = pgTable(
  "ai_drafts",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    contextId: uuid("context_id").references(() => contexts.id),
    taskId: text("task_id"),
    sessionId: text("session_id"),
    key: uuid("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    manualFields: jsonb("manual_fields")
      .$type<
        import("zod").z.infer<typeof import("@helios/contracts").taskPatch>
      >()
      .notNull()
      .default({}),
    kind: text("kind").$type<AiDraftView["kind"]>().notNull(),
    input: text("input").notNull(),
    timezone: text("timezone").notNull().default("Europe/Zurich"),
    revision: integer("revision").notNull().default(0),
    status: text("status").notNull().default("queued"),
    code: text("code"),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    source: jsonb("source").$type<AiSource>(),
    sourceFingerprint: text("source_fingerprint").notNull(),
    analysisFingerprint: text("analysis_fingerprint").notNull(),
    contextRevision: integer("context_revision"),
    credentialVersion: uuid("credential_version"),
    integrationRevision: integer("integration_revision"),
    patches: jsonb("patches").$type<DraftPatch[]>().notNull().default([]),
    output: jsonb("output").$type<AiOutput>(),
    operationId: uuid("operation_id"),
    claim: uuid("claim"),
    attempts: integer("attempts").notNull().default(0),
    jobId: uuid("job_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("ai_draft_user_key").on(t.userId, t.key),
    check("ai_draft_revision", sql.raw("revision>=0")),
    check("ai_draft_input_limit", sql.raw("length(input)<=8000")),
  ],
);
export const aiTaskSignals = pgTable(
  "ai_task_signals",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    contextId: uuid("context_id")
      .notNull()
      .references(() => contexts.id),
    taskId: text("task_id").notNull(),
    credentialVersion: uuid("credential_version").notNull(),
    analysisFingerprint: text("analysis_fingerprint"),
    clearFingerprint: text("clear_fingerprint"),
    analysisId: uuid("analysis_id").references(() => aiDrafts.id, {
      onDelete: "set null",
    }),
    labelOwned: boolean("label_owned").notNull().default(false),
    remainingMinutes: integer("remaining_minutes"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_signal_scope").on(
      t.contextId,
      t.taskId,
      t.credentialVersion,
    ),
  ],
);
export type AiDraft = typeof aiDrafts.$inferSelect;
