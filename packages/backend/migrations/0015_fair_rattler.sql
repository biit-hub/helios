CREATE TABLE "ai_job_artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"result_id" uuid NOT NULL,
	"format" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_job_artifact_format" CHECK (format IN ('docx','xlsx','csv','pdf','md')),
	CONSTRAINT "ai_job_artifact_size" CHECK (size=octet_length(data) AND size BETWEEN 1 AND 10485760)
);
--> statement-breakpoint
CREATE TABLE "ai_job_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" text NOT NULL,
	"model" text NOT NULL,
	"digest" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"input_hash" text NOT NULL,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"raw_output" text,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "ai_job_attempt_limits" CHECK (number>0 AND (raw_output IS NULL OR length(raw_output)<=65536))
);
--> statement-breakpoint
CREATE TABLE "ai_job_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"kind" text NOT NULL,
	"revision" integer NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_job_refs" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"context_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"task_id" text NOT NULL,
	"title" text NOT NULL,
	"parent_fingerprint" text NOT NULL,
	"context_revision" integer NOT NULL,
	"credential_version" uuid NOT NULL,
	"integration_revision" integer NOT NULL,
	"operation_id" uuid NOT NULL,
	"child_id" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"close_operation_id" uuid,
	"close_key" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_job_reference_state" CHECK (state IN ('pending','verified','unknown','error','closing','closed'))
);
--> statement-breakpoint
CREATE TABLE "ai_job_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"text" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"uncertainties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_job_result_limits" CHECK (version>0 AND length(text)<=65536)
);
--> statement-breakpoint
CREATE TABLE "ai_job_settings" (
	"user_id" text NOT NULL,
	"output" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"model" text,
	"digest" text,
	"revision" integer DEFAULT 0 NOT NULL,
	"last_key" uuid,
	"last_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_job_settings_user_id_output_pk" PRIMARY KEY("user_id","output"),
	CONSTRAINT "ai_job_settings_output" CHECK (output IN ('text','research','file')),
	CONSTRAINT "ai_job_settings_revision" CHECK (revision>=0),
	CONSTRAINT "ai_job_settings_enabled" CHECK (NOT enabled OR (model IS NOT NULL AND digest IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "ai_job_turns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"question_id" uuid,
	"attempt_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_job_turn_kind" CHECK (kind IN ('question','answer','refinement')),
	CONSTRAINT "ai_job_turn_limits" CHECK (length(text) BETWEEN 1 AND 12000),
	CONSTRAINT "ai_job_answer_reference" CHECK ((kind='answer' AND question_id IS NOT NULL) OR (kind<>'answer' AND question_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"original_prompt" text NOT NULL,
	"request_hash" text NOT NULL,
	"output" text NOT NULL,
	"format" text,
	"model" text NOT NULL,
	"digest" text NOT NULL,
	"settings_revision" integer NOT NULL,
	"parameters" jsonb NOT NULL,
	"status" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"code" text,
	"queue_order" bigserial NOT NULL,
	"priority_order" bigint,
	"queued_at" timestamp with time zone,
	"prioritized_at" timestamp with time zone,
	"run_id" uuid,
	"run_number" integer DEFAULT 0 NOT NULL,
	"heartbeat_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "ai_jobs_output" CHECK (output IN ('text','research','file')),
	CONSTRAINT "ai_jobs_format" CHECK ((output='file' AND format IS NOT NULL AND format IN ('docx','xlsx','csv','pdf','md')) OR (output<>'file' AND format IS NULL)),
	CONSTRAINT "ai_jobs_status" CHECK (status IN ('linking','queued','running','awaiting_input','ready','closed','stopped','error')),
	CONSTRAINT "ai_jobs_revision" CHECK (revision>=0 AND run_number>=0),
	CONSTRAINT "ai_jobs_prompt" CHECK (length(original_prompt) BETWEEN 1 AND 12000),
	CONSTRAINT "ai_jobs_queue_presence" CHECK (status<>'queued' OR (queue_order IS NOT NULL AND queued_at IS NOT NULL)),
	CONSTRAINT "ai_jobs_running_claim" CHECK (status<>'running' OR (run_id IS NOT NULL AND deadline_at IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "ai_job_artifacts" ADD CONSTRAINT "ai_job_artifacts_job_id_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job_artifacts" ADD CONSTRAINT "ai_job_artifacts_result_id_ai_job_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."ai_job_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job_attempts" ADD CONSTRAINT "ai_job_attempts_job_id_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job_events" ADD CONSTRAINT "ai_job_events_job_id_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job_refs" ADD CONSTRAINT "ai_job_refs_job_id_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job_refs" ADD CONSTRAINT "ai_job_refs_context_id_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."contexts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job_refs" ADD CONSTRAINT "ai_job_refs_operation_id_plan_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."plan_operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job_refs" ADD CONSTRAINT "ai_job_refs_close_operation_id_plan_operations_id_fk" FOREIGN KEY ("close_operation_id") REFERENCES "public"."plan_operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job_results" ADD CONSTRAINT "ai_job_results_job_id_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job_results" ADD CONSTRAINT "ai_job_results_attempt_id_ai_job_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."ai_job_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job_settings" ADD CONSTRAINT "ai_job_settings_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job_turns" ADD CONSTRAINT "ai_job_turns_job_id_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job_turns" ADD CONSTRAINT "ai_job_turns_question_id_ai_job_turns_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."ai_job_turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job_turns" ADD CONSTRAINT "ai_job_turns_attempt_id_ai_job_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."ai_job_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_job_one_artifact" ON "ai_job_artifacts" USING btree ("result_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_job_attempt_number" ON "ai_job_attempts" USING btree ("job_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_job_event_key" ON "ai_job_events" USING btree ("job_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "ai_job_event_order" ON "ai_job_events" USING btree ("job_id","revision","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_job_reference_child" ON "ai_job_refs" USING btree ("child_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_job_result_version" ON "ai_job_results" USING btree ("job_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_job_result_attempt" ON "ai_job_results" USING btree ("attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_job_question_answer" ON "ai_job_turns" USING btree ("question_id") WHERE kind='answer';--> statement-breakpoint
CREATE INDEX "ai_job_turn_order" ON "ai_job_turns" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_jobs_owner_date" ON "ai_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_jobs_queue" ON "ai_jobs" USING btree ("status","priority_order","queue_order");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_jobs_one_running" ON "ai_jobs" USING btree ((true)) WHERE status='running';
--> statement-breakpoint
CREATE FUNCTION helios_ai_job_input_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(OLD.id, OLD.user_id, OLD.original_prompt, OLD.request_hash, OLD.output, OLD.format, OLD.model, OLD.digest, OLD.settings_revision, OLD.parameters, OLD.created_at)
     IS DISTINCT FROM ROW(NEW.id, NEW.user_id, NEW.original_prompt, NEW.request_hash, NEW.output, NEW.format, NEW.model, NEW.digest, NEW.settings_revision, NEW.parameters, NEW.created_at) THEN
    RAISE EXCEPTION 'AI job input is immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER ai_job_input_immutable BEFORE UPDATE ON ai_jobs FOR EACH ROW EXECUTE FUNCTION helios_ai_job_input_guard();
--> statement-breakpoint
CREATE FUNCTION helios_ai_job_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'AI job history is immutable'; END IF;
  IF EXISTS (SELECT 1 FROM ai_jobs WHERE id=OLD.job_id) THEN
    RAISE EXCEPTION 'Delete the owned job consciously, not individual history';
  END IF;
  RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER ai_job_events_immutable BEFORE UPDATE OR DELETE ON ai_job_events FOR EACH ROW EXECUTE FUNCTION helios_ai_job_history_guard();
--> statement-breakpoint
CREATE TRIGGER ai_job_turns_immutable BEFORE UPDATE OR DELETE ON ai_job_turns FOR EACH ROW EXECUTE FUNCTION helios_ai_job_history_guard();
--> statement-breakpoint
CREATE TRIGGER ai_job_results_immutable BEFORE UPDATE OR DELETE ON ai_job_results FOR EACH ROW EXECUTE FUNCTION helios_ai_job_history_guard();
--> statement-breakpoint
CREATE TRIGGER ai_job_artifacts_immutable BEFORE UPDATE OR DELETE ON ai_job_artifacts FOR EACH ROW EXECUTE FUNCTION helios_ai_job_history_guard();
--> statement-breakpoint
CREATE FUNCTION helios_ai_job_reference_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(OLD.job_id, OLD.context_id, OLD.project_id, OLD.task_id, OLD.title, OLD.parent_fingerprint, OLD.context_revision, OLD.credential_version, OLD.integration_revision, OLD.operation_id)
    IS DISTINCT FROM ROW(NEW.job_id, NEW.context_id, NEW.project_id, NEW.task_id, NEW.title, NEW.parent_fingerprint, NEW.context_revision, NEW.credential_version, NEW.integration_revision, NEW.operation_id)
    OR (OLD.child_id IS NOT NULL AND OLD.child_id IS DISTINCT FROM NEW.child_id) THEN
    RAISE EXCEPTION 'AI job origin and verified child are immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER ai_job_reference_immutable BEFORE UPDATE ON ai_job_refs FOR EACH ROW EXECUTE FUNCTION helios_ai_job_reference_guard();
--> statement-breakpoint
CREATE FUNCTION helios_ai_job_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='ai_job_turns' THEN
    IF NEW.question_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM ai_job_turns q WHERE q.id=NEW.question_id AND q.job_id=NEW.job_id AND q.kind='question') THEN RAISE EXCEPTION 'Question scope mismatch'; END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME IN ('ai_job_turns','ai_job_results') THEN
    IF NEW.attempt_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ai_job_attempts a WHERE a.id=NEW.attempt_id AND a.job_id=NEW.job_id) THEN RAISE EXCEPTION 'Attempt scope mismatch'; END IF;
  END IF;
  IF TG_TABLE_NAME='ai_job_artifacts' THEN
    IF NOT EXISTS (SELECT 1 FROM ai_job_results r WHERE r.id=NEW.result_id AND r.job_id=NEW.job_id) THEN RAISE EXCEPTION 'Result scope mismatch'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER ai_job_turn_scope BEFORE INSERT ON ai_job_turns FOR EACH ROW EXECUTE FUNCTION helios_ai_job_scope_guard();
--> statement-breakpoint
CREATE TRIGGER ai_job_result_scope BEFORE INSERT ON ai_job_results FOR EACH ROW EXECUTE FUNCTION helios_ai_job_scope_guard();
--> statement-breakpoint
CREATE TRIGGER ai_job_artifact_scope BEFORE INSERT ON ai_job_artifacts FOR EACH ROW EXECUTE FUNCTION helios_ai_job_scope_guard();
