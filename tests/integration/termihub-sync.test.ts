import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createWorkHarness } from "../fixtures/integration-work";
import { taskFixture } from "../fixtures/tasks";
import { termihubFixture } from "../fixtures/termihub";
import { createTermiHubService } from "../../packages/backend/src/termihub/service";
import { createTermiHubReader } from "../../packages/backend/src/termihub/reader";
import { createTermiHubSync } from "../../packages/backend/src/termihub/sync";
import { TermiHubFault } from "../../packages/backend/src/termihub/transport";
import { localDay } from "../../packages/backend/src/planning/selection";
const h = createWorkHarness(taskFixture);
const service = () =>
  createTermiHubService(h.db, h.config, {
    timezone: "Europe/Zurich",
    resolver: async () => [{ address: "93.184.216.34", family: 4 }],
  });
async function setup() {
  await h.work.snapshot(h.headers());
  await h.step();
  const s = service(),
    day = localDay(new Date(), "Europe/Zurich"),
    f = termihubFixture(day);
  await s.handle("save", h.headers(), {
    revision: 0,
    baseUrl: "https://calendar.example.invalid",
    token: "synthetic-termihub-only",
  });
  const sync = createTermiHubSync(
    h.db,
    h.config,
    createTermiHubReader(f.transport),
  );
  async function run() {
    h.advance();
    await s.refresh(h.headers(), { day });
    const row = (
      await h.db.pool.query(
        "select id,sync_request from integrations where type='termihub'",
      )
    ).rows[0];
    return sync.run(row.id, row.sync_request.id);
  }
  await run();
  const settings = await s.settings(h.headers());
  const c = settings.contexts[0]!;
  await s.handle("mapping", h.headers(), {
    revision: settings.revision,
    calendars: [{ calendarId: f.calendarId, mode: "context", contextId: c.id }],
    contexts: [
      {
        contextId: c.id,
        contextRevision: c.revision,
        organizationId: f.organizationId,
      },
    ],
  });
  return { s, f, sync, run, day, contextId: c.id };
}
it("encrypts credentials, returns only safe settings and selects Todoist independently", async () => {
  const { s } = await setup();
  const row = (
    await h.db.pool.query(
      "select encrypted_token from integrations where type='termihub'",
    )
  ).rows[0];
  expect(row.encrypted_token).not.toContain("synthetic-termihub-only");
  expect(JSON.stringify(await s.settings(h.headers()))).not.toContain(
    "synthetic-termihub-only",
  );
  const work = await h.work.snapshot(h.headers());
  expect(work.integration.hasToken).toBe(false);
  expect(work.integration.state).toBe("not_connected");
});
it("persists a complete fresh budget with private event fields stripped", async () => {
  const { s, run, day } = await setup();
  expect(await run()).toBe("synced");
  const view = (await s.orientations(h.headers(), { day })).contexts[0]!
    .orientation;
  expect(view.reliable).toBe(true);
  expect(view.budget).toEqual({ minimumMinutes: 480, maximumMinutes: 480 });
  const serialized = JSON.stringify(
    (await h.db.pool.query("select data from calendar_snapshots")).rows,
  );
  expect(serialized).not.toMatch(/PRIVATE_EVENT|private@example/);
  h.advance(900000);
  const stale = (await s.orientations(h.headers(), { day })).contexts[0]!
    .orientation;
  expect(stale.state).toBe("stale");
  expect(stale.reliable).toBe(false);
  expect(stale.budget).toBeNull();
  expect(stale.observedBudget).toEqual(view.budget);
});
it("rejects stale revisions and unverified organization IDs without changing mappings", async () => {
  const { s, f, contextId } = await setup();
  const settings = await s.settings(h.headers()),
    c = settings.contexts[0]!;
  await expect(
    s.handle("mapping", h.headers(), {
      revision: 0,
      calendars: [],
      contexts: [],
    }),
  ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  await expect(
    s.handle("mapping", h.headers(), {
      revision: settings.revision,
      calendars: [],
      contexts: [
        {
          contextId,
          contextRevision: c.revision,
          organizationId: randomUUID(),
        },
      ],
    }),
  ).rejects.toMatchObject({ code: "TERMIHUB_ORGANIZATION_UNVERIFIED" });
  expect((await s.settings(h.headers())).contexts[0]!.organizationId).toBe(
    f.organizationId,
  );
});
it("retains observed organizations when a later bounded day has no work", async () => {
  const { s, f, run } = await setup();
  f.data["work-locations"] = [];
  expect(await run()).toBe("synced");
  expect(
    (await s.settings(h.headers())).organizations.map((v) => v.id),
  ).toContain(f.organizationId);
  const view = (await s.orientations(h.headers())).contexts[0]!.orientation;
  expect(view.budget).toBeNull();
  expect(view.reliable).toBe(false);
});
it("keeps stale orientation after denied reads without claiming a tariff diagnosis", async () => {
  const { s, f, run } = await setup();
  await run();
  f.beforeRead(async () => {
    throw new TermiHubFault("TERMIHUB_PERMISSION", 403);
  });
  expect(await run()).toBe("failed");
  const view = (await s.orientations(h.headers())).contexts[0]!.orientation;
  expect(view.state).toBe("stale");
  expect(view.budget).toBeNull();
  const row = (
    await h.db.pool.query(
      "select sync_request,state from integrations where type='termihub'",
    )
  ).rows[0];
  expect(row.sync_request).toBeNull();
  expect(row.state).toBe("TERMIHUB_PERMISSION");
});
it("discards responses when credentials rotate while HTTP is in flight", async () => {
  const { s, f, run } = await setup();
  const before = (
    await h.db.pool.query("select count(*) from calendar_snapshots")
  ).rows[0].count;
  f.beforeRead(async (path) => {
    if (path !== "calendars") return;
    const settings = await s.settings(h.headers());
    await s.handle("save", h.headers(), {
      revision: settings.revision,
      baseUrl: "https://other.example.invalid",
      token: "synthetic-termihub-only",
    });
  });
  expect(await run()).toBe("discarded");
  expect(
    (await h.db.pool.query("select count(*) from calendar_snapshots")).rows[0]
      .count,
  ).toBe(before);
  const view = (await s.orientations(h.headers())).contexts[0]!.orientation;
  expect(view.reliable).toBe(false);
  expect((await s.settings(h.headers())).mappings[0]!.verified).toBe(false);
});
it("discards responses after a context revision change and releases the old claim", async () => {
  const { f, run, contextId } = await setup();
  f.beforeRead(async (path) => {
    if (path === "calendars")
      await h.db.pool.query(
        "update contexts set revision=revision+1 where id=$1",
        [contextId],
      );
  });
  expect(await run()).toBe("discarded");
  const row = (
    await h.db.pool.query(
      "select read_claim,sync_request,state from integrations where type='termihub'",
    )
  ).rows[0];
  expect(row.read_claim).toBeNull();
  expect(row.sync_request).toBeNull();
});
it("does not commit results after the initiating session is revoked", async () => {
  const { f, run } = await setup();
  const before = (
    await h.db.pool.query("select count(*) from calendar_snapshots")
  ).rows[0].count;
  f.beforeRead(async (path) => {
    if (path === "calendars") await h.db.pool.query("delete from auth_session");
  });
  expect(await run()).toBe("failed");
  expect(
    (await h.db.pool.query("select count(*) from calendar_snapshots")).rows[0]
      .count,
  ).toBe(before);
});
it("does not allow a second worker to execute the same live claim", async () => {
  const { f, sync, run } = await setup();
  let parallel: string | undefined;
  f.beforeRead(async (path) => {
    if (path === "calendars") {
      const row = (
        await h.db.pool.query(
          "select id,sync_request from integrations where type='termihub'",
        )
      ).rows[0];
      parallel = await sync.run(row.id, row.sync_request.id);
    }
  });
  expect(await run()).toBe("synced");
  expect(parallel).toBe("skipped");
});

it("treats a full 500-result window as incomplete rather than a free budget", async () => {
  const { s, f, run } = await setup();
  f.data["work-locations"] = Array.from({ length: 500 }, (_, n) => ({
    ...(f.data["work-locations"]![0] as object),
    id: `synthetic-work-${n}`,
  }));
  expect(await run()).toBe("synced");
  const v = (await s.orientations(h.headers())).contexts[0]!.orientation;
  expect(v.complete).toBe(false);
  expect(v.reliable).toBe(false);
  expect(v.budget).toBeNull();
});
it("honours retry backoff and stops a failing request after three attempts", async () => {
  const { s, f, sync, day } = await setup();
  f.beforeRead(async () => {
    throw new TermiHubFault("TERMIHUB_UNREACHABLE");
  });
  await s.refresh(h.headers(), { day });
  const row = (
    await h.db.pool.query(
      "select id,sync_request from integrations where type='termihub'",
    )
  ).rows[0];
  expect(await sync.run(row.id, row.sync_request.id)).toBe("failed");
  const count = f.calls.length;
  expect(await sync.run(row.id, row.sync_request.id)).toBe("skipped");
  expect(f.calls).toHaveLength(count);
  h.advance(31000);
  expect(await sync.run(row.id, row.sync_request.id)).toBe("failed");
  h.advance(61000);
  expect(await sync.run(row.id, row.sync_request.id)).toBe("failed");
  const ended = (
    await h.db.pool.query(
      "select sync_request,next_allowed_at from integrations where id=$1",
      [row.id],
    )
  ).rows[0];
  expect(ended.sync_request).toBeNull();
  expect(new Date(ended.next_allowed_at).getTime()).toBeGreaterThanOrEqual(
    Date.now() + 900000,
  );
});
it("keeps step-up mandatory for connection and mapping mutations", async () => {
  await h.work.snapshot(h.headers());
  h.advance(301000);
  await expect(
    service().handle("save", h.headers(), {
      revision: 0,
      baseUrl: "https://calendar.example.invalid",
      token: "synthetic-termihub-only",
    }),
  ).rejects.toMatchObject({ code: "STEP_UP_REQUIRED" });
  await expect(service().settings(h.headers(""))).rejects.toMatchObject({
    status: 401,
  });
});

import { createTermiHubWorker } from "../../packages/backend/src/termihub/worker";
import { cleanupExpiredSnapshots } from "../../packages/backend/src/termihub/cleanup";
async function dispatched(f: ReturnType<typeof termihubFixture>) {
  const sent: { integrationId: string; requestId: string }[] = [];
  const boss = {
    send: async (_queue: string, payload: (typeof sent)[number]) => {
      sent.push(payload);
      return randomUUID();
    },
  } as unknown as Parameters<typeof createTermiHubWorker>[2];
  const worker = createTermiHubWorker(h.db, h.config, boss, {
    reader: createTermiHubReader(f.transport),
    timezone: "Europe/Zurich",
  });
  await worker.dispatch();
  return { worker, sent };
}
it("allows configured scheduled reads while signed out without renewing sessions", async () => {
  const { f } = await setup();
  await h.db.pool.query("delete from auth_session");
  const { worker, sent } = await dispatched(f);
  expect(sent).toHaveLength(1);
  expect(await worker.run(sent[0]!.integrationId, sent[0]!.requestId)).toBe(
    "synced",
  );
  expect(
    (await h.db.pool.query("select count(*) from auth_session")).rows[0].count,
  ).toBe("0");
});
it("does not reuse snapshot revision numbers after retention cleanup", async () => {
  const { f, run } = await setup();
  await run();
  const prior = Number(
    (
      await h.db.pool.query(
        "select sync_revision from integrations where type='termihub'",
      )
    ).rows[0].sync_revision,
  );
  h.advance(31 * 86400000);
  await cleanupExpiredSnapshots(h.db, h.config);
  expect(
    (await h.db.pool.query("select count(*) from calendar_snapshots")).rows[0]
      .count,
  ).toBe("0");
  const { worker, sent } = await dispatched(f);
  expect(sent).toHaveLength(1);
  expect(await worker.run(sent[0]!.integrationId, sent[0]!.requestId)).toBe(
    "synced",
  );
  expect(
    Number(
      (
        await h.db.pool.query(
          "select max(revision) as revision from calendar_snapshots",
        )
      ).rows[0].revision,
    ),
  ).toBeGreaterThan(prior);
});
it("blocks foreign and inactive context reads and restore-mode jobs", async () => {
  const { s, f, sync } = await setup();
  await expect(
    s.orientations(h.headers(), { contextId: randomUUID() }),
  ).rejects.toMatchObject({ code: "CONTEXT_NOT_FOUND" });
  await h.work.handle("context-save", h.headers(), {
    ...h.employer("Inactive synthetic context"),
    active: false,
    termihubEmployerId: null,
    termihubInstanceRef: null,
  });
  const inactive = (
    await h.db.pool.query("select id from contexts where name=$1", [
      "Inactive synthetic context",
    ])
  ).rows[0].id;
  await expect(
    s.orientations(h.headers(), { contextId: inactive }),
  ).rejects.toMatchObject({ code: "CONTEXT_NOT_FOUND" });
  const restored = createTermiHubSync(
    h.db,
    { ...h.config, RESTORE_MODE: true },
    createTermiHubReader(f.transport),
  );
  expect(await restored.run(randomUUID(), randomUUID())).toBe("skipped");
  expect(sync).toBeDefined();
});
it("isolates invalid optional TermiHub network settings from the existing worker", async () => {
  const { f } = await setup();
  const previous = process.env.TERMIHUB_TIMEOUT_SECONDS;
  process.env.TERMIHUB_TIMEOUT_SECONDS = "invalid-synthetic-value";
  try {
    const sent: { integrationId: string; requestId: string }[] = [];
    const boss = {
      send: async (_queue: string, data: (typeof sent)[number]) => {
        sent.push(data);
        return randomUUID();
      },
    } as unknown as Parameters<typeof createTermiHubWorker>[2];
    const worker = createTermiHubWorker(h.db, h.config, boss, {
      timezone: "Europe/Zurich",
    });
    await worker.dispatch();
    expect(sent).toHaveLength(1);
    expect(await worker.run(sent[0]!.integrationId, sent[0]!.requestId)).toBe(
      "failed",
    );
    expect((await h.work.snapshot(h.headers())).integration.state).toBe(
      "not_connected",
    );
    expect(f.calls).not.toContain("events");
  } finally {
    if (previous === undefined) delete process.env.TERMIHUB_TIMEOUT_SECONDS;
    else process.env.TERMIHUB_TIMEOUT_SECONDS = previous;
  }
});
it("does not revive a failed snapshot budget while a transient read is retrying", async () => {
  const { s, f, run } = await setup();
  expect(await run()).toBe("synced");
  f.beforeRead(async () => {
    throw new TermiHubFault("TERMIHUB_UNREACHABLE");
  });
  expect(await run()).toBe("failed");
  let duringRetry: Awaited<ReturnType<typeof s.orientations>> | undefined;
  f.beforeRead(async (path) => {
    if (path === "calendars") duringRetry = await s.orientations(h.headers());
    throw new TermiHubFault("TERMIHUB_UNREACHABLE");
  });
  h.advance(31000);
  expect(await run()).toBe("failed");
  expect(duringRetry!.contexts[0]!.orientation.state).toBe("stale");
  expect(duringRetry!.contexts[0]!.orientation.reliable).toBe(false);
  expect(duringRetry!.contexts[0]!.orientation.budget).toBeNull();
  f.beforeRead();
  h.advance(61000);
  expect(await run()).toBe("synced");
  expect(
    (await s.orientations(h.headers())).contexts[0]!.orientation.reliable,
  ).toBe(true);
});
it("names undecided active sources without guessing their context or releasing a budget", async () => {
  const { s, f, run, day } = await setup();
  const extra = {
    ...(f.data.calendars as Record<string, unknown>[])[0]!,
    id: randomUUID(),
    name: "Synthetic unassigned calendar",
  };
  (f.data.calendars as Record<string, unknown>[]).push(extra);
  await run();
  const v = (await s.orientations(h.headers(), { day })).contexts[0]!
    .orientation;
  expect(v.state).toBe("unmapped");
  expect(v.reliable).toBe(false);
  expect(v.budget).toBeNull();
  expect(v.mappingIssues).toContainEqual({
    kind: "calendar",
    name: extra.name,
    reason: "unassigned",
  });
  const settings = await s.settings(h.headers());
  expect(settings.mappings.some((m) => m.calendarId === extra.id)).toBe(false);
  await s.handle("mapping", h.headers(), {
    revision: settings.revision,
    calendars: [
      {
        calendarId: f.calendarId,
        mode: "context",
        contextId: settings.contexts[0]!.id,
      },
      { calendarId: extra.id, mode: "excluded", contextId: null },
    ],
    contexts: [
      {
        contextId: settings.contexts[0]!.id,
        contextRevision: settings.contexts[0]!.revision,
        organizationId: settings.contexts[0]!.organizationId,
      },
    ],
  });
  await run();
  const refreshed = (await s.orientations(h.headers(), { day })).contexts[0]!
    .orientation;
  expect(refreshed.mappingIssues).toEqual([]);
  expect(refreshed.reliable).toBe(true);
});
