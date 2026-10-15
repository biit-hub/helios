ALTER TABLE "daily_plans" ADD COLUMN "agenda" jsonb;--> statement-breakpoint
ALTER TABLE "planning_observations" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
ALTER TABLE "planning_observations" ADD COLUMN "request_hash" text;--> statement-breakpoint
ALTER TABLE "planning_observations" ADD COLUMN "detail" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "observation_plan_key" ON "planning_observations" USING btree ("plan_id","idempotency_key");
--> statement-breakpoint
CREATE FUNCTION protect_plan_agenda() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a jsonb; keys jsonb; catalog jsonb;
BEGIN
 IF NEW.agenda IS NOT DISTINCT FROM OLD.agenda THEN RETURN NEW; END IF;
 IF OLD.status <> 'confirmed' OR NEW.status <> 'confirmed' OR NEW.revision <> OLD.revision+1 OR NEW.agenda IS NULL THEN RAISE EXCEPTION 'agenda requires a confirmed plan revision'; END IF;
 a := NEW.agenda;
 IF jsonb_typeof(a->'main') <> 'array' OR jsonb_typeof(a->'reserve') <> 'array' OR jsonb_typeof(a->'extra') <> 'array' OR jsonb_typeof(a->'retired') <> 'array' OR jsonb_typeof(a->'pending') <> 'array' OR jsonb_typeof(a->'paused') <> 'boolean' THEN RAISE EXCEPTION 'invalid agenda shape'; END IF;
 IF OLD.agenda IS NOT NULL AND (NOT ((a->'extra') @> (OLD.agenda->'extra')) OR NOT ((a->'retired') @> (OLD.agenda->'retired'))) THEN RAISE EXCEPTION 'agenda sources and retirement are append only'; END IF;
 keys := (a->'main') || (a->'reserve'); catalog := NEW.entries || (a->'extra');
 IF jsonb_array_length(keys)>200 OR jsonb_array_length(catalog)>200 OR (SELECT count(*) <> count(DISTINCT value) FROM jsonb_array_elements_text(keys)) THEN RAISE EXCEPTION 'agenda order is not unique'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(keys) k WHERE (a->'retired') ? k.value OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(catalog) e WHERE k.value::jsonb = jsonb_build_array(e.value->>'taskId',CASE WHEN (e.value->'source'->'due'->>'is_recurring')::boolean THEN e.value->'source'->'due'->>'date' ELSE NULL END))) THEN RAISE EXCEPTION 'agenda refers to unknown or retired instance'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER protected_plan_agenda BEFORE UPDATE ON daily_plans FOR EACH ROW EXECUTE FUNCTION protect_plan_agenda();
--> statement-breakpoint
CREATE TRIGGER immutable_planning_observations BEFORE UPDATE OR DELETE ON planning_observations FOR EACH ROW EXECUTE FUNCTION protect_plan_history();
