import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { TaskDocument } from "../../apps/web/components/task-document";
import type { ContextView, EpicDetail, WorkSnapshot } from "@helios/contracts";
import { tasks } from "../fixtures/todoist";
vi.mock("../../apps/web/components/ai-drafts", () => ({
  AiDraftPanel: () => null,
}));
const context = {
  id: "22222222-2222-4222-8222-222222222222",
  kind: "private",
  name: "Dokumenttest",
  theme: "green",
  active: true,
  configured: true,
  projectId: tasks[0]!.project_id,
  revision: 1,
  termihubEmployerId: null,
  termihubInstanceRef: null,
  lastSyncAt: null,
} satisfies ContextView;
const snapshot: WorkSnapshot = {
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
};
function source(): EpicDetail {
  return {
    inspection: {
      task: { ...tasks[0]!, labels: [] },
      basis: "b".repeat(64),
      children: [],
      sections: [],
      comments: [],
      links: [
        { url: "https://example.com/doc", label: "Bestehende Dokumentation" },
      ],
      waiting: null,
    },
    goal: "Ursprüngliches Ziel",
    checklist: [{ text: "Quellen prüfen", checked: false }],
    markdownError: null,
    children: [],
    unknownChildren: [],
    correction: "",
    correctionRevision: 0,
    cache: null,
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it.each(["network", "malformed"])(
  "reconciles a %s document-submit reply by its original key without replay",
  async (failure) => {
    const posts: Record<string, unknown>[] = [];
    let found = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === "/api/epics/preview")
          return Response.json({
            before: "vorher",
            after: "nachher",
            basis: "b".repeat(64),
            change: { kind: "goal", value: "Bewusster Entwurf" },
          });
        if (path === "/api/tasks/submit") {
          posts.push(JSON.parse(init!.body as string));
          if (failure === "network")
            throw new TypeError("Synthetic lost reply");
          return Response.json({});
        }
        if (path === "/api/tasks")
          return Response.json(
            found
              ? [
                  {
                    id: "original-op",
                    input: { key: posts[0]!.key },
                    status: "unknown",
                    code: "OUTCOME_UNKNOWN",
                    result: null,
                    retryAt: null,
                  },
                ]
              : [],
          );
        return Response.json(source());
      }),
    );
    render(
      <TaskDocument
        context={context}
        taskId={tasks[0]!.id}
        snapshot={snapshot}
      />,
    );
    await screen.findByLabelText("Ziel", { exact: true });
    fireEvent.click(screen.getByText("Ziel", { selector: "summary span" }));
    fireEvent.change(screen.getByLabelText("Ziel", { exact: true }), {
      target: { value: "Bewusster Entwurf" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Zieländerung prüfen" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Änderungen speichern",
    });
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Änderung bewusst bestätigen",
      }),
    );
    const check = await within(dialog).findByRole("button", {
      name: "Dokumentauftrag im Journal prüfen",
    });
    expect(
      within(dialog).getByRole("button", {
        name: "Änderung bewusst bestätigen",
      }),
    ).toBeDisabled();
    fireEvent.click(check);
    await within(dialog).findByText(
      "Noch kein eindeutig zuordenbarer Journalnachweis. Nicht erneut senden.",
    );
    found = true;
    fireEvent.click(check);
    await within(dialog).findByText(/Operationsstand: unknown/);
    expect(posts).toHaveLength(1);
    expect(screen.getByLabelText("Ziel", { exact: true })).toHaveValue(
      "Bewusster Entwurf",
    );
    expect(
      within(dialog).getByRole("button", {
        name: "Änderung bewusst bestätigen",
      }),
    ).toBeDisabled();
  },
);
it("offers flat sections, counts checklist changes, supports plus/Enter and keeps links validated", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(source())),
  );
  const state = vi.fn(),
    { container } = render(
      <TaskDocument
        context={context}
        taskId={tasks[0]!.id}
        snapshot={snapshot}
        onStateChange={state}
      />,
    );
  await screen.findByLabelText("Ziel", { exact: true });
  expect(container.querySelector("details details")).toBeNull();
  const checklist = screen.getByText("Checkliste (1)").closest("details")!;
  fireEvent.click(within(checklist).getByText("Checkliste (1)"));
  fireEvent.change(within(checklist).getByLabelText("Neuer Checklistenpunkt"), {
    target: { value: "Synthetischer neuer Punkt" },
  });
  fireEvent.click(
    within(checklist).getByRole("button", {
      name: "Checklistenpunkt hinzufügen",
    }),
  );
  expect(screen.getByText("Checkliste (2)")).toBeVisible();
  fireEvent.click(
    within(checklist).getByRole("checkbox", { name: "Punkt 2 erledigt" }),
  );
  expect(
    within(checklist).getByRole("checkbox", { name: "Punkt 2 erledigt" }),
  ).toBeChecked();
  fireEvent.change(within(checklist).getByLabelText("Neuer Checklistenpunkt"), {
    target: { value: "Dritter Punkt" },
  });
  fireEvent.keyDown(
    within(checklist).getByLabelText("Neuer Checklistenpunkt"),
    { key: "Enter" },
  );
  expect(screen.getByText("Checkliste (3)")).toBeVisible();
  fireEvent.click(
    within(checklist).getByRole("button", { name: "Punkt 3 löschen" }),
  );
  expect(screen.getByText("Checkliste (2)")).toBeVisible();
  fireEvent.click(screen.getByText("Dokumentenlinks", { exact: true }));
  expect(
    screen.getByRole("link", { name: "Bestehende Dokumentation" }),
  ).toHaveAttribute("href", "https://example.com/doc");
  fireEvent.change(screen.getByLabelText("Linkbezeichnung"), {
    target: { value: "Unsicher" },
  });
  fireEvent.change(
    screen.getByLabelText("Dokumentenadresse (HTTP, HTTPS oder Obsidian)"),
    { target: { value: "javascript:bad" } },
  );
  expect(
    screen.getByRole("button", { name: "Neuen Link prüfen" }),
  ).toBeDisabled();
  expect(state).toHaveBeenLastCalledWith(
    expect.objectContaining({ dirty: true, pending: false }),
  );
});
it.each(["succeeded", "unknown", "partial"])(
  "retains unrelated checklist drafts after a %s goal operation without replay",
  async (status) => {
    let detail = source();
    const posts: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === "/api/epics/preview")
          return Response.json({
            before: "vorher",
            after: "nachher",
            basis: detail.inspection.basis,
            change: { kind: "goal", value: "Neues Ziel" },
          });
        if (path === "/api/tasks/submit") {
          posts.push(JSON.parse(init!.body as string));
          if (status === "succeeded")
            detail = { ...detail, goal: "Neues Ziel" };
          return Response.json({ operationId: "doc-op" });
        }
        if (path === "/api/tasks")
          return Response.json([
            { id: "doc-op", status, code: null, result: null, retryAt: null },
          ]);
        return Response.json(detail);
      }),
    );
    const verified = vi.fn(),
      state = vi.fn();
    render(
      <TaskDocument
        context={context}
        taskId={tasks[0]!.id}
        snapshot={snapshot}
        onVerified={verified}
        onStateChange={state}
      />,
    );
    await screen.findByLabelText("Ziel", { exact: true });
    fireEvent.click(screen.getByText("Ziel", { selector: "summary span" }));
    fireEvent.click(screen.getByText("Checkliste (1)"));
    fireEvent.change(
      screen.getByLabelText("Checklistenpunkt 1", { exact: true }),
      { target: { value: "Ungespeicherte Checkliste behalten" } },
    );
    fireEvent.change(screen.getByLabelText("Ziel", { exact: true }), {
      target: { value: "Neues Ziel" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Zieländerung prüfen" }),
    );
    await screen.findByRole("dialog", { name: "Änderungen speichern" });
    vi.useFakeTimers();
    fireEvent.click(
      screen.getByRole("button", { name: "Änderung bewusst bestätigen" }),
    );
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(posts).toHaveLength(1);
    expect(
      screen.getByLabelText("Checklistenpunkt 1", { exact: true }),
    ).toHaveValue("Ungespeicherte Checkliste behalten");
    expect(state).toHaveBeenLastCalledWith(
      expect.objectContaining({ dirty: true, pending: status !== "succeeded" }),
    );
    if (status === "succeeded") expect(verified).toHaveBeenCalledOnce();
    else {
      expect(verified).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: "Änderung bewusst bestätigen" }),
      ).toBeDisabled();
    }
  },
);
