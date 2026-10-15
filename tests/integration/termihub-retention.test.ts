import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createWorkHarness } from "../fixtures/integration-work";
import { taskFixture } from "../fixtures/tasks";
import { cleanupExpiredSnapshots } from "../../packages/backend/src/termihub/cleanup";
import { SNAPSHOT_RETENTION_MS } from "../../packages/backend/src/termihub/policy";
const h = createWorkHarness(taskFixture);
async function seed() {
  const owner = (await h.db.pool.query("select id from auth_user")).rows[0].id;
  const integration = randomUUID(),
    credential = randomUUID();
  await h.db.pool.query(
    "insert into integrations(id,user_id,type,encrypted_token,credential_version,enabled,base_url,state) values($1,$2,'termihub','synthetic-ciphertext-preserved',$3,true,'https://calendar.example.invalid','ready')",
    [integration, owner, credential],
  );
  // Insert TermiHub first: every existing Todoist query must select its own type.
  const work = await h.work.snapshot(h.headers());
  expect(work.integration.hasToken).toBe(false);
  expect(work.integration.enabled).toBe(false);
  expect(work.integration.state).toBe("not_connected");
  const context = work.contexts[0]!;
  const now = new Date();
  const normalized = {
    work: [],
    fixed: [],
    uncertain: [],
    freeCertain: [],
    freePossible: [],
    workMinutes: null,
    fixedMinutes: null,
    uncertainMinutes: null,
    budget: null,
    complete: true,
    warnings: ["no_work_data"],
    modes: [],
  };
  const ids: string[] = [];
  for (const [index, age] of [
    SNAPSHOT_RETENTION_MS + 1,
    SNAPSHOT_RETENTION_MS,
    SNAPSHOT_RETENTION_MS - 1,
    0,
  ].entries()) {
    const id = randomUUID();
    ids.push(id);
    await h.db.pool.query(
      "insert into calendar_snapshots(id,user_id,integration_id,context_id,day,timezone,revision,credential_version,integration_revision,context_revision,calendar_ids,mapping_basis,source_hash,retrieved_at,fresh_until,data) values($1,$2,$3,$4,'2026-10-15','Europe/Zurich',$5,$6,0,0,'[]','synthetic-mapping','synthetic-source',$7,$8,$9)",
      [
        id,
        owner,
        integration,
        context.id,
        index + 1,
        credential,
        new Date(now.getTime() - age),
        new Date(now.getTime() - age + 900000),
        normalized,
      ],
    );
  }
  const calendar = randomUUID(),
    plan = randomUUID();
  await h.db.pool.query(
    "insert into termihub_catalog(integration_id,kind,item_id,name,credential_version,retrieved_at) values($1,'calendar',$2,'Synthetic calendar',$3,$4)",
    [integration, calendar, credential, now],
  );
  await h.db.pool.query(
    "insert into termihub_calendar_mappings(integration_id,calendar_id,mode,context_id) values($1,$2,'context',$3)",
    [integration, calendar, context.id],
  );
  await h.db.pool.query(
    "insert into calendar_day_decisions(context_id,day,revision,no_work_confirmed,updated_at) values($1,'2026-10-15',1,true,$2)",
    [context.id, now],
  );
  await h.db.pool.query(
    "insert into daily_plans(id,context_id,day,timezone,revision,status,entries,project_id,context_revision,credential_version,source_at,confirmed_at,calendar_basis) values($1,$2,'2026-10-15','Europe/Zurich',1,'confirmed','[]','synthetic-project',0,$3,$4,$4,$5)",
    [
      plan,
      context.id,
      credential,
      now,
      {
        snapshotId: ids[0],
        state: "ready",
        budget: { minimumMinutes: 60, maximumMinutes: 120 },
      },
    ],
  );
  await h.db.pool.query(
    "insert into plan_history(id,plan_id,revision,snapshot) values($1,$2,1,$3)",
    [
      randomUUID(),
      plan,
      {
        id: plan,
        calendarBasis: {
          snapshotId: ids[0],
          budget: { minimumMinutes: 60, maximumMinutes: 120 },
        },
      },
    ],
  );
  return { ids, plan, now };
}
async function protectedState() {
  const tables = [
    "auth_user",
    "contexts",
    "integrations",
    "termihub_catalog",
    "termihub_calendar_mappings",
    "calendar_day_decisions",
    "daily_plans",
    "plan_history",
  ];
  const values = [];
  for (const table of tables)
    values.push(
      (
        await h.db.pool.query(
          `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') as data from ${table} t`,
        )
      ).rows[0].data,
    );
  return values;
}
it("deletes only expired snapshots at 30 days and preserves mappings, encrypted credentials and immutable plan history", async () => {
  const { ids, now } = await seed();
  const before = await protectedState();
  expect(await cleanupExpiredSnapshots(h.db, h.config, now)).toBe(2);
  const remaining = (
    await h.db.pool.query("select id from calendar_snapshots order by revision")
  ).rows.map((row) => row.id);
  expect(remaining).toEqual(ids.slice(2));
  expect(await protectedState()).toEqual(before);
  expect(await cleanupExpiredSnapshots(h.db, h.config, now)).toBe(0);
  expect(await protectedState()).toEqual(before);
});
it("blocks cleanup in restore mode and protects confirmed calendar basis and snapshot versions", async () => {
  const { ids, plan, now } = await seed();
  const before = await protectedState();
  expect(
    await cleanupExpiredSnapshots(
      h.db,
      { ...h.config, RESTORE_MODE: true },
      now,
    ),
  ).toBe(0);
  expect(
    (
      await h.db.pool.query(
        "select count(*)::int as count from calendar_snapshots",
      )
    ).rows[0].count,
  ).toBe(4);
  await expect(
    h.db.pool.query(
      "update calendar_snapshots set source_hash='changed' where id=$1",
      [ids[3]],
    ),
  ).rejects.toThrow("calendar snapshot is immutable");
  await expect(
    h.db.pool.query("update daily_plans set calendar_basis='{}' where id=$1", [
      plan,
    ]),
  ).rejects.toThrow("confirmed calendar basis is immutable");
  expect(await protectedState()).toEqual(before);
});
