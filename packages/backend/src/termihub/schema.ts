import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  date,
  boolean,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../identity/schema";
import { integrations, contexts } from "../work/schema";
import type { NormalizedDay } from "./intervals";
const time = (name: string) => timestamp(name, { withTimezone: true });
export const termihubCatalog = pgTable(
  "termihub_catalog",
  {
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id),
    kind: text("kind").$type<"calendar" | "organization">().notNull(),
    itemId: text("item_id").notNull(),
    name: text("name").notNull(),
    calendarType: text("calendar_type"),
    enabled: boolean("enabled").notNull().default(true),
    available: boolean("available").notNull().default(true),
    credentialVersion: uuid("credential_version").notNull(),
    retrievedAt: time("retrieved_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.integrationId, t.kind, t.itemId] }),
    check(
      "termihub_catalog_kind",
      sql`${t.kind} IN ('calendar','organization')`,
    ),
  ],
);
export const termihubCalendarMappings = pgTable(
  "termihub_calendar_mappings",
  {
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id),
    calendarId: text("calendar_id").notNull(),
    credentialVersion: uuid("credential_version"),
    mode: text("mode").$type<"context" | "shared" | "excluded">().notNull(),
    contextId: uuid("context_id").references(() => contexts.id),
  },
  (t) => [
    primaryKey({ columns: [t.integrationId, t.calendarId] }),
    check(
      "termihub_calendar_mapping_mode",
      sql`(${t.mode}='context' AND ${t.contextId} IS NOT NULL) OR (${t.mode} IN ('shared','excluded') AND ${t.contextId} IS NULL)`,
    ),
  ],
);
export const calendarSnapshots = pgTable(
  "calendar_snapshots",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id),
    contextId: uuid("context_id")
      .notNull()
      .references(() => contexts.id),
    day: date("day", { mode: "string" }).notNull(),
    timezone: text("timezone").notNull(),
    revision: integer("revision").notNull(),
    credentialVersion: uuid("credential_version").notNull(),
    integrationRevision: integer("integration_revision").notNull(),
    contextRevision: integer("context_revision").notNull(),
    calendarIds: jsonb("calendar_ids").$type<string[]>().notNull(),
    organizationId: text("organization_id"),
    mappingBasis: text("mapping_basis").notNull(),
    sourceHash: text("source_hash").notNull(),
    retrievedAt: time("retrieved_at").notNull(),
    freshUntil: time("fresh_until").notNull(),
    data: jsonb("data").$type<NormalizedDay>().notNull(),
  },
  (t) => [
    index("calendar_snapshot_expiry").on(t.retrievedAt, t.id),
    uniqueIndex("calendar_snapshot_context_day_revision").on(
      t.contextId,
      t.day,
      t.revision,
    ),
    check("calendar_snapshot_revision", sql`${t.revision}>0`),
  ],
);
export const calendarDayDecisions = pgTable(
  "calendar_day_decisions",
  {
    contextId: uuid("context_id")
      .notNull()
      .references(() => contexts.id),
    day: date("day", { mode: "string" }).notNull(),
    revision: integer("revision").notNull(),
    noWorkConfirmed: boolean("no_work_confirmed").notNull(),
    updatedAt: time("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.contextId, t.day] }),
    check("calendar_day_decision_revision", sql`${t.revision}>0`),
  ],
);
