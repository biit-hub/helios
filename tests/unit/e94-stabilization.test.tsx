import { tasks } from "../fixtures/todoist";
import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { ContextView, WorkSnapshot } from "@helios/contracts";
import { TaskManager } from "../../apps/web/components/tasks";
vi.mock("../../apps/web/components/agenda", () => ({
  TaskPlanProvider: ({ children }: { children: ReactNode }) => children,
  AddToPlan: () => null,
}));
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
it("consumes the explicit progress request before a context remount and reload", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json([])),
  );
  const context = {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "private",
    name: "Privat",
    theme: "green",
    active: true,
    configured: true,
    projectId: tasks[0]!.project_id,
    revision: 1,
    termihubEmployerId: null,
    termihubInstanceRef: null,
    lastSyncAt: null,
  } satisfies ContextView;
  const snapshot = {
    contexts: [context],
    projects: [],
    problems: [],
    integration: {
      revision: 1,
      enabled: true,
      hasToken: true,
      keyAvailable: true,
      state: "ready",
      lastCheckedAt: null,
      lastCatalogAt: null,
      nextAllowedAt: null,
    },
  } satisfies WorkSnapshot;
  window.history.replaceState(
    null,
    "",
    "/tasks?context=" + context.id + "&progress=pick&keep=1",
  );
  const props = { tasks: [], context, snapshot, renderTask: () => null };
  const view = render(<TaskManager {...props} />);
  expect(
    await screen.findByRole("dialog", {
      name: "Fortschritt: Aufgabe auswählen",
    }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Schliessen" }));
  expect(new URL(window.location.href).searchParams.get("progress")).toBeNull();
  expect(new URL(window.location.href).searchParams.get("keep")).toBe("1");
  view.unmount();
  render(
    <TaskManager
      {...props}
      context={{ ...context, id: "22222222-2222-4222-8222-222222222222" }}
    />,
  );
  await act(async () => {});
  expect(
    screen.queryByRole("dialog", { name: "Fortschritt: Aufgabe auswählen" }),
  ).toBeNull();
});

it("formats today's Zurich calendar date independently from a selected planning day", async () => {
  const { headerDate } = await import("../../apps/web/components/task-dates");
  expect(headerDate(new Date("2026-10-24T22:30:00Z"))).toBe("25.10.2026");
  expect(headerDate(new Date("2026-10-25T23:30:00Z"))).toBe("26.10.2026");
});
it.each([
  ["2026-10-27", "14:00", "2026-10-27T13:00:00.000Z"],
  ["2027-07-20", "14:00", "2027-07-20T12:00:00.000Z"],
])(
  "round-trips %s at %s in Zurich independently of browser timezone",
  async (date, time, utc) => {
    const { taskDateTime, taskDateInputs } =
      await import("../../apps/web/components/task-dates");
    expect(taskDateTime(date, time, "Europe/Zurich")).toBe(utc);
    expect(taskDateInputs({ date: utc }, "Europe/Zurich")).toEqual({
      date,
      time,
    });
  },
);
it.each([
  ["2026-03-29", "02:30"],
  ["2026-10-25", "02:30"],
])(
  "rejects nonexistent or ambiguous local DST time %s %s",
  async (date, time) => {
    const { taskDateTime } =
      await import("../../apps/web/components/task-dates");
    expect(() => taskDateTime(date, time, "Europe/Zurich")).toThrow(
      /Zeitumstellung/,
    );
  },
);
it("distinguishes duplicate project names without displaying or changing their IDs", async () => {
  const { optionNames } =
    await import("../../apps/web/components/option-names");
  const rows = [
    { id: "synthetic-b", name: "Privat" },
    { id: "synthetic-a", name: "Privat" },
    { id: "synthetic-c", name: "Arbeit" },
  ];
  const labels = optionNames(rows, "Projekt");
  expect(labels.get("synthetic-a")).toBe("Privat · Projekt 1");
  expect(labels.get("synthetic-b")).toBe("Privat · Projekt 2");
  expect(labels.get("synthetic-c")).toBe("Arbeit");
  expect(optionNames([...rows].reverse(), "Projekt")).toEqual(labels);
  expect(rows[0]!.id).toBe("synthetic-b");
});
it("shows partial field evidence without claiming a plan or offering automatic replay", async () => {
  const { TaskOperationEvidence } =
    await import("../../apps/web/components/task-operation-evidence");
  render(
    <TaskOperationEvidence
      operation={{
        id: "synthetic-operation",
        status: "unknown",
        code: "TODOIST_FIELDS_UNCONFIRMED",
        retryAt: null,
        result: {
          verification: {
            matched: ["due_datetime"],
            unmatched: ["duration"],
            acknowledged: true,
            checkedAt: "2026-10-24T12:00:00Z",
          },
          pending: { requestId: "synthetic-request" },
        },
      }}
    />,
  );
  expect(screen.getByText("Datum und Uhrzeit: nachgewiesen")).toBeVisible();
  expect(screen.getByText("Dauer: nicht nachgewiesen")).toBeVisible();
  expect(screen.getByText(/Gesamtänderung bleibt ungeklärt/)).toBeVisible();
  expect(screen.getByText("synthetic-operation")).not.toBeVisible();
  expect(screen.queryByRole("button")).toBeNull();
});
