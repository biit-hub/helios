import { expect, it } from "vitest";
import { prepareTaskSave } from "../../packages/backend/src/tasks/save";
import { taskCommand } from "@helios/contracts";
import { tasks } from "../fixtures/todoist";

const text =
  "Notizen bleiben.\n\n## Ziel\nAltes Ziel\n\n## Checkliste\n* [X] Erhalten\n\n## Referenzen\n[Quelle](https://example.com/original)";
const task = { ...tasks[0]!, description: text };
it("derives one combined native patch and preserves unrelated Markdown, links, checkbox style and other fields", () => {
  const fields = prepareTaskSave(
    task,
    {
      content: "Neuer Titel",
      description: text.replace("Notizen bleiben.", "Notizen bewusst ergänzt."),
    },
    [
      { kind: "goal", value: "Neues Ziel" },
      {
        kind: "checklist",
        items: [
          { text: "Erhalten", checked: true },
          { text: "Neu", checked: false },
        ],
      },
      {
        kind: "link-add",
        label: "Zweite Quelle",
        url: "https://example.com/second",
      },
    ],
  );
  expect(fields.content).toBe("Neuer Titel");
  expect(fields.description).toContain("Notizen bewusst ergänzt.");
  expect(fields.description).toContain("## Ziel\nNeues Ziel");
  expect(fields.description).toContain("* [X] Erhalten");
  expect(fields.description).toContain("- [ ] Neu");
  expect(fields.description).toContain(
    "[Quelle](https://example.com/original)",
  );
  expect(fields.description).toContain("https://example.com/second");
  expect(Object.keys(fields).sort()).toEqual(["content", "description"]);
  expect(task.description).toBe(text);
});
it.each([
  { kind: "goal" as const, value: "Anderes Ziel" },
  { kind: "checklist" as const, items: [{ text: "Erhalten", checked: false }] },
  {
    kind: "link-edit" as const,
    target: "https://example.com/original",
    label: "Quelle",
    url: "https://example.com/new",
  },
])(
  "rejects overlapping raw and structured $kind edits before any journal write",
  (change) => {
    const edited = text
      .replace("Altes Ziel", "Geändertes Ziel")
      .replace("[X]", "[ ]")
      .replace("/original", "/elsewhere");
    expect(() =>
      prepareTaskSave(task, { description: edited }, [change]),
    ).toThrow("TASK_SAVE_OVERLAP");
  },
);
it("keeps existing ambiguity, URL, length, duplicate and recurrence protection", () => {
  expect(() =>
    prepareTaskSave(task, {}, [
      { kind: "link-add", label: "Unsicher", url: "javascript:alert(1)" },
    ]),
  ).toThrow();
  expect(() =>
    prepareTaskSave(
      { ...task, description: text + "\n\n## Ziel\nDoppelt" },
      {},
      [{ kind: "goal", value: "Neu" }],
    ),
  ).toThrow();
  expect(() =>
    prepareTaskSave(task, {}, [
      { kind: "goal", value: "A" },
      { kind: "goal", value: "B" },
    ]),
  ).toThrow();
  expect(() =>
    prepareTaskSave({ ...task, description: "x".repeat(12000) }, {}, [
      { kind: "goal", value: "Mehr" },
    ]),
  ).toThrow();
  expect(() =>
    prepareTaskSave(
      { ...task, due: { date: "2026-11-01", is_recurring: true } },
      { due: null },
    ),
  ).toThrow("RECURRENCE_CONFIRMATION_REQUIRED");
  expect(
    prepareTaskSave(
      { ...task, due: { date: "2026-11-01", is_recurring: true } },
      { due: null },
      [],
      true,
    ),
  ).toEqual({ due: null });
  expect(() => prepareTaskSave(task, {})).toThrow("INVALID_REQUEST");
});
it("keeps legacy commands compatible and rejects unbounded structured changes", () => {
  const raw = {
    key: crypto.randomUUID(),
    action: "update",
    contextId: null,
    fields: { content: "Synthetisch" },
  };
  expect(taskCommand.parse(raw)).not.toHaveProperty("documents");
  expect(
    taskCommand.safeParse({
      ...raw,
      documents: Array.from({ length: 23 }, () => ({
        kind: "goal",
        value: "A",
      })),
    }).success,
  ).toBe(false);
});
