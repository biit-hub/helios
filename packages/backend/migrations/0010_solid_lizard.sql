ALTER TABLE "ai_task_signals" ADD COLUMN "epic_correction" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_task_signals" ADD COLUMN "correction_revision" integer DEFAULT 0 NOT NULL;