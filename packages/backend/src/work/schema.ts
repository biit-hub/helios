import type { TermiHubSyncRequest } from "../termihub/request";
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../identity/schema";
import type { TodoistTask } from "@helios/contracts";
const time = (n: string) => timestamp(n, { withTimezone: true });
export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    type: text("type").notNull().default("todoist"),
    encryptedToken: text("encrypted_token"),
    baseUrl: text("base_url"),
    syncRequest: jsonb("sync_request").$type<TermiHubSyncRequest>(),
    syncRevision: integer("sync_revision").notNull().default(0),
    syncClaimUntil: time("sync_claim_until"),
    lastSyncAt: time("last_sync_at"),
    credentialVersion: uuid("credential_version").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    revision: integer("revision").notNull().default(0),
    state: text("state").notNull().default("not_connected"),
    lastCheckedAt: time("last_checked_at"),
    lastCatalogAt: time("last_catalog_at"),
    nextAllowedAt: time("next_allowed_at"),
    readClaim: uuid("read_claim"),
  },
  (t) => [
    uniqueIndex("integration_user_type").on(t.userId, t.type),
    check("integration_type", sql`${t.type} IN ('todoist','termihub')`),
  ],
);
export const contexts = pgTable(
  "contexts",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    kind: text("kind").$type<"private" | "employer">().notNull(),
    name: text("name").notNull(),
    theme: text("theme")
      .$type<"copper" | "blue" | "green" | "plum" | "clay" | "gold">()
      .notNull(),
    active: boolean("active").notNull().default(true),
    projectId: text("project_id"),
    revision: integer("revision").notNull().default(0),
    termihubEmployerId: text("termihub_employer_id"),
    termihubInstanceRef: text("termihub_instance_ref"),
    lastSyncAt: time("last_sync_at"),
  },
  (t) => [
    uniqueIndex("one_private_context")
      .on(t.userId)
      .where(sql`${t.kind} = 'private'`),
    uniqueIndex("one_active_project_context")
      .on(t.userId, t.projectId)
      .where(sql`${t.active} = true AND ${t.projectId} IS NOT NULL`),
    check("context_kind", sql`${t.kind} IN ('private','employer')`),
    check(
      "context_theme",
      sql`${t.theme} IN ('copper','blue','green','plum','clay','gold')`,
    ),
    check(
      "private_stays_active",
      sql`${t.kind} <> 'private' OR ${t.active} = true`,
    ),
  ],
);
export const projectCatalog = pgTable(
  "project_catalog",
  {
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id),
    projectId: text("project_id").notNull(),
    name: text("name").notNull(),
    inbox: boolean("inbox").notNull(),
    available: boolean("available").notNull(),
    credentialVersion: uuid("credential_version").notNull(),
    retrievedAt: time("retrieved_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.integrationId, t.projectId] })],
);
export const contextProjectHistory = pgTable("context_project_history", {
  id: uuid("id").primaryKey(),
  contextId: uuid("context_id")
    .notNull()
    .references(() => contexts.id),
  previousProjectId: text("previous_project_id"),
  projectId: text("project_id"),
  revision: integer("revision").notNull(),
  changedAt: time("changed_at").notNull().defaultNow(),
});
export const taskProjections = pgTable(
  "task_projections",
  {
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id),
    taskId: text("task_id").notNull(),
    contextId: uuid("context_id")
      .notNull()
      .references(() => contexts.id),
    projectId: text("project_id").notNull(),
    credentialVersion: uuid("credential_version").notNull(),
    data: jsonb("data").$type<TodoistTask>().notNull(),
    state: text("state")
      .$type<"active" | "completed" | "deleted" | "unknown">()
      .notNull(),
    sectionName: text("section_name"),
    fingerprint: text("fingerprint").notNull(),
    retrievedAt: time("retrieved_at").notNull(),
    revision: integer("revision").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.integrationId, t.taskId] })],
);
export const integrationProblems = pgTable("integration_problems", {
  id: uuid("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  integrationId: uuid("integration_id")
    .notNull()
    .references(() => integrations.id),
  contextId: uuid("context_id").references(() => contexts.id),
  key: text("key").notNull().unique(),
  code: text("code").notNull(),
  status: text("status")
    .$type<"open" | "checked" | "resolved">()
    .notNull()
    .default("open"),
  occurrences: integer("occurrences").notNull().default(1),
  revision: integer("revision").notNull().default(0),
  firstSeenAt: time("first_seen_at").notNull().defaultNow(),
  lastSeenAt: time("last_seen_at").notNull().defaultNow(),
  checkedAt: time("checked_at"),
  resolvedAt: time("resolved_at"),
});
