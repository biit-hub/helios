import { describe, it, expect, vi } from "vitest";
import {
  candidates,
  localDay,
  taskBasis,
} from "../../packages/backend/src/planning/selection";
import { createTodoistMover } from "../../packages/backend/src/planning/todoist";
import { tasks, projects } from "../fixtures/todoist";
import type { TaskView } from "@helios/contracts";
const row = (
  id: string,
  patch: Partial<TaskView["data"]> = {},
  extra: Partial<TaskView> = {},
): TaskView => ({
  data: { ...structuredClone(tasks[1]!), id, parent_id: null, ...patch },
  state: "active",
  sectionName: "Offen",
  retrievedAt: new Date().toISOString(),
  ...extra,
});
const select = (rows: TaskView[], kind = "employer") =>
  candidates(rows, projects[0]!.id, "2026-10-14", kind);
describe("deterministic contextual planning", () => {
  it("uses local calendar days across UTC midnight and DST", () => {
    expect(localDay(new Date("2026-10-14T22:30:00Z"))).toBe("2026-10-15");
    expect(localDay(new Date("2026-10-25T01:30:00Z"))).toBe("2026-10-25");
  });
  it("allows a small suitable stock and limits the main selection to five", () => {
    expect(select([row("one")])).toHaveLength(1);
    expect(
      select(Array.from({ length: 8 }, (_, i) => row(String(i)))),
    ).toHaveLength(5);
  });
  it("rejects foreign, unknown, deleted, completed, waiting and epic candidates", () => {
    expect(
      select([
        row("foreign", { project_id: "foreign" }),
        row("unknown", {}, { state: "unknown" }),
        row("deleted", { is_deleted: true }),
        row("done", { checked: true }),
        row("waiting", {}, { sectionName: "Wartet" }),
        row("epic", { labels: ["epic"] }),
      ]),
    ).toEqual([]);
  });
  it("never recommends children with unknown or blocked ancestors", () => {
    expect(select([row("child", { parent_id: "absent" })])).toEqual([]);
    expect(
      select([
        row("parent", {}, { sectionName: "Wartet" }),
        row("child", { parent_id: "parent" }),
      ]),
    ).toEqual([]);
  });
  it("distinguishes real deadlines, past planned dates and future scheduling", () => {
    const entries = select([
      row("past", { due: { date: "2026-10-12" } }),
      row("deadline", { deadline: { date: "2026-10-13" } }),
      row("future", { due: { date: "2026-10-20" } }),
    ]);
    expect(entries.map((e) => e.taskId)).toEqual(["deadline", "past"]);
    expect(entries[0]!.reasons).toContain("Echte Deadline: 2026-10-13.");
  });
  it("does not prefer In Arbeit and preserves private obligations without inventing progress", () => {
    const entries = select(
      [
        row("fun", { labels: ["fun"] }, { sectionName: "In Arbeit" }),
        row("duty"),
      ],
      "private",
    );
    expect(entries.map((e) => e.taskId)).toEqual(["duty", "fun"]);
    expect(JSON.stringify(entries)).not.toMatch(/Fortschritt|%/);
  });
  it("sorts urgent fun by real deadline before an undated obligation", () => {
    expect(
      select(
        [
          row("duty"),
          row("fun", { labels: ["fun"], deadline: { date: "2026-10-14" } }),
        ],
        "private",
      )[0]!.taskId,
    ).toBe("fun");
  });
  it("uses meaningful fingerprints while allowing only own placement timestamps to differ", () => {
    const t = row("one").data;
    expect(taskBasis(t)).toBe(
      taskBasis({ ...t, section_id: "other", updated_at: "new" }),
    );
    expect(taskBasis(t)).not.toBe(taskBasis({ ...t, content: "changed" }));
    expect(taskBasis(t)).not.toBe(taskBasis({ ...t, parent_id: "other" }));
  });
  it("writes only the narrow section move with a stable request ID and rejects redirects", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({}));
    await createTodoistMover(fetcher).move(
      "synthetic",
      "task/opaque",
      "section/opaque",
      "00000000-0000-4000-8000-000000000001",
    );
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.todoist.com/api/v1/tasks/task%2Fopaque/move",
    );
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("error");
    expect(JSON.parse(String(init?.body))).toEqual({
      section_id: "section/opaque",
    });
  });
});
