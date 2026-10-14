import { it, expect } from "vitest";
import {
  patchWaiting,
  readWaiting,
} from "../../packages/backend/src/tasks/waiting";
import {
  fieldPatch,
  createTaskWriter,
} from "../../packages/backend/src/tasks/todoist";
import { taskCommand } from "@helios/contracts";
const details = {
  who: "Synthetic team",
  subject: "Freigabe",
  followUp: "2026-10-22",
};
it("patches only the AST-defined waiting source span preserving unrelated bytes", () => {
  const original =
    "## Ziel\r\nUnverändert.\r\n\r\n```md\r\n## Helios – Wartedetails\r\n```\r\n";
  const added = patchWaiting(original, details);
  expect(added.startsWith(original)).toBe(true);
  expect(readWaiting(added)).toEqual(details);
  const suffix = "\n\n## Links\n[Notiz](https://example.com)\n";
  const changed = patchWaiting(added + suffix, { ...details, who: "Andere" });
  expect(changed.endsWith(suffix)).toBe(true);
  expect(changed.startsWith(original)).toBe(true);
  expect(readWaiting(changed)?.who).toBe("Andere");
});
it("rejects duplicate waiting headings, foreign content in the owned block and injected headings", () => {
  const block = patchWaiting("", details);
  expect(() => patchWaiting(block + "\n\n" + block, details)).toThrow();
  expect(() => patchWaiting(block + "\nUnbekannter Inhalt", details)).toThrow();
  expect(() =>
    patchWaiting("", { ...details, who: "Test\n## Ziel" }),
  ).toThrow();
});
it("keeps due, deadline, clearing and omitted fields separate", () => {
  expect(
    fieldPatch({ due: null, deadline: null, description: "", labels: [] }),
  ).toEqual({
    due_string: "no date",
    deadline_date: null,
    description: "",
    labels: [],
  });
  expect(fieldPatch({ priority: 4 })).toEqual({ priority: 4 });
  expect(fieldPatch({ due: "2026-10-22T10:00:00Z" })).toEqual({
    due_datetime: "2026-10-22T10:00:00Z",
  });
});
it("rejects arbitrary fields and invalid dates", () => {
  expect(
    taskCommand.safeParse({
      key: crypto.randomUUID(),
      action: "create",
      contextId: null,
      fields: { content: "x", system: true },
    }).success,
  ).toBe(false);
  expect(
    taskCommand.safeParse({
      key: crypto.randomUUID(),
      action: "create",
      contextId: null,
      fields: { content: "x", deadline: "2026-02-31" },
    }).success,
  ).toBe(false);
});
it("bounds writes to allowlisted paths and does not retry an unknown response", async () => {
  let calls = 0;
  const writer = createTaskWriter(async () => {
    calls++;
    throw Error("synthetic");
  });
  await expect(
    writer("synthetic", "POST", "tasks", { content: "x" }, crypto.randomUUID()),
  ).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
  expect(calls).toBe(1);
  await expect(
    writer("synthetic", "POST", "user", {}, crypto.randomUUID()),
  ).rejects.toThrow();
  expect(calls).toBe(1);
});

it("verifies actual UTC due.date values and does not accept an ignored duration as success", async () => {
  const { matchesFields } =
    await import("../../packages/backend/src/tasks/todoist");
  const { tasks } = await import("../fixtures/todoist");
  const t = {
    ...tasks[1]!,
    due: {
      date: "2026-10-21T09:30:00Z",
      timezone: "Europe/Zurich",
      is_recurring: false,
    },
    duration: null,
  };
  expect(matchesFields(t, { due_datetime: "2026-10-21T11:30:00+02:00" })).toBe(
    true,
  );
  expect(matchesFields(t, { duration: 25, duration_unit: "minute" })).toBe(
    false,
  );
});
it("matches labels without treating their source order as a content conflict", async () => {
  const { matchesFields } =
    await import("../../packages/backend/src/tasks/todoist");
  const { tasks } = await import("../fixtures/todoist");
  expect(
    matchesFields({ ...tasks[1]!, labels: ["b", "a"] }, { labels: ["a", "b"] }),
  ).toBe(true);
});

it("keeps historical E3 source hashes compatible with newly retained human recurrence text", async () => {
  const { taskBasis } =
    await import("../../packages/backend/src/planning/selection");
  const { tasks } = await import("../fixtures/todoist");
  const original = {
    ...tasks[1]!,
    due: { date: "2026-10-20", is_recurring: true },
  };
  expect(
    taskBasis({
      ...original,
      due: { ...original.due, string: "every day", lang: "en" },
    }),
  ).toBe(taskBasis(original));
});

it("does not confuse an unchanged recurring rule with a successful rule edit", async () => {
  const { matchesFields } =
    await import("../../packages/backend/src/tasks/todoist");
  const { tasks } = await import("../fixtures/todoist");
  const task = {
    ...tasks[1]!,
    due: { date: "2026-11-01", string: "every week", is_recurring: true },
  };
  expect(matchesFields(task, { due_string: "every day" })).toBe(false);
  expect(
    matchesFields(task, { due_string: "every week starting 2026-11-01" }),
  ).toBe(true);
  expect(
    matchesFields(task, { due_string: "every week starting 2026-11-02" }),
  ).toBe(false);
});
