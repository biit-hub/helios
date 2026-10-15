import { it, expect } from "vitest";
import {
  agendaState,
  agendaEntries,
  entryKey,
  type PlanEntry,
} from "@helios/contracts";
import { assertOrder } from "../../packages/backend/src/planning/agenda-store";
import { tasks } from "../fixtures/todoist";
const entry: PlanEntry = {
  taskId: tasks[1]!.id,
  source: tasks[1]!,
  position: 1,
  sectionName: "Offen",
  reasons: [],
};
it("reads E3 snapshots without manufacturing a reserve or changing original sources", () => {
  const plan = { entries: [entry] };
  expect(agendaEntries(plan, "main")).toEqual([entry]);
  expect(agendaEntries(plan, "reserve")).toEqual([]);
  expect(agendaState(plan).paused).toBe(false);
  expect(plan).not.toHaveProperty("agenda");
});
it("distinguishes recurring instances but tolerates ordinary source edits on one instance", () => {
  const first = {
    ...entry,
    source: {
      ...entry.source,
      due: { date: "2026-10-15", is_recurring: true },
    },
  };
  const next = {
    ...first,
    source: {
      ...first.source,
      due: { ...first.source.due, date: "2026-10-16" },
    },
  };
  expect(entryKey(first)).not.toBe(entryKey(next));
  expect(
    entryKey({ ...first, source: { ...first.source, content: "Edited" } }),
  ).toBe(entryKey(first));
});
it("rejects partial orders, foreign entries and duplicated memberships", () => {
  expect(() => assertOrder(["a", "b"], ["a"])).toThrow();
  expect(() => assertOrder(["a", "b"], ["a", "a"])).toThrow();
  expect(() => assertOrder(["a", "b"], ["a", "c"])).toThrow();
  expect(() => assertOrder(["a", "b"], ["b", "a"])).not.toThrow();
});
