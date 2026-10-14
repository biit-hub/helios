CREATE TABLE "daily_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"context_id" uuid NOT NULL,
	"day" date NOT NULL,
	"timezone" text NOT NULL,
	"revision" integer NOT NULL,
	"status" text NOT NULL,
	"entries" jsonb NOT NULL,
	"focus_task_id" text,
	"project_id" text NOT NULL,
	"context_revision" integer NOT NULL,
	"credential_version" uuid NOT NULL,
	"source_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "plan_status" CHECK ("daily_plans"."status" IN ('draft','confirming','partial','confirmed')),
	CONSTRAINT "plan_entries_limit" CHECK (jsonb_typeof("daily_plans"."entries")='array' AND jsonb_array_length("daily_plans"."entries") <= 5),
	CONSTRAINT "plan_revision_positive" CHECK ("daily_plans"."revision">0)
);
--> statement-breakpoint
CREATE TABLE "planning_observations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"context_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"event" text NOT NULL,
	"task_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"selected_ids" jsonb NOT NULL,
	"expected_revision" integer NOT NULL,
	"status" text NOT NULL,
	"code" text,
	"retry_at" timestamp with time zone,
	"intent_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_operation_steps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"operation_id" uuid NOT NULL,
	"task_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"code" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"target_section_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_context_id_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."contexts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_observations" ADD CONSTRAINT "planning_observations_context_id_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."contexts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_observations" ADD CONSTRAINT "planning_observations_plan_id_daily_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."daily_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_history" ADD CONSTRAINT "plan_history_plan_id_daily_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."daily_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_operations" ADD CONSTRAINT "plan_operations_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_operations" ADD CONSTRAINT "plan_operations_plan_id_daily_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."daily_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_operation_steps" ADD CONSTRAINT "plan_operation_steps_operation_id_plan_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."plan_operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_context_day" ON "daily_plans" USING btree ("context_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_history_revision" ON "plan_history" USING btree ("plan_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "operation_user_key" ON "plan_operations" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "one_plan_operation" ON "plan_operations" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "operation_task_step" ON "plan_operation_steps" USING btree ("operation_id","task_id");
--> statement-breakpoint
CREATE FUNCTION protect_plan_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'plan history is append only'; END; $$;
--> statement-breakpoint
CREATE TRIGGER immutable_plan_history BEFORE UPDATE OR DELETE ON plan_history FOR EACH ROW EXECUTE FUNCTION protect_plan_history();
--> statement-breakpoint
CREATE FUNCTION protect_plan_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.status <> 'draft' AND (NEW.entries IS DISTINCT FROM OLD.entries OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.credential_version IS DISTINCT FROM OLD.credential_version OR NEW.source_at IS DISTINCT FROM OLD.source_at OR NEW.context_id IS DISTINCT FROM OLD.context_id OR NEW.day IS DISTINCT FROM OLD.day OR NEW.timezone IS DISTINCT FROM OLD.timezone) THEN RAISE EXCEPTION 'confirmed plan source is immutable'; END IF; IF OLD.status='confirmed' AND NEW.status <> 'confirmed' THEN RAISE EXCEPTION 'confirmed plan cannot be replaced'; END IF; RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER immutable_plan_source BEFORE UPDATE ON daily_plans FOR EACH ROW EXECUTE FUNCTION protect_plan_source();
