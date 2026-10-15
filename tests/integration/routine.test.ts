import { it, expect } from "vitest";
import { generateSync } from "otplib";
import { eq } from "drizzle-orm";
import {
  createRoutineService,
  createPlanExecutor,
  createAiWorker,
  createQueue,
  createAiService,
  workerHeartbeats,
  securityEvents,
  integrationProblems,
  routineDays,
  routineContexts,
  reviewFeedback,
  aiDrafts,
  integrations,
  dailyPlans,
  planHistory,
  createTaskService,
} from "@helios/backend";
import { createTodoistReader } from "../../packages/backend/src/work/todoist";
import { createTodoistMover } from "../../packages/backend/src/planning/todoist";
import { createTaskWriter } from "../../packages/backend/src/tasks/todoist";
import { view as planView } from "../../packages/backend/src/planning/store";
import {
  type RoutineView,
  type ReviewItem,
  type InboxCard,
} from "@helios/contracts";
import { createWorkHarness } from "../fixtures/integration-work";
import { taskFixture } from "../fixtures/tasks";
import { projects } from "../fixtures/todoist";
const h = createWorkHarness(taskFixture);
const { db, config, headers, connect, input, advance } = h;
const reader = () => createTodoistReader(h.f.fetcher);
const service = () => createRoutineService(db, config, reader());
const executor = () =>
  createPlanExecutor(
    db,
    config,
    reader(),
    createTodoistMover(h.f.fetcher),
    createTaskWriter(h.f.fetcher),
  );
const key = () => crypto.randomUUID();
async function start() {
  await service().handle("start", headers(), { key: key() });
  return (await service().snapshot(headers())).routine!;
}
async function act(
  d: RoutineView,
  action: string,
  extra: Record<string, unknown> = {},
) {
  return service().handle(action, headers(), {
    key: key(),
    id: d.id,
    revision: d.revision,
    ...extra,
  });
}
async function reload() {
  return (await service().snapshot(headers())).routine!;
}
async function prepare(count = 2) {
  await connect();
  const c = (await h.work.snapshot(headers())).contexts[0]!;
  await h.work.handle(
    "context-save",
    headers(),
    input(c, { projectId: projects[0]!.id }),
  );
  advance();
  const template = structuredClone(h.f.state.tasks[1]!);
  h.f.state.tasks = Array.from({ length: count }, (_, i) => ({
    ...template,
    id: "routine-" + i,
    project_id: projects[0]!.id,
    parent_id: null,
    content: "Synthetic routine " + i,
    labels: [],
    due: null,
    deadline: null,
    description: "Synthetic only",
  }));
  await h.work.handle("tasks-refresh", headers(), { contextId: c.id });
  advance();
  return (await h.work.snapshot(headers())).contexts[0]!;
}
async function historical(contextId: string, daysAgo: number) {
  const [integration] = await db.db.select().from(integrations);
  const when = new Date(Date.now() - daysAgo * 86400000);
  const day = when.toISOString().slice(0, 10);
  const [p] = await db.db
    .insert(dailyPlans)
    .values({
      id: key(),
      contextId,
      day,
      timezone: "Europe/Zurich",
      revision: 1,
      status: "confirmed",
      entries: h.f.state.tasks
        .filter((t) => t.project_id === projects[0]!.id)
        .slice(0, 5)
        .map((t, n) => ({
          taskId: t.id,
          position: n + 1,
          source: structuredClone(t),
          sectionName: "Offen",
          reasons: ["Synthetic historical plan"],
        })),
      focusTaskId: null,
      projectId: projects[0]!.id,
      contextRevision: 0,
      credentialVersion: integration!.credentialVersion,
      sourceAt: when,
      confirmedAt: when,
    })
    .returning();
  await db.db
    .insert(planHistory)
    .values({ id: key(), planId: p!.id, revision: 1, snapshot: planView(p!) });
  return p!;
}
async function reviewSetup(employer = false) {
  let c = await prepare();
  if (employer) {
    await h.work.handle(
      "context-save",
      headers(),
      input(c, { projectId: null }),
    );
    await h.work.handle(
      "context-save",
      headers(),
      h.employer("Synthetic active employer", projects[0]!.id),
    );
    c = (await h.work.snapshot(headers())).contexts.find(
      (x) => x.kind === "employer",
    )!;
    await h.work.handle("tasks-refresh", headers(), { contextId: c.id });
    advance();
  }
  const p = await historical(c.id, 3);
  let d = await start();
  await act(d, "select-contexts", { contextIds: [c.id] });
  d = await reload();
  await act(d, "navigate", {
    step: "review",
    contextId: c.id,
    contextRevision: d.contexts[0]!.revision,
  });
  d = await reload();
  const items = (
    (await service().details(headers(), d.id, "review", c.id)) as {
      items: ReviewItem[];
    }
  ).items;
  return { c, p, d, items };
}
it("does not start a routine on read; explicit start is persistent and is never completion", async () => {
  expect((await service().snapshot(headers())).routine).toBeNull();
  const d = await start();
  expect(d.startedAt).toBeTruthy();
  expect(d.complete).toBe(false);
  await service().handle("start", headers(), { key: key() });
  expect((await reload()).startedAt).toBe(d.startedAt);
  expect(await db.db.select().from(routineDays)).toHaveLength(1);
});
it("keeps skipped steps open across reload and rejects concurrent revision without external effects", async () => {
  const d = await start();
  const body = { key: key(), id: d.id, revision: d.revision, step: "inbox" };
  await service().handle("skip", headers(), body);
  const next = await reload();
  expect(next.steps.inbox).toBe("skipped_open");
  expect(next.cursor.step).toBe("contexts");
  expect(next.complete).toBe(false);
  await expect(act(d, "complete", { step: "inbox" })).rejects.toMatchObject({
    code: "ROUTINE_CONFLICT",
  });
  await service().handle("skip", headers(), body);
  expect((await reload()).revision).toBe(next.revision);
  expect(h.f.control.calls).toHaveLength(0);
  expect(await db.db.select().from(aiDrafts)).toHaveLength(0);
});
it("keeps days independent and rejects writes to yesterday without replacing its state", async () => {
  const d = await start();
  advance(86400000);
  const login = await h.identity.handle("login", headers(""), {
    username: "synthetic_user",
    password: h.password,
  });
  h.cookie = h.absorb("", login);
  const mfa = await h.identity.handle("mfa", headers(), {
    code: generateSync({ secret: h.secret }),
  });
  h.cookie = h.absorb(h.cookie, mfa);
  await expect(act(d, "skip", { step: "inbox" })).rejects.toMatchObject({
    code: "ROUTINE_DAY_CHANGED",
  });
  const [old] = await db.db
    .select()
    .from(routineDays)
    .where(eq(routineDays.id, d.id));
  expect(old!.steps.inbox).toBe("started");
});
it("accepts dynamic multiple contexts and preserves their progress after deselection and reselection", async () => {
  const c = await prepare();
  await h.work.handle(
    "context-save",
    headers(),
    h.employer("Synthetic employer", projects[1]!.id),
  );
  let d = await start();
  const all = (await h.work.snapshot(headers())).contexts;
  await act(d, "select-contexts", { contextIds: all.map((c) => c.id) });
  d = await reload();
  const rc = d.contexts.find((r) => r.contextId === c.id)!;
  await act(d, "skip", {
    step: "review",
    contextId: c.id,
    contextRevision: rc.revision,
  });
  d = await reload();
  await act(d, "select-contexts", { contextIds: [] });
  d = await reload();
  await act(d, "select-contexts", { contextIds: all.map((c) => c.id) });
  d = await reload();
  expect(d.contexts.find((r) => r.contextId === c.id)!.steps.review).toBe(
    "skipped_open",
  );
  expect(d.contexts).toHaveLength(2);
});
it("presents only one global inbox card and moves deliberately to an unmanaged accessible project without AI", async () => {
  await prepare();
  const template = h.f.state.tasks[0]!;
  h.f.state.tasks.push(
    ...[1, 2].map((n) => ({
      ...structuredClone(template),
      id: "inbox-" + n,
      project_id: projects[4]!.id,
      section_id: null,
    })),
  );
  const d = await start();
  const data = (await service().details(headers(), d.id, "inbox")) as {
    card: InboxCard;
  };
  expect(data.card?.task.id).toBe("inbox-1");
  expect(h.f.control.calls).toHaveLength(0);
  await act(d, "inbox-move", {
    taskId: data.card!.task.id,
    basis: data.card!.basis,
    projectId: projects[3]!.id,
  });
  expect((await reload()).inboxSuccesses).toBe(0);
  await executor().runNext();
  expect((await reload()).inboxSuccesses).toBe(1);
  expect(h.f.state.tasks.find((t) => t.id === "inbox-1")!.project_id).toBe(
    projects[3]!.id,
  );
  expect(await db.db.select().from(aiDrafts)).toHaveLength(0);
});
it("does not count a failed or unknown inbox move and preserves its own journal result", async () => {
  await prepare();
  h.f.state.tasks.push({
    ...structuredClone(h.f.state.tasks[0]!),
    id: "inbox-fail",
    project_id: projects[4]!.id,
    section_id: null,
  });
  const d = await start();
  const { card } = (await service().details(headers(), d.id, "inbox")) as {
    card: InboxCard;
  };
  await act(d, "inbox-move", {
    taskId: card!.task.id,
    basis: card!.basis,
    projectId: projects[3]!.id,
  });
  h.f.control.fail = "unknown";
  await executor().runNext();
  expect((await reload()).inboxSuccesses).toBe(0);
});
it("freezes only the latest confirmed prior context plan and retains older plans and history", async () => {
  const c = await prepare();
  const older = await historical(c.id, 7);
  const latest = await historical(c.id, 3);
  let d = await start();
  await act(d, "select-contexts", { contextIds: [c.id] });
  d = await reload();
  await act(d, "navigate", {
    step: "review",
    contextId: c.id,
    contextRevision: d.contexts[0]!.revision,
  });
  d = await reload();
  expect(d.contexts[0]!.reviewPlan!.id).toBe(latest.id);
  expect(d.contexts[0]!.reviewPlan!.day).not.toBe(
    new Date(Date.now() - 86400000).toISOString().slice(0, 10),
  );
  expect(await db.db.select().from(planHistory)).toHaveLength(2);
  expect(await db.db.select().from(reviewFeedback)).toHaveLength(0);
  expect(
    (
      await db.db.select().from(dailyPlans).where(eq(dailyPlans.id, older.id))
    )[0]!.status,
  ).toBe("confirmed");
});
it("unknown native task remains unknown and cannot be silently marked not-started or completed", async () => {
  const { c, d } = await reviewSetup();
  h.f.state.tasks = [];
  const { items } = (await service().details(
    headers(),
    d.id,
    "review",
    c.id,
  )) as { items: ReviewItem[] };
  expect(
    items.every((i) => i.native === "unknown" && i.feedback === null),
  ).toBe(true);
  await expect(
    act(d, "complete", {
      step: "review",
      contextId: c.id,
      contextRevision: d.contexts[0]!.revision,
    }),
  ).rejects.toMatchObject({ code: "REVIEW_STILL_OPEN" });
});
it("records explicit not-started in bulk without modifying native tasks or historical plan snapshots", async () => {
  const { c, d, items } = await reviewSetup();
  const before = await db.db.select().from(planHistory);
  await act(d, "feedback", {
    contextId: c.id,
    contextRevision: d.contexts[0]!.revision,
    entryKeys: items.map((i) => i.entryKey),
    feedback: "not_started",
  });
  expect(
    (await db.db.select().from(reviewFeedback)).every(
      (f) => f.status === "not_started",
    ),
  ).toBe(true);
  expect(await db.db.select().from(planHistory)).toEqual(before);
  expect(h.f.control.calls).toHaveLength(0);
});
it("persists bulk completion decisions first and records each verified E4 result separately", async () => {
  const { c, d, items } = await reviewSetup();
  const body = {
    key: key(),
    id: d.id,
    revision: d.revision,
    contextId: c.id,
    contextRevision: d.contexts[0]!.revision,
    items: items.map((i) => ({ entryKey: i.entryKey, basis: i.basis! })),
    acknowledgeDestructive: true,
  };
  await service().handle("review-close", headers(), body);
  expect(
    (await db.db.select().from(reviewFeedback)).every(
      (f) => f.status === "unknown",
    ),
  ).toBe(true);
  await executor().runNext();
  h.f.control.fail = "403";
  await executor().runNext();
  const feedback = await db.db.select().from(reviewFeedback);
  expect(feedback.filter((f) => f.status === "completed")).toHaveLength(1);
  expect(feedback.filter((f) => f.status === "unknown")).toHaveLength(1);
  const writes = h.f.control.calls.length;
  await service().handle("review-close", headers(), body);
  expect(h.f.control.calls).toHaveLength(writes);
});
it("refuses to close a new recurrence instance under the same native task ID", async () => {
  const { c, d, items } = await reviewSetup();
  const task = h.f.state.tasks[0]!;
  task.due = { date: "2026-12-01", is_recurring: true, string: "every day" };
  const changed = (
    (await service().details(headers(), d.id, "review", c.id)) as {
      items: ReviewItem[];
    }
  ).items[0]!;
  expect(changed.native).toBe("instance_changed");
  const result = (await act(d, "review-close", {
    contextId: c.id,
    contextRevision: d.contexts[0]!.revision,
    items: [{ entryKey: items[0]!.entryKey, basis: changed.basis! }],
    acknowledgeDestructive: true,
  })) as { outcomes: { code: string }[] };
  expect(result.outcomes[0]!.code).toBe("PLAN_INSTANCE_CHANGED");
  expect(h.f.control.calls).toHaveLength(0);
});

it("enforces active MFA and origin before every routine mutation", async () => {
  const d = await start();
  const bad = headers();
  bad.set("origin", "https://attacker.invalid");
  await expect(
    service().handle("skip", bad, {
      key: key(),
      id: d.id,
      revision: d.revision,
      step: "inbox",
    }),
  ).rejects.toMatchObject({ status: 403 });
  advance(31 * 60000);
  await expect(act(d, "skip", { step: "inbox" })).rejects.toMatchObject({
    code: "AUTH_FAILED",
  });
  const [stored] = await db.db
    .select()
    .from(routineDays)
    .where(eq(routineDays.id, d.id));
  expect(stored!.revision).toBe(d.revision);
});
it("protects routine observations and frozen review snapshots in PostgreSQL", async () => {
  const { d } = await reviewSetup();
  await expect(
    db.pool.query(
      "UPDATE routine_events SET event='rewritten' WHERE routine_id=$1",
      [d.id],
    ),
  ).rejects.toThrow(/append-only/);
  await expect(
    db.pool.query(
      "UPDATE routine_contexts SET review_snapshot=jsonb_set(review_snapshot,'{day}','\"2000-01-01\"') WHERE routine_id=$1",
      [d.id],
    ),
  ).rejects.toThrow(/immutable/);
});
it("blocks queued review closure after context deactivation while global routine steps remain usable", async () => {
  const { c, d, items } = await reviewSetup(true);
  await act(d, "review-close", {
    contextId: c.id,
    contextRevision: d.contexts[0]!.revision,
    items: [{ entryKey: items[0]!.entryKey, basis: items[0]!.basis! }],
    acknowledgeDestructive: true,
  });
  const now = (await h.work.snapshot(headers())).contexts.find(
    (x) => x.id === c.id,
  )!;
  await h.work.handle("context-save", headers(), input(now, { active: false }));
  await executor().runNext();
  expect(h.f.control.calls).toHaveLength(0);
  expect((await db.db.select().from(reviewFeedback))[0]!.status).toBe(
    "unknown",
  );
  const fresh = await reload();
  await act(fresh, "navigate", { step: "problems" });
  expect((await reload()).cursor.step).toBe("problems");
});
it("persists undeployed bulk decisions and can resume them after read failure without a duplicate close", async () => {
  const { c, d, items } = await reviewSetup();
  h.f.state.mode = "network";
  const body = {
    key: key(),
    id: d.id,
    revision: d.revision,
    contextId: c.id,
    contextRevision: d.contexts[0]!.revision,
    items: [{ entryKey: items[0]!.entryKey, basis: items[0]!.basis! }],
    acknowledgeDestructive: true,
  };
  await service().handle("review-close", headers(), body);
  const fresh = await reload();
  expect(fresh.pendingReviews).toHaveLength(1);
  expect(fresh.pendingReviews![0]!.command).toMatchObject(body);
  h.f.state.mode = "ok";
  await service().handle(
    "review-close",
    headers(),
    fresh.pendingReviews![0]!.command,
  );
  await executor().runNext();
  expect((await db.db.select().from(reviewFeedback))[0]!.status).toBe(
    "completed",
  );
  const writes = h.f.control.calls.length;
  await service().handle("review-close", headers(), body);
  expect(h.f.control.calls.length).toBe(writes);
  expect((await reload()).pendingReviews).toHaveLength(0);
});
it("recognizes a previously verified E4 close without relying on absence or closing again", async () => {
  const { c, d, items } = await reviewSetup();
  const { createTaskService } =
    await import("../../packages/backend/src/tasks/service");
  const tasks = createTaskService(db, config, reader());
  await tasks.handle("submit", headers(), {
    key: key(),
    action: "close",
    contextId: c.id,
    taskId: items[0]!.entry.taskId,
    basis: items[0]!.basis,
    acknowledgeDestructive: true,
  });
  await executor().runNext();
  const writes = h.f.control.calls.length;
  h.f.state.tasks = h.f.state.tasks.filter(
    (t) => t.id !== items[0]!.entry.taskId,
  );
  const source = (await service().details(headers(), d.id, "review", c.id)) as {
    items: ReviewItem[];
  };
  expect(source.items[0]!.native).toBe("completed");
  await act(d, "review-close", {
    contextId: c.id,
    contextRevision: d.contexts[0]!.revision,
    items: [{ entryKey: items[0]!.entryKey, basis: source.items[0]!.basis! }],
    acknowledgeDestructive: true,
  });
  expect((await db.db.select().from(reviewFeedback))[0]!.status).toBe(
    "completed",
  );
  expect(h.f.control.calls.length).toBe(writes);
});
it("never changes a confirmed plan when merely entering or skipping planning", async () => {
  const { c, d, p } = await reviewSetup();
  const before = await db.db.select().from(planHistory);
  await act(d, "navigate", {
    step: "planning",
    contextId: c.id,
    contextRevision: d.contexts[0]!.revision,
  });
  const next = await reload();
  await expect(
    act(next, "complete", {
      step: "planning",
      contextId: c.id,
      contextRevision: next.contexts[0]!.revision,
    }),
  ).rejects.toMatchObject({ code: "PLAN_NOT_CONFIRMED" });
  await act(next, "skip", {
    step: "planning",
    contextId: c.id,
    contextRevision: next.contexts[0]!.revision,
  });
  expect(await db.db.select().from(planHistory)).toEqual(before);
  expect(
    (await db.db.select().from(dailyPlans).where(eq(dailyPlans.id, p.id)))[0]!
      .status,
  ).toBe("confirmed");
  expect(h.f.control.calls).toHaveLength(0);
});
it("provides a dynamic clarification set without quota, inbox or foreign-project analysis", async () => {
  const c = await prepare(8);
  for (const t of h.f.state.tasks) t.due = { date: "2020-01-01" };
  await h.work.handle("tasks-refresh", headers(), { contextId: c.id });
  advance();
  let d = await start();
  await act(d, "select-contexts", { contextIds: [c.id] });
  d = await reload();
  const out = (await service().details(
    headers(),
    d.id,
    "enrichment",
    c.id,
  )) as { candidates: { taskId: string; reasons: string[] }[] };
  expect(out.candidates).toHaveLength(8);
  expect(
    out.candidates.every((x) =>
      x.reasons.some((r) => r.includes("keine Deadline")),
    ),
  ).toBe(true);
  expect(await db.db.select().from(aiDrafts)).toHaveLength(0);
});

it("initializes the frozen review source when context selection advances directly", async () => {
  const c = await prepare();
  const p = await historical(c.id, 3);
  let d = await start();
  await act(d, "select-contexts", { contextIds: [c.id] });
  d = await reload();
  await act(d, "complete", { step: "contexts" });
  d = await reload();
  expect(d.cursor).toEqual({ step: "review", contextId: c.id });
  expect(d.contexts[0]!.reviewPlan?.id).toBe(p.id);
  expect(d.contexts[0]!.steps.review).toBe("started");
});
it("reuses feedback only for the same frozen plan, without filling older historical gaps", async () => {
  const { c, p, d, items } = await reviewSetup();
  const original = await db.db.select().from(planHistory);
  const priorId = key();
  await db.db.insert(routineDays).values({
    id: priorId,
    userId: (await db.db.select().from(routineDays))[0]!.userId,
    day: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    timezone: "Europe/Zurich",
    steps: { inbox: "done", contexts: "done", problems: "done" },
    cursor: { step: "review", contextId: c.id },
  });
  const priorContext = key();
  await db.db.insert(routineContexts).values({
    id: priorContext,
    position: 0,
    routineId: priorId,
    contextId: c.id,
    steps: { review: "done", enrichment: "open", planning: "open" },
    reviewPlanId: p.id,
  });
  for (const e of items)
    await db.db.insert(reviewFeedback).values({
      id: key(),
      routineContextId: priorContext,
      planId: p.id,
      entryKey: e.entryKey,
      status: "partial",
      requested: "partial",
      confirmedAt: new Date(),
    });
  await act(d, "complete", {
    step: "review",
    contextId: c.id,
    contextRevision: d.contexts[0]!.revision,
  });
  expect((await reload()).contexts[0]!.steps.review).toBe("done");
  expect(await db.db.select().from(planHistory)).toEqual(original);
});
it("rejects an E6 progress request bound to an obsolete recurring instance before persistence", async () => {
  const { c, items } = await reviewSetup();
  const t = h.f.state.tasks[0]!;
  t.due = { date: "2026-12-02", is_recurring: true };
  const ai = createAiService(db, config, reader(), {
    enabled: true,
    base: "http://127.0.0.1:11434",
    model: "synthetic",
    timeout: 5000,
  });
  await expect(
    ai.handle("start", headers(), {
      key: key(),
      kind: "progress",
      contextId: c.id,
      taskId: t.id,
      input: "Synthetic progress",
      expectedInstanceKey: items[0]!.entryKey,
    }),
  ).rejects.toMatchObject({ code: "PLAN_INSTANCE_CHANGED" });
  expect(await db.db.select().from(aiDrafts)).toHaveLength(0);
});
it("respects a real E6 clarity confirmation in the routine candidate set", async () => {
  const c = await prepare(1);
  const profile = {
    enabled: true,
    base: "http://127.0.0.1:11434",
    model: "synthetic",
    timeout: 5000,
  };
  const ai = createAiService(db, config, reader(), profile);
  const boss = createQueue(config.DATABASE_URL);
  const worker = createAiWorker(
    db,
    config,
    boss,
    profile,
    reader(),
    async () => ({
      clarity: "needs_context",
      feasibility: "executable",
      missing: ["Welches Ergebnis?"],
      reason: "Ergebnis fehlt",
      nextStep: null,
      estimatedMinutes: null,
      uncertainty: "Synthetisch",
      patches: [],
    }),
  );
  await worker.scan();
  const draft = (await ai.list(headers(), { contextId: c.id })).drafts[0]!;
  await worker.run(draft.id);
  let d = await start();
  await act(d, "select-contexts", { contextIds: [c.id] });
  d = await reload();
  expect(
    (await service().details(headers(), d.id, "enrichment", c.id)).candidates,
  ).toHaveLength(1);
  const ready = (await ai.list(headers(), { id: draft.id })).drafts[0]!;
  await ai.handle("clear", headers(), {
    id: ready.id,
    revision: ready.revision,
  });
  expect(
    (await service().details(headers(), d.id, "enrichment", c.id)).candidates,
  ).toHaveLength(0);
  expect(h.f.control.calls).toHaveLength(0);
});
it("rejects an unowned context even on a global resume command", async () => {
  const d = await start();
  await expect(act(d, "resume", { contextId: key() })).rejects.toMatchObject({
    code: "CONTEXT_NOT_FOUND",
  });
  expect((await reload()).revision).toBe(d.revision);
});
it("uses existing worker evidence; checked stays unresolved until a fresh heartbeat", async () => {
  await connect();
  const heartbeat = key();
  await db.db
    .insert(workerHeartbeats)
    .values({ id: heartbeat, seenAt: new Date(Date.now() - 120000) });
  let p = (await h.work.snapshot(headers())).problems.find(
    (x) => x.code === "worker_unavailable",
  )!;
  expect(p.status).toBe("open");
  await h.work.handle("problem-check", headers(), {
    id: p.id,
    revision: p.revision,
  });
  p = (await h.work.snapshot(headers())).problems.find((x) => x.id === p.id)!;
  expect(p.status).toBe("checked");
  await db.db
    .update(workerHeartbeats)
    .set({ seenAt: new Date() })
    .where(eq(workerHeartbeats.id, heartbeat));
  expect(
    (await h.work.snapshot(headers())).problems.find((x) => x.id === p.id)!
      .status,
  ).toBe("resolved");
  await db.db
    .insert(securityEvents)
    .values({ id: key(), code: "recovery_code_consumed" });
  expect(
    (await h.work.snapshot(headers())).problems.some(
      (x) => x.code === "auth_recovery" && x.status === "open",
    ),
  ).toBe(true);
  expect(
    (await db.db.select().from(integrationProblems)).filter(
      (x) => x.code === "worker_unavailable",
    ),
  ).toHaveLength(1);
});

it("rejects review data if credentials change while native reads are in flight", async () => {
  const { c, d } = await reviewSetup();
  const base = reader();
  let changed = false;
  const guarded = {
    ...base,
    task: async (...args: Parameters<typeof base.task>) => {
      const task = await base.task(...args);
      if (!changed) {
        changed = true;
        await db.db.update(integrations).set({ credentialVersion: key() });
      }
      return task;
    },
  };
  await expect(
    createRoutineService(db, config, guarded).details(
      headers(),
      d.id,
      "review",
      c.id,
    ),
  ).rejects.toMatchObject({ code: "ROUTINE_CONFLICT" });
  expect(await db.db.select().from(reviewFeedback)).toHaveLength(0);
});

it("requires the existing E6 progress draft for partial feedback", async () => {
  const { c, d, items } = await reviewSetup();
  await expect(
    act(d, "feedback", {
      contextId: c.id,
      contextRevision: d.contexts[0]!.revision,
      entryKeys: [items[0]!.entryKey],
      feedback: "partial",
    }),
  ).rejects.toMatchObject({ code: "PROGRESS_DRAFT_REQUIRED" });
  const ai = createAiService(db, config, reader(), {
    enabled: true,
    base: "http://127.0.0.1:11434",
    model: "synthetic",
    timeout: 5000,
  });
  const draft = (await ai.handle("start", headers(), {
    key: key(),
    kind: "progress",
    contextId: c.id,
    taskId: items[0]!.entry.taskId,
    input: "Synthetische Originaleingabe bleibt erhalten",
    expectedInstanceKey: items[0]!.entryKey,
  })) as { id: string };
  await act(d, "feedback", {
    contextId: c.id,
    contextRevision: d.contexts[0]!.revision,
    entryKeys: [items[0]!.entryKey],
    feedback: "partial",
    draftId: draft.id,
  });
  const [f] = await db.db.select().from(reviewFeedback);
  expect(f).toMatchObject({ status: "partial", draftId: draft.id });
  expect((await db.db.select().from(aiDrafts))[0]!.input).toBe(
    "Synthetische Originaleingabe bleibt erhalten",
  );
  expect(h.f.control.calls).toHaveLength(0);
});
it("never reports global completion while a selected context still has an external operation", async () => {
  const { c, d, items } = await reviewSetup();
  await historical(c.id, 0);
  const tasks = createTaskService(db, config, reader());
  await tasks.handle("submit", headers(), {
    key: key(),
    action: "close",
    contextId: c.id,
    taskId: items[0]!.entry.taskId,
    basis: items[0]!.basis,
    acknowledgeDestructive: true,
  });
  await db.db
    .update(routineDays)
    .set({ steps: { inbox: "done", contexts: "done", problems: "done" } })
    .where(eq(routineDays.id, d.id));
  await db.db
    .update(routineContexts)
    .set({ steps: { review: "done", enrichment: "done", planning: "done" } })
    .where(eq(routineContexts.routineId, d.id));
  expect((await reload()).complete).toBe(false);
  await executor().runNext();
  expect((await reload()).complete).toBe(true);
});

it("accepts a native checked proof for the same instance without another close", async () => {
  const { c, d, items } = await reviewSetup();
  h.f.state.tasks[0]!.checked = true;
  const out = (await act(d, "review-close", {
    contextId: c.id,
    contextRevision: d.contexts[0]!.revision,
    items: [{ entryKey: items[0]!.entryKey, basis: items[0]!.basis! }],
    acknowledgeDestructive: true,
  })) as { outcomes: { status: string }[] };
  expect(out.outcomes[0]!.status).toBe("completed");
  expect((await db.db.select().from(reviewFeedback))[0]!.status).toBe(
    "completed",
  );
  expect(h.f.control.calls).toHaveLength(0);
});
it("leaves native checked feedback unknown when credentials change during proof reads", async () => {
  const { c, d, items } = await reviewSetup();
  h.f.state.tasks[0]!.checked = true;
  const base = reader();
  const guarded = {
    ...base,
    comments: async (...args: Parameters<typeof base.comments>) => {
      const result = await base.comments(...args);
      await db.db.update(integrations).set({ credentialVersion: key() });
      return result;
    },
  };
  const out = (await createRoutineService(db, config, guarded).handle(
    "review-close",
    headers(),
    {
      key: key(),
      id: d.id,
      revision: d.revision,
      contextId: c.id,
      contextRevision: d.contexts[0]!.revision,
      items: [{ entryKey: items[0]!.entryKey, basis: items[0]!.basis! }],
      acknowledgeDestructive: true,
    },
  )) as { outcomes: { status: string }[] };
  expect(out.outcomes[0]!.status).toBe("unknown");
  expect((await db.db.select().from(reviewFeedback))[0]!.status).toBe(
    "unknown",
  );
  expect(h.f.control.calls).toHaveLength(0);
});
