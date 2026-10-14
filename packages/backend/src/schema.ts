import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";
export const technicalProbes = pgTable("technical_probes", {
  id: uuid("id").primaryKey(),
  completedAt: timestamp("completed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const workerHeartbeats = pgTable("worker_heartbeats", {
  id: uuid("id").primaryKey(),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export * from "./identity/schema";
