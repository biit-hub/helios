CREATE TABLE "context_project_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"context_id" uuid NOT NULL,
	"previous_project_id" text,
	"project_id" text,
	"revision" integer NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contexts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"theme" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"project_id" text,
	"revision" integer DEFAULT 0 NOT NULL,
	"termihub_employer_id" text,
	"termihub_instance_ref" text,
	"last_sync_at" timestamp with time zone,
	CONSTRAINT "context_kind" CHECK ("contexts"."kind" IN ('private','employer')),
	CONSTRAINT "context_theme" CHECK ("contexts"."theme" IN ('copper','blue','green','plum','clay','gold')),
	CONSTRAINT "private_stays_active" CHECK ("contexts"."kind" <> 'private' OR "contexts"."active" = true)
);
--> statement-breakpoint
CREATE TABLE "integration_problems" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"integration_id" uuid NOT NULL,
	"context_id" uuid,
	"key" text NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "integration_problems_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text DEFAULT 'todoist' NOT NULL,
	"encrypted_token" text,
	"credential_version" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"state" text DEFAULT 'not_connected' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_catalog_at" timestamp with time zone,
	"next_allowed_at" timestamp with time zone,
	CONSTRAINT "integration_type" CHECK ("integrations"."type" = 'todoist')
);
--> statement-breakpoint
CREATE TABLE "project_catalog" (
	"integration_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"inbox" boolean NOT NULL,
	"available" boolean NOT NULL,
	"credential_version" uuid NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	CONSTRAINT "project_catalog_integration_id_project_id_pk" PRIMARY KEY("integration_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "task_projections" (
	"integration_id" uuid NOT NULL,
	"task_id" text NOT NULL,
	"context_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"credential_version" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"state" text NOT NULL,
	"section_name" text,
	"fingerprint" text NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "task_projections_integration_id_task_id_pk" PRIMARY KEY("integration_id","task_id")
);
--> statement-breakpoint
ALTER TABLE "context_project_history" ADD CONSTRAINT "context_project_history_context_id_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."contexts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contexts" ADD CONSTRAINT "contexts_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_problems" ADD CONSTRAINT "integration_problems_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_problems" ADD CONSTRAINT "integration_problems_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_problems" ADD CONSTRAINT "integration_problems_context_id_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."contexts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_catalog" ADD CONSTRAINT "project_catalog_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_projections" ADD CONSTRAINT "task_projections_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_projections" ADD CONSTRAINT "task_projections_context_id_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."contexts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_private_context" ON "contexts" USING btree ("user_id") WHERE "contexts"."kind" = 'private';--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_project_context" ON "contexts" USING btree ("user_id","project_id") WHERE "contexts"."active" = true AND "contexts"."project_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_user_type" ON "integrations" USING btree ("user_id","type");
--> statement-breakpoint
INSERT INTO contexts (id,user_id,kind,name,theme) SELECT gen_random_uuid(),id,'private','Privat','copper' FROM auth_user ON CONFLICT DO NOTHING;
