CREATE TABLE "ai_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"context_id" uuid,
	"task_id" text,
	"session_id" text,
	"idempotency_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"manual_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"kind" text NOT NULL,
	"input" text NOT NULL,
	"timezone" text DEFAULT 'Europe/Zurich' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"code" text,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"source" jsonb,
	"source_fingerprint" text NOT NULL,
	"analysis_fingerprint" text NOT NULL,
	"context_revision" integer,
	"credential_version" uuid,
	"integration_revision" integer,
	"patches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"output" jsonb,
	"operation_id" uuid,
	"claim" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "ai_draft_revision" CHECK (revision>=0),
	CONSTRAINT "ai_draft_input_limit" CHECK (length(input)<=8000)
);
--> statement-breakpoint
CREATE TABLE "ai_task_signals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"context_id" uuid NOT NULL,
	"task_id" text NOT NULL,
	"credential_version" uuid NOT NULL,
	"analysis_fingerprint" text,
	"clear_fingerprint" text,
	"analysis_id" uuid,
	"label_owned" boolean DEFAULT false NOT NULL,
	"remaining_minutes" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_context_id_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."contexts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_task_signals" ADD CONSTRAINT "ai_task_signals_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_task_signals" ADD CONSTRAINT "ai_task_signals_context_id_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."contexts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_task_signals" ADD CONSTRAINT "ai_task_signals_analysis_id_ai_drafts_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."ai_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_draft_user_key" ON "ai_drafts" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_signal_scope" ON "ai_task_signals" USING btree ("context_id","task_id","credential_version");