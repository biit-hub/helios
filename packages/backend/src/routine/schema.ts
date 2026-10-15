import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  date,
  boolean,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../identity/schema";
import { contexts } from "../work/schema";
import { dailyPlans, planHistory } from "../planning/schema";
import type {
  RoutineView,
  RoutineContextView,
  PlanView,
} from "@helios/contracts";
const time = (name: string) => timestamp(name, { withTimezone: true });
export const routineDays = pgTable(
  "routine_days",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    day: date("day", { mode: "string" }).notNull(),
    timezone: text("timezone").notNull(),
    startedAt: time("started_at").notNull().defaultNow(),
    revision: integer("revision").notNull().default(0),
    steps: jsonb("steps").$type<RoutineView["steps"]>().notNull(),
    cursor: jsonb("cursor").$type<RoutineView["cursor"]>().notNull(),
    deferredIds: jsonb("deferred_ids").$type<string[]>().notNull().default([]),
  },
  (t) => [
    uniqueIndex("routine_user_day").on(t.userId, t.day),
    check("routine_revision_positive", sql.raw("revision>=0")),
  ],
);
export const routineContexts = pgTable(
  "routine_contexts",
  {
    id: uuid("id").primaryKey(),
    routineId: uuid("routine_id")
      .notNull()
      .references(() => routineDays.id),
    contextId: uuid("context_id")
      .notNull()
      .references(() => contexts.id),
    revision: integer("revision").notNull().default(0),
    selected: boolean("selected").notNull().default(true),
    position: integer("position").notNull(),
    steps: jsonb("steps").$type<RoutineContextView["steps"]>().notNull(),
    reviewPlanId: uuid("review_plan_id").references(() => dailyPlans.id),
    reviewHistoryId: uuid("review_history_id").references(() => planHistory.id),
    reviewSnapshot: jsonb("review_snapshot").$type<PlanView>(),
  },
  (t) => [
    uniqueIndex("routine_context_unique").on(t.routineId, t.contextId),
    check("routine_context_revision_positive", sql.raw("revision>=0")),
  ],
);
export const reviewFeedback = pgTable(
  "review_feedback",
  {
    id: uuid("id").primaryKey(),
    routineContextId: uuid("routine_context_id")
      .notNull()
      .references(() => routineContexts.id),
    planId: uuid("plan_id")
      .notNull()
      .references(() => dailyPlans.id),
    entryKey: text("entry_key").notNull(),
    status: text("status")
      .$type<"unknown" | "not_started" | "partial" | "completed">()
      .notNull()
      .default("unknown"),
    requested: text("requested"),
    evidence: jsonb("evidence").$type<Record<string, unknown>>(),
    draftId: uuid("draft_id"),
    operationId: uuid("operation_id"),
    confirmedAt: time("confirmed_at"),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("review_context_instance").on(t.routineContextId, t.entryKey),
    check(
      "review_feedback_status",
      sql.raw("status IN ('unknown','not_started','partial','completed')"),
    ),
  ],
);
export const routineEvents = pgTable(
  "routine_events",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    routineId: uuid("routine_id")
      .notNull()
      .references(() => routineDays.id),
    contextId: uuid("context_id").references(() => contexts.id),
    key: uuid("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    event: text("event").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    at: time("at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("routine_event_user_key").on(t.userId, t.key)],
);
export type RoutineDay = typeof routineDays.$inferSelect;
export type RoutineContext = typeof routineContexts.$inferSelect;
