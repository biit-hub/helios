CREATE TABLE "calendar_day_decisions" (
	"context_id" uuid NOT NULL,
	"day" date NOT NULL,
	"revision" integer NOT NULL,
	"no_work_confirmed" boolean NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "calendar_day_decisions_context_id_day_pk" PRIMARY KEY("context_id","day"),
	CONSTRAINT "calendar_day_decision_revision" CHECK ("calendar_day_decisions"."revision">0)
);
--> statement-breakpoint
CREATE TABLE "calendar_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"integration_id" uuid NOT NULL,
	"context_id" uuid NOT NULL,
	"day" date NOT NULL,
	"timezone" text NOT NULL,
	"revision" integer NOT NULL,
	"credential_version" uuid NOT NULL,
	"integration_revision" integer NOT NULL,
	"context_revision" integer NOT NULL,
	"calendar_ids" jsonb NOT NULL,
	"organization_id" text,
	"mapping_basis" text NOT NULL,
	"source_hash" text NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"fresh_until" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "calendar_snapshot_revision" CHECK ("calendar_snapshots"."revision">0)
);
--> statement-breakpoint
CREATE TABLE "termihub_calendar_mappings" (
	"integration_id" uuid NOT NULL,
	"calendar_id" text NOT NULL,
	"mode" text NOT NULL,
	"context_id" uuid,
	CONSTRAINT "termihub_calendar_mappings_integration_id_calendar_id_pk" PRIMARY KEY("integration_id","calendar_id"),
	CONSTRAINT "termihub_calendar_mapping_mode" CHECK (("termihub_calendar_mappings"."mode"='context' AND "termihub_calendar_mappings"."context_id" IS NOT NULL) OR ("termihub_calendar_mappings"."mode" IN ('shared','excluded') AND "termihub_calendar_mappings"."context_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "termihub_catalog" (
	"integration_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"item_id" text NOT NULL,
	"name" text NOT NULL,
	"calendar_type" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"credential_version" uuid NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	CONSTRAINT "termihub_catalog_integration_id_kind_item_id_pk" PRIMARY KEY("integration_id","kind","item_id"),
	CONSTRAINT "termihub_catalog_kind" CHECK ("termihub_catalog"."kind" IN ('calendar','organization'))
);
--> statement-breakpoint
ALTER TABLE "integrations" DROP CONSTRAINT "integration_type";--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "base_url" text;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "sync_claim_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "last_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "daily_plans" ADD COLUMN "calendar_basis" jsonb;--> statement-breakpoint
ALTER TABLE "calendar_day_decisions" ADD CONSTRAINT "calendar_day_decisions_context_id_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."contexts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_snapshots" ADD CONSTRAINT "calendar_snapshots_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_snapshots" ADD CONSTRAINT "calendar_snapshots_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_snapshots" ADD CONSTRAINT "calendar_snapshots_context_id_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."contexts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "termihub_calendar_mappings" ADD CONSTRAINT "termihub_calendar_mappings_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "termihub_calendar_mappings" ADD CONSTRAINT "termihub_calendar_mappings_context_id_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."contexts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "termihub_catalog" ADD CONSTRAINT "termihub_catalog_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_snapshot_context_day_revision" ON "calendar_snapshots" USING btree ("context_id","day","revision");--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integration_type" CHECK ("integrations"."type" IN ('todoist','termihub'));--> statement-breakpoint
CREATE FUNCTION protect_calendar_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'calendar snapshot is immutable'; END; $$;
--> statement-breakpoint
CREATE TRIGGER calendar_snapshot_immutable BEFORE UPDATE ON calendar_snapshots FOR EACH ROW EXECUTE FUNCTION protect_calendar_snapshot();
--> statement-breakpoint
CREATE FUNCTION protect_plan_calendar_basis() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.status <> 'draft' AND NEW.calendar_basis IS DISTINCT FROM OLD.calendar_basis THEN RAISE EXCEPTION 'confirmed calendar basis is immutable'; END IF; RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER immutable_plan_calendar_basis BEFORE UPDATE ON daily_plans FOR EACH ROW EXECUTE FUNCTION protect_plan_calendar_basis();
