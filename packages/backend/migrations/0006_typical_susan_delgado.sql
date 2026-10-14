ALTER TABLE "plan_operations" ALTER COLUMN "plan_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_operations" ADD COLUMN "kind" text DEFAULT 'plan' NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_operations" ADD COLUMN "context_id" uuid;--> statement-breakpoint
ALTER TABLE "plan_operations" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "plan_operations" ADD COLUMN "result" jsonb;--> statement-breakpoint
ALTER TABLE "plan_operations" ADD CONSTRAINT "plan_operations_context_id_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."contexts"("id") ON DELETE no action ON UPDATE no action;