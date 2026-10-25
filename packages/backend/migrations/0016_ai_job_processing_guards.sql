CREATE FUNCTION helios_ai_job_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(OLD.id, OLD.job_id, OLD.number, OLD.model, OLD.digest, OLD.parameters, OLD.prompt_version, OLD.schema_version, OLD.started_at)
    IS DISTINCT FROM ROW(NEW.id, NEW.job_id, NEW.number, NEW.model, NEW.digest, NEW.parameters, NEW.prompt_version, NEW.schema_version, NEW.started_at)
    OR OLD.finished_at IS NOT NULL THEN
    RAISE EXCEPTION 'AI job execution evidence is immutable';
  END IF;
  IF NEW.status NOT IN ('running','awaiting_input','ready','error') THEN RAISE EXCEPTION 'Invalid AI attempt state'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER ai_job_attempt_immutable BEFORE UPDATE ON ai_job_attempts FOR EACH ROW EXECUTE FUNCTION helios_ai_job_attempt_guard();
--> statement-breakpoint
CREATE TRIGGER ai_job_attempt_delete_guard BEFORE DELETE ON ai_job_attempts FOR EACH ROW EXECUTE FUNCTION helios_ai_job_history_guard();
--> statement-breakpoint
CREATE FUNCTION helios_ai_job_artifact_format_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ai_job_results r WHERE r.id=NEW.result_id AND r.job_id=NEW.job_id) THEN
    RAISE EXCEPTION 'Result scope mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ai_jobs j WHERE j.id=NEW.job_id AND j.output='file' AND j.format=NEW.format) THEN
    RAISE EXCEPTION 'AI artifact output mismatch';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER ai_job_artifact_output_guard BEFORE INSERT ON ai_job_artifacts FOR EACH ROW EXECUTE FUNCTION helios_ai_job_artifact_format_guard();
