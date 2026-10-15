import { it, expect } from "vitest";
import type { PlanEntry } from "@helios/contracts";
import { calendarCandidates } from "../../packages/backend/src/termihub/selection";
import { emptyOrientation } from "../../packages/backend/src/termihub/policy";
const day = "2026-10-15";
const view = (min: number, max = min) => ({
  ...emptyOrientation(day, "Europe/Zurich", "ready"),
  reliable: true,
  budget: { minimumMinutes: min, maximumMinutes: max },
});
function task(
  id: string,
  amount: number | null,
  deadline: string | null = null,
): PlanEntry {
  return {
    taskId: id,
    position: 1,
    sectionName: "Offen",
    reasons: [],
    source: {
      id,
      project_id: "synthetic-project",
      content: "Synthetic task",
      description: "",
      parent_id: null,
      section_id: null,
      checked: false,
      is_deleted: false,
      labels: [],
      due: null,
      deadline: deadline ? { date: deadline } : null,
      priority: 1,
      duration: amount === null ? null : { amount, unit: "minute" },
    },
  };
}
it("uses known durations conservatively and does not fill a busy day artificially", () => {
  const selected = calendarCandidates(
    [task("long", 90), task("fits", 30), task("next", 30)],
    view(45, 120),
    day,
  );
  expect(selected.map((v) => v.taskId)).toEqual(["fits"]);
  expect(selected[0]!.position).toBe(1);
  expect(calendarCandidates([task("optional", 15)], view(0), day)).toEqual([]);
});
it("does not treat unknown duration as zero or invent an exact estimate", () => {
  const selected = calendarCandidates(
    [task("first", null), task("second", null)],
    view(30),
    day,
  );
  expect(selected.map((v) => v.taskId)).toEqual(["first"]);
  expect(selected[0]!.source.duration).toBeNull();
  expect(selected[0]!.reasons).toContain(
    "Dauer unbekannt; die zeitliche Passung ist offen, nicht null Minuten.",
  );
});
it("keeps one reached deadline visible with an explicit fit warning", () => {
  const selected = calendarCandidates(
    [task("required", 90, day), task("extra", 30)],
    view(0),
    day,
  );
  expect(selected.map((v) => v.taskId)).toEqual(["required"]);
  expect(
    selected[0]!.reasons.some((v) => v.includes("nicht verlässlich")),
  ).toBe(true);
});
it("falls back to ordinary conscious selection for stale or unavailable data", () => {
  const entries = Array.from({ length: 6 }, (_, i) => task(String(i), 30));
  const stale = {
    ...view(0),
    reliable: false,
    state: "stale" as const,
    budget: null,
  };
  expect(calendarCandidates(entries, stale, day)).toHaveLength(5);
  expect(entries[0]!.reasons).toEqual([]);
});
