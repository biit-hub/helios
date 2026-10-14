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
    const r = await database.pool.query(
      "SELECT 1 FROM worker_heartbeats WHERE seen_at > now() - interval '35 seconds' LIMIT 1",
    );
    if (!r.rowCount) throw new Error("Worker unavailable");
    return Response.json(
      { status: "ok", service: "web", stage: "E1.2" },
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
