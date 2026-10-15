import "server-only";
import {
  createDatabase,
  loadIdentityConfig,
  publicError,
  log,
} from "@helios/backend";
export const dynamic = "force-dynamic";
export async function GET() {
  let database: ReturnType<typeof createDatabase> | undefined;
  try {
    database = createDatabase(loadIdentityConfig().DATABASE_URL);
    await database.pool.query("SELECT 1 FROM technical_probes LIMIT 1");
    await database.pool.query("SELECT 1 FROM auth_user LIMIT 1");
    await database.pool.query("SELECT read_claim FROM integrations LIMIT 1");
    await database.pool.query(
      "SELECT revision,agenda FROM daily_plans LIMIT 1",
    );
    await database.pool.query(
      "SELECT status,kind,payload,result FROM plan_operations LIMIT 1",
    );
    await database.pool.query(
      "SELECT idempotency_key,request_hash,detail FROM planning_observations LIMIT 1",
    );
    await database.pool.query(
      "SELECT revision,status,manual_fields,timezone,claim,job_id FROM ai_drafts LIMIT 1",
    );
    await database.pool.query(
      "SELECT epic_correction,correction_revision,clear_fingerprint,analysis_fingerprint,label_owned FROM ai_task_signals LIMIT 1",
    );
    await database.pool.query(
      "SELECT revision,cursor,steps FROM routine_days LIMIT 1",
    );
    await database.pool.query(
      "SELECT review_history_id,steps FROM routine_contexts LIMIT 1",
    );
    await database.pool.query(
      "SELECT status,operation_id,draft_id FROM review_feedback LIMIT 1",
    );
    await database.pool.query(
      "SELECT base_url,sync_request,sync_revision FROM integrations LIMIT 1",
    );
    await database.pool.query(
      "SELECT mapping_basis,source_hash,fresh_until FROM calendar_snapshots LIMIT 1",
    );
    await database.pool.query(
      "SELECT credential_version FROM termihub_calendar_mappings LIMIT 1",
    );
    await database.pool.query(
      "SELECT no_work_confirmed FROM calendar_day_decisions LIMIT 1",
    );
    const r = await database.pool.query(
      "SELECT 1 FROM worker_heartbeats WHERE seen_at > now() - interval '35 seconds' LIMIT 1",
    );
    if (!r.rowCount) throw new Error("Worker unavailable");
    return Response.json(
      { status: "ok", service: "web", stage: "E9" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    log("error", "readiness_failed");
    return Response.json(publicError(), {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  } finally {
    await database?.close();
  }
}
