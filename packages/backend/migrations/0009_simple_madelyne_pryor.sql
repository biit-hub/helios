CREATE TABLE "review_feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"routine_context_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"entry_key" text NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"requested" text,
	"evidence" jsonb,
	"draft_id" uuid,
	"operation_id" uuid,
	"confirmed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_feedback_status" CHECK (status IN ('unknown','not_started','partial','completed'))
);
--> statement-breakpoint
CREATE TABLE "routine_contexts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"routine_id" uuid NOT NULL,
	"context_id" uuid NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"selected" boolean DEFAULT true NOT NULL,
	"position" integer NOT NULL,
	"steps" jsonb NOT NULL,
	"review_plan_id" uuid,
	"review_history_id" uuid,
	"review_snapshot" jsonb,
	CONSTRAINT "routine_context_revision_positive" CHECK (revision>=0)
);
--> statement-breakpoint
CREATE TABLE "routine_days" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"timezone" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"steps" jsonb NOT NULL,
	"cursor" jsonb NOT NULL,
	"deferred_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "routine_revision_positive" CHECK (revision>=0)
);
--> statement-breakpoint
CREATE TABLE "routine_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"routine_id" uuid NOT NULL,
	"context_id" uuid,
	"idempotency_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"event" text NOT NULL,
	"detail" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_feedback" ADD CONSTRAINT "review_feedback_routine_context_id_routine_contexts_id_fk" FOREIGN KEY ("routine_context_id") REFERENCES "public"."routine_contexts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_feedback" ADD CONSTRAINT "review_feedback_plan_id_daily_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."daily_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_contexts" ADD CONSTRAINT "routine_contexts_routine_id_routine_days_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routine_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_contexts" ADD CONSTRAINT "routine_contexts_context_id_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."contexts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_contexts" ADD CONSTRAINT "routine_contexts_review_plan_id_daily_plans_id_fk" FOREIGN KEY ("review_plan_id") REFERENCES "public"."daily_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_contexts" ADD CONSTRAINT "routine_contexts_review_history_id_plan_history_id_fk" FOREIGN KEY ("review_history_id") REFERENCES "public"."plan_history"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_days" ADD CONSTRAINT "routine_days_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_events" ADD CONSTRAINT "routine_events_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_events" ADD CONSTRAINT "routine_events_routine_id_routine_days_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routine_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_events" ADD CONSTRAINT "routine_events_context_id_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."contexts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_context_instance" ON "review_feedback" USING btree ("routine_context_id","entry_key");--> statement-breakpoint
CREATE UNIQUE INDEX "routine_context_unique" ON "routine_contexts" USING btree ("routine_id","context_id");--> statement-breakpoint
CREATE UNIQUE INDEX "routine_user_day" ON "routine_days" USING btree ("user_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "routine_event_user_key" ON "routine_events" USING btree ("user_id","idempotency_key");
--> statement-breakpoint
CREATE FUNCTION protect_routine_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'routine events are append-only'; END; $$;
--> statement-breakpoint
CREATE TRIGGER routine_event_immutable BEFORE UPDATE OR DELETE ON routine_events FOR EACH ROW EXECUTE FUNCTION protect_routine_event();
--> statement-breakpoint
CREATE FUNCTION protect_review_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.review_history_id IS NOT NULL AND (NEW.review_history_id,NEW.review_plan_id,NEW.review_snapshot) IS DISTINCT FROM (OLD.review_history_id,OLD.review_plan_id,OLD.review_snapshot) THEN RAISE EXCEPTION 'review source is immutable'; END IF; RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER review_source_immutable BEFORE UPDATE ON routine_contexts FOR EACH ROW EXECUTE FUNCTION protect_review_source();
