import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { TaskEditor } from "../../apps/web/components/tasks";
import { prepareTaskSave } from "../../packages/backend/src/tasks/save";
import type { ContextView, WorkSnapshot, TaskCommand } from "@helios/contracts";
import { tasks } from "../fixtures/todoist";
vi.mock("../../apps/web/components/ai-drafts", () => ({
  AiDraftPanel: () => null,
}));
const context = {
  id: "22222222-2222-4222-8222-222222222222",
  kind: "private",
  name: "Synthetisch",
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
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function setup(
  options: {
    previewFailure?: boolean;
    previewMalformed?: boolean;
    status?: string;
  } = {},
) {
  const task = {
    ...tasks[0]!,
    content: "Synthetische E9.6-Aufgabe",
    labels: [],
    description:
      "Originalnotiz.\n\n## Ziel\nAlt\n\n## Checkliste\n- [ ] Bestehend",
  };
  const inspection = {
    task,
    basis: "b".repeat(64),
    children: [],
    sections: [],
    comments: [],
    links: [],
    waiting: null,
  };
  const posts: TaskCommand[] = [],
    previews: unknown[] = [],
    close = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/tasks/preview") {
        const body = JSON.parse(String(init?.body));
        previews.push(body);
        if (options.previewMalformed) return Response.json({});
        if (options.previewFailure)
          throw new TypeError("synthetic read failure");
        return Response.json({
          basis: inspection.basis,
          before: task,
          fields: prepareTaskSave(
            task,
            body.fields,
            body.documents,
            body.acknowledgeRecurrenceChange,
          ),
        });
      }
      if (url === "/api/tasks/submit") {
        posts.push(JSON.parse(String(init?.body)));
        return Response.json({ operationId: "combined" });
      }
      if (url === "/api/tasks")
        return Response.json([
          {
            id: "combined",
            status: options.status ?? "succeeded",
            code: options.status ? "TODOIST_FIELDS_UNCONFIRMED" : null,
            result: {
              task,
              verification: {
                matched: ["content"],
                unmatched: options.status ? ["description"] : [],
              },
            },
            retryAt: null,
          },
        ]);
      if (url.startsWith("/api/epics?"))
        return Response.json({
          inspection,
          goal: "Alt",
          checklist: [{ text: "Bestehend", checked: false }],
          markdownError: null,
          children: [],
          unknownChildren: [],
          correction: "",
          correctionRevision: 0,
          cache: null,
        });
      return Response.json(inspection);
    }),
  );
  render(
    <TaskEditor
      snapshot={snapshot}
      context={context}
      taskId={task.id}
      close={close}
    />,
  );
  await screen.findByLabelText("Ziel", {});
  return { posts, previews, close, task };
}
async function changeWholeTask() {
  fireEvent.change(screen.getByLabelText("Titel", {}), {
    target: { value: "Gemeinsamer Titel" },
  });
  fireEvent.change(screen.getByLabelText("Ziel", {}), {
    target: { value: "Gemeinsames Ziel" },
  });
  fireEvent.change(screen.getByLabelText("Neuer Checklistenpunkt"), {
    target: { value: "Noch nicht per Plus hinzugefügt" },
  });
  fireEvent.change(screen.getByLabelText("Linkbezeichnung"), {
    target: { value: "Dokument" },
  });
  fireEvent.change(
    screen.getByLabelText("Dokumentenadresse (HTTP, HTTPS oder Obsidian)"),
    { target: { value: "https://example.com/e96" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  await act(async () => {});
  return screen.getByRole("dialog", {
    name: "Änderungen speichern",
  });
}
it("collects the entire task, previews without writing, preserves drafts on cancel and submits once after explicit confirmation", async () => {
  const { posts, previews, close } = await setup();
  let dialog = await changeWholeTask();
  expect(posts).toHaveLength(0);
  expect(previews).toHaveLength(1);
  expect(within(dialog).getByText("Checkliste (2)", {})).toBeVisible();
  expect(within(dialog).getByText("Dokumentenlink: Dokument")).toBeVisible();
  expect(
    within(dialog).getByText("Vorher / Nachher ansehen").closest("details"),
  ).not.toHaveAttribute("open");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Zurück zur Aufgabe" }),
  );
  expect(screen.getByLabelText("Ziel", {})).toHaveValue("Gemeinsames Ziel");
  expect(screen.getByLabelText("Neuer Checklistenpunkt")).toHaveValue(
    "Noch nicht per Plus hinzugefügt",
  );
  expect(close).not.toHaveBeenCalled();
  expect(posts).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  await act(async () => {});
  dialog = screen.getByRole("dialog", { name: "Änderungen speichern" });
  vi.useFakeTimers();
  const confirm = within(dialog).getByRole("button", {
    name: "Änderungen speichern",
  });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await act(async () => {});
  expect(posts).toHaveLength(1);
  expect(posts[0]!.documents?.map((c) => c.kind)).toEqual([
    "goal",
    "checklist",
    "link-add",
  ]);
  expect(posts[0]!.fields).toEqual({ content: "Gemeinsamer Titel" });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(close).toHaveBeenCalledOnce();
});
it.each(["unknown", "partial"])(
  "retains all document and core drafts after %s and never offers a second save",
  async (status) => {
    const { posts, close } = await setup({ status });
    const dialog = await changeWholeTask();
    vi.useFakeTimers();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Änderungen speichern" }),
    );
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(
      within(dialog).getByText(/Beschreibung: nicht nachgewiesen/),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Änderungen speichern" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Ziel", {})).toHaveValue("Gemeinsames Ziel");
    expect(screen.getByLabelText("Linkbezeichnung")).toHaveValue("Dokument");
    expect(posts).toHaveLength(1);
    expect(close).not.toHaveBeenCalled();
  },
);
it("treats a failed preview as a failed read, leaves edits available and never creates an operation", async () => {
  const { posts, close } = await setup({ previewFailure: true });
  fireEvent.change(screen.getByLabelText("Titel", {}), {
    target: { value: "Erhalten" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  await act(async () => {});
  expect(screen.getByRole("alert")).toHaveTextContent("geladen");
  expect(screen.getByRole("button", { name: "Speichern" })).toBeEnabled();
  expect(
    screen.queryByRole("dialog", { name: "Änderungen speichern" }),
  ).toBeNull();
  expect(posts).toHaveLength(0);
  expect(close).not.toHaveBeenCalled();
});

it("rejects a malformed read-only preview without crashing or accepting an unreviewed patch", async () => {
  const { posts, close } = await setup({ previewMalformed: true });
  fireEvent.change(screen.getByLabelText("Titel", { exact: true }), {
    target: { value: "Erhalten" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  await act(async () => {});
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Änderungsvorschau ist nicht vollständig",
  );
  expect(screen.getByLabelText("Titel", { exact: true })).toHaveValue(
    "Erhalten",
  );
  expect(
    screen.queryByRole("dialog", { name: "Änderungen speichern" }),
  ).toBeNull();
  expect(posts).toHaveLength(0);
  expect(close).not.toHaveBeenCalled();
});
