import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { InfoTip, UiDialog } from "../../apps/web/components/ui-help";
import { nativeTaskOrder } from "../../apps/web/components/task-list-order";
import { Workbench } from "../../apps/web/components/workbench";
import { tasks } from "../fixtures/todoist";
import type { TaskView, WorkSnapshot } from "@helios/contracts";
vi.mock("../../apps/web/components/termihub-settings", () => ({
  TermiHubConnection: () => null,
}));
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});
function row(
  id: string,
  order: number,
  parent: string | null = null,
  key?: string,
): TaskView {
  return {
    data: {
      ...tasks[0]!,
      id,
      project_id: "synthetic-project",
      section_id: "synthetic-section",
      parent_id: parent,
      child_order: order,
      order_key: key,
    },
    state: "active",
    sectionName: "Offen",
    retrievedAt: "2026-10-24T12:00:00Z",
  };
}
it("keeps native sibling order and hierarchy, supports fractional keys, and leaves the source unchanged", () => {
  const source = [
    row("b", 2),
    row("child-b", 2, "a"),
    row("a", 1),
    row("child-a", 1, "a"),
  ];
  const original = structuredClone(source);
  expect(nativeTaskOrder(source).map((t) => t.data.id)).toEqual([
    "a",
    "child-a",
    "child-b",
    "b",
  ]);
  expect(source).toEqual(original);
  expect(
    nativeTaskOrder([
      row("later", 1, null, "a2"),
      row("earlier", 2, null, "a1"),
    ]).map((t) => t.data.id),
  ).toEqual(["earlier", "later"]);
});
it("does not lose incomplete or cyclic hierarchy references", () => {
  const source = [
    row("a", 1, "b"),
    row("b", 2, "a"),
    row("orphan", 3, "missing"),
  ];
  expect(new Set(nativeTaskOrder(source).map((t) => t.data.id))).toEqual(
    new Set(source.map((t) => t.data.id)),
  );
});
it("opens tooltips through focus and tap, and Escape closes help without propagating to the dialog", () => {
  render(<InfoTip label="Beispiel">Kurze kontextuelle Hilfe</InfoTip>);
  const button = screen.getByRole("button", {
    name: "Information zu Beispiel",
  });
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.focus(button);
  expect(screen.getByRole("tooltip")).toBeVisible();
  fireEvent.click(button);
  expect(screen.getByRole("tooltip")).toBeVisible();
  fireEvent.keyDown(button, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
});
it("does not dismiss a running dialog on Escape", () => {
  const close = vi.fn();
  render(
    <UiDialog title="Prüfung" busy close={close}>
      Läuft
    </UiDialog>,
  );
  const event = new Event("cancel", { cancelable: true });
  screen.getByRole("dialog").dispatchEvent(event);
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Schliessen" })).toBeDisabled();
});
it("keeps general settings free of context pills and creates an employer using the existing guarded endpoint", async () => {
  const snapshot: WorkSnapshot = {
    contexts: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        kind: "private",
        name: "Privat",
        theme: "green",
        active: true,
        configured: false,
        projectId: null,
        revision: 0,
        termihubEmployerId: null,
        termihubInstanceRef: null,
        lastSyncAt: null,
      },
    ],
    projects: [],
    problems: [],
    integration: {
      revision: 0,
      enabled: false,
      hasToken: false,
      keyAvailable: true,
      state: "not_connected",
      lastCheckedAt: null,
      lastCatalogAt: null,
      nextAllowedAt: null,
    },
  };
  const posted: unknown[] = [];
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === "/api/work/context-save") {
      const input = JSON.parse(String(init?.body));
      posted.push(input);
      snapshot.contexts.push({
        ...snapshot.contexts[0]!,
        ...input,
        id: "22222222-2222-4222-8222-222222222222",
        kind: "employer",
        revision: 1,
      });
      return Response.json({ id: "22222222-2222-4222-8222-222222222222" });
    }
    return Response.json(snapshot);
  });
  vi.stubGlobal("fetch", fetcher);
  render(<Workbench settings />);
  await screen.findByRole("heading", { name: "Privater Kontext" });
  expect(screen.queryByRole("group", { name: "Kontext auswählen" })).toBeNull();
  const color = screen.getByRole("combobox", { name: /Kontextfarbe/ });
  expect(color.querySelectorAll("option")).toHaveLength(6);
  fireEvent.change(color, { target: { value: "gold" } });
  expect(
    screen.getByRole("img", { name: "Farbvorschau: Gold" }),
  ).toHaveAttribute("data-theme", "gold");
  fireEvent.click(screen.getByRole("tab", { name: "Arbeitgeber" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Arbeitgeber hinzufügen" }),
  );
  fireEvent.change(
    within(
      screen.getByRole("dialog", { name: "Arbeitgeber hinzufügen" }),
    ).getByLabelText("Anzeigename"),
    {
      target: { value: "Synthetischer Arbeitgeber" },
    },
  );
  fireEvent.click(
    within(
      screen.getByRole("dialog", { name: "Arbeitgeber hinzufügen" }),
    ).getByRole("button", { name: "Kontext speichern" }),
  );
  await act(async () => {});
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({
    name: "Synthetischer Arbeitgeber",
    revision: 0,
    projectId: null,
  });
  expect(screen.getByRole("combobox", { name: "Arbeitgeber" })).toHaveValue(
    "22222222-2222-4222-8222-222222222222",
  );
  expect(window.localStorage.getItem("helios.active-context")).not.toBe(
    "22222222-2222-4222-8222-222222222222",
  );
});
