import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { contexts } from "../work/schema";
import { user } from "../identity/schema";
import type { PlanEntry, PlanState, PlanView } from "@helios/contracts";
const time = (name: string) => timestamp(name, { withTimezone: true });
export const dailyPlans = pgTable(
  "daily_plans",
  {
    id: uuid("id").primaryKey(),
    contextId: uuid("context_id")
      .notNull()
      .references(() => contexts.id),
    day: date("day", { mode: "string" }).notNull(),
    timezone: text("timezone").notNull(),
    revision: integer("revision").notNull(),
    status: text("status").$type<PlanState>().notNull(),
    entries: jsonb("entries").$type<PlanEntry[]>().notNull(),
    focusTaskId: text("focus_task_id"),
    projectId: text("project_id").notNull(),
    contextRevision: integer("context_revision").notNull(),
    credentialVersion: uuid("credential_version").notNull(),
    sourceAt: time("source_at").notNull(),
    confirmedAt: time("confirmed_at"),
  },
  (t) => [
    uniqueIndex("plan_context_day").on(t.contextId, t.day),
    check(
      "plan_status",
      sql`${t.status} IN ('draft','confirming','partial','confirmed')`,
    ),
    check(
      "plan_entries_limit",
      sql`jsonb_typeof(${t.entries})='array' AND jsonb_array_length(${t.entries}) <= 5`,
    ),
    check("plan_revision_positive", sql`${t.revision}>0`),
  ],
);
export const planHistory = pgTable(
  "plan_history",
  {
    id: uuid("id").primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => dailyPlans.id),
    revision: integer("revision").notNull(),
    snapshot: jsonb("snapshot").$type<PlanView>().notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("plan_history_revision").on(t.planId, t.revision)],
);
export const planOperations = pgTable(
  "plan_operations",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    sessionId: text("session_id").notNull(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => dailyPlans.id),
    key: uuid("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    selectedIds: jsonb("selected_ids").$type<string[]>().notNull(),
    expectedRevision: integer("expected_revision").notNull(),
    status: text("status").notNull(),
    code: text("code"),
    retryAt: time("retry_at"),
    intentExpiresAt: time("intent_expires_at").notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("operation_user_key").on(t.userId, t.key),
    uniqueIndex("one_plan_operation").on(t.planId),
  ],
);
export const planSteps = pgTable(
  "plan_operation_steps",
  {
    id: uuid("id").primaryKey(),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => planOperations.id),
    taskId: text("task_id").notNull(),
    requestId: uuid("request_id").notNull(),
    status: text("status").notNull().default("pending"),
    code: text("code"),
    attempts: integer("attempts").notNull().default(0),
    targetSectionId: text("target_section_id"),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("operation_task_step").on(t.operationId, t.taskId)],
);
export const observations = pgTable("planning_observations", {
  id: uuid("id").primaryKey(),
  contextId: uuid("context_id")
    .notNull()
    .references(() => contexts.id),
  planId: uuid("plan_id")
    .notNull()
    .references(() => dailyPlans.id),
  revision: integer("revision").notNull(),
  event: text("event").notNull(),
  taskId: text("task_id"),
  at: time("at").notNull().defaultNow(),
});
