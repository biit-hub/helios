import { it, expect, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ContextView } from "@helios/contracts";
import { KanbanSetup } from "../../apps/web/components/kanban-setup";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("allows a fresh explicit section preview after verified setup without reusing the completed request", async () => {
  vi.useFakeTimers();
  let inspection = 0;
  const submitted: { key: string; sectionSetup: { missing: string[] } }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path.includes("kind=kanban")) {
        inspection++;
        return Response.json({
          projectId: "synthetic-project",
          contextRevision: 1,
          present: [],
          missing:
            inspection === 1 ? ["Wartet"] : inspection === 2 ? [] : ["Offen"],
          ambiguous: [],
        });
      }
      if (init?.method === "POST") {
        submitted.push(JSON.parse(init.body as string));
        return Response.json({ operationId: "operation-" + submitted.length });
      }
      return Response.json([
        {
          id: "operation-1",
          status: "succeeded",
          code: null,
          result: {},
          retryAt: null,
        },
      ]);
    }),
  );
  const context = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Synthetic context",
    kind: "private",
    theme: "copper",
    active: true,
    configured: true,
    projectId: "synthetic-project",
    revision: 1,
    termihubEmployerId: null,
    termihubInstanceRef: null,
    lastSyncAt: null,
  } as ContextView;
  render(<KanbanSetup context={context} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Kanban-Abschnitte prüfen" }),
  );
  await act(async () => {});
  fireEvent.click(
    screen.getByRole("button", { name: "Fehlende Abschnitte bewusst anlegen" }),
  );
  await act(async () => {});
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(
    screen.getByText("Alle vier Abschnitte sind in Todoist nachgewiesen."),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Kanban-Abschnitte prüfen" }),
  );
  await act(async () => {});
  const confirm = screen.getByRole("button", {
    name: "Fehlende Abschnitte bewusst anlegen",
  });
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  await act(async () => {});
  expect(submitted).toHaveLength(2);
  expect(submitted[0]!.sectionSetup.missing).toEqual(["Wartet"]);
  expect(submitted[1]!.sectionSetup.missing).toEqual(["Offen"]);
  expect(submitted[1]!.key).not.toBe(submitted[0]!.key);
});
