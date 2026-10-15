import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Workbench } from "../../apps/web/components/workbench";
afterEach(() => vi.unstubAllGlobals());
it("keeps navigation disabled until a context save and its authoritative reload have finished", async () => {
  const context = {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "private",
    name: "Privat",
    theme: "copper",
    active: true,
    configured: false,
    projectId: null,
    revision: 0,
    termihubEmployerId: null,
    termihubInstanceRef: null,
    lastSyncAt: null,
  };
  const snapshot = {
    contexts: [context],
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
  let finishSave!: (r: Response) => void, finishReload!: (r: Response) => void;
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return new Promise<Response>((r) => (finishSave = r));
      if (path === "/api/work" && ++reads === 1)
        return Promise.resolve(Response.json(snapshot));
      return new Promise<Response>((r) => (finishReload = r));
    }),
  );
  render(<Workbench settings />);
  await act(async () => {});
  fireEvent.click(
    screen.getByRole("button", { name: "Kontext speichern", exact: true }),
  );
  expect(
    screen.getByRole("link", { name: "Aufgaben", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  await act(async () => finishSave(Response.json({ ok: true })));
  expect(
    screen.getByRole("link", { name: "Aufgaben", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  await act(async () =>
    finishReload(
      Response.json({ ...snapshot, contexts: [{ ...context, revision: 1 }] }),
    ),
  );
  expect(
    screen.getByRole("link", { name: "Aufgaben", exact: true }),
  ).toHaveAttribute("aria-disabled", "false");
  expect(
    screen.getByText("Gespeichert. Todoist-Inhalte bleiben unverändert."),
  ).toBeVisible();
});
