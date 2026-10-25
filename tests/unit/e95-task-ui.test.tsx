import { entryKey } from "@helios/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { TaskEditor } from "../../apps/web/components/tasks";
import {
  TaskProperties,
  displayDescription,
} from "../../apps/web/components/task-properties";
import { TaskComments } from "../../apps/web/components/task-comments";
import { InfoTip } from "../../apps/web/components/ui-help";
import { TaskMarkdown } from "../../apps/web/components/task-markdown";
import type {
  TaskCommand,
  TaskInspection,
  TaskView,
  WorkSnapshot,
} from "@helios/contracts";
import { tasks } from "../fixtures/todoist";
vi.mock("../../apps/web/components/ai-drafts", () => ({
  AiDraftPanel: ({ active }: { active: boolean }) =>
    active ? (
      <div className="ai-panel">
        <label>
          Unfertige KI-Eingabe
          <textarea />
        </label>
      </div>
    ) : null,
}));
vi.mock("../../apps/web/components/task-document", () => ({
  TaskDocument: ({ onVerified }: { onVerified?: () => void }) => (
    <button type="button" onClick={onVerified}>
      Dokumentnachweis nachlesen
    </button>
  ),
}));
const context = {
  id: "11111111-1111-4111-8111-111111111111",
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
} as const;
const snapshot: WorkSnapshot = {
  contexts: [context],
  projects: [
    {
      id: context.projectId,
      name: "Testprojekt",
      inbox: false,
      available: true,
      assignedTo: context.id,
    },
  ],
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
const inspection: TaskInspection = {
  task: { ...tasks[0]!, labels: ["Dokumentation"] },
  basis: "a".repeat(64),
  comments: [],
  links: [],
  children: [],
  waiting: null,
  sections: [
    { id: "section:new", name: "In Arbeit", project_id: context.projectId },
  ],
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function provision(status = "queued", source = inspection) {
  const calls: TaskCommand[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/tasks/preview") {
        const body = JSON.parse(init!.body as string);
        return Response.json({
          basis: inspection.basis,
          before: inspection.task,
          fields: body.fields,
        });
      }
      if (url === "/api/tasks/submit") {
        calls.push(JSON.parse(init!.body as string));
        return Response.json({ operationId: "op" });
      }
      if (url === "/api/tasks")
        return Response.json([
          {
            id: "op",
            status,
            code: status === "unknown" ? "TODOIST_FIELDS_UNCONFIRMED" : null,
            result: {
              verification: { matched: ["due"], unmatched: ["duration"] },
            },
            retryAt: null,
          },
        ]);
      if (url.includes("projectId="))
        return Response.json({
          sections: source.sections,
          parents: [
            { id: source.task.id, content: source.task.content },
            { id: "valid-parent", content: "Zulässige Oberaufgabe" },
            ...source.children,
          ],
        });
      return Response.json(source);
    }),
  );
  return calls;
}
async function editor() {
  const close = vi.fn();
  render(
    <TaskEditor
      snapshot={snapshot}
      context={context}
      taskId={inspection.task.id}
      close={close}
    />,
  );
  await screen.findByDisplayValue(inspection.task.content);
  return close;
}
async function saveTask() {
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  await act(async () => {});
  const dialog = screen.getByRole("dialog", { name: "Änderungen speichern" });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Änderungen speichern" }),
  );
  await act(async () => {});
}
it("labels properties, separates waiting details and keeps native source untouched", () => {
  const waiting = {
    who: "Testteam",
    subject: "Freigabe",
    followUp: "2026-10-28",
  };
  const description =
    "## Notizen\n**Original** bleibt.\n\n## Helios – Wartedetails\nWartet auf: Testteam\nGegenstand: Freigabe\nNachfassen am: 2026-10-28\n\n## Danach\nErhalten";
  const task: TaskView = {
    data: { ...inspection.task, description },
    state: "active",
    sectionName: "Wartet",
    waiting,
    retrievedAt: "2026-10-25T08:00:00Z",
  };
  render(<TaskProperties task={task} status="Wartet" />);
  expect(screen.getByText("Geplantes Datum")).toBeVisible();
  expect(screen.getByText("Geplante Uhrzeit")).toBeVisible();
  expect(screen.getByText("30 Minuten")).toBeVisible();
  expect(screen.getByText("28.10.2026")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Beschreibung" })).toBeVisible();
  expect(screen.getByText("Original")).toBeVisible();
  expect(screen.queryByText("Helios – Wartedetails")).toBeNull();
  expect(screen.getByText("Erhalten")).toBeVisible();
  expect(task.data.description).toBe(description);
  expect(screen.queryByText(task.data.id)).toBeNull();
  expect(
    displayDescription(description + "\n" + description, waiting),
  ).toContain("## Helios – Wartedetails");
});
it("renders Markdown without executing HTML or unsafe URLs", () => {
  const { container } = render(
    <TaskMarkdown
      text={
        "<script>bad()</script>\n[Unsicher](javascript:bad)\n[Sicher](https://example.com/note)\n**Wichtig**"
      }
    />,
  );
  expect(container.querySelector("script")).toBeNull();
  expect(screen.queryByRole("link", { name: "Unsicher" })).toBeNull();
  expect(screen.getByRole("link", { name: "Sicher" })).toHaveAttribute(
    "href",
    "https://example.com/note",
  );
  expect(screen.getByText("Wichtig").tagName).toBe("STRONG");
});
it("loads comments only on opening, deduplicates concurrent reads and permits explicit error retry", async () => {
  let finish: (
    rows: { id: string; content: string; posted_at: null }[],
  ) => void = () => {};
  const load = vi
    .fn()
    .mockRejectedValueOnce(Error("Testausfall"))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  load.mockResolvedValue([
    { id: "c2", content: "Neu nachgelesen", posted_at: null },
  ]);
  const { container } = render(<TaskComments load={load} />);
  expect(load).not.toHaveBeenCalled();
  const details = container.querySelector("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Testausfall");
  fireEvent.click(
    screen.getByRole("button", { name: "Kommentare erneut laden" }),
  );
  fireEvent(details, new Event("toggle"));
  expect(load).toHaveBeenCalledTimes(2);
  await act(async () =>
    finish([{ id: "c1", content: "Geprüfter Kommentar", posted_at: null }]),
  );
  expect(await screen.findByText("Geprüfter Kommentar")).toBeVisible();
  details.open = false;
  fireEvent(details, new Event("toggle"));
  details.open = true;
  fireEvent(details, new Event("toggle"));
  expect(await screen.findByText("Neu nachgelesen")).toBeVisible();
  expect(load).toHaveBeenCalledTimes(3);
});
it("cancels an unchanged editor without mutation and protects changed fields", async () => {
  const calls = provision(),
    close = await editor(),
    confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
  expect(close).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Titel", { exact: true }), {
    target: { value: "Entwurf" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
  expect(confirm).toHaveBeenCalledWith("Entwurf verwerfen?");
  expect(close).toHaveBeenCalledOnce();
  expect(calls).toHaveLength(0);
});
it("saves through the existing journal and changes only fun without losing other labels", async () => {
  const calls = provision();
  await editor();
  const toggle = screen.getByRole("switch", { name: "Freiwillig / Spass" });
  fireEvent.click(toggle);
  expect(toggle).toBeChecked();
  await saveTask();
  await act(async () => {});
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    action: "update",
    basis: inspection.basis,
    fields: { labels: ["Dokumentation", "fun"] },
    acknowledgeDestructive: false,
  });
  expect(Object.keys(calls[0]!.fields!)).toEqual(["labels"]);
});
it.each([
  ["Aufgabe löschen", "Aufgabe endgültig löschen", "delete"],
  ["Aufgabe abschliessen", "Abschluss bestätigen", "close"],
])(
  "requires a separate explicit %s confirmation",
  async (label, button, action) => {
    const calls = provision();
    await editor();
    fireEvent.click(screen.getByRole("button", { name: label }));
    const dialog = screen.getByRole("dialog", { name: label });
    expect(calls).toHaveLength(0);
    expect(within(dialog).queryByRole("checkbox")).toBeNull();
    const confirmButton = within(dialog).getByRole("button", {
      name: button,
    });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    await act(async () => {});
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ action, acknowledgeDestructive: true });
  },
);
it("does not lose an edited draft through a direct action without acknowledgement", async () => {
  const calls = provision();
  await editor();
  fireEvent.change(screen.getByLabelText("Titel", { exact: true }), {
    target: { value: "Entwurf behalten" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Aufgabe löschen" }));
  const dialog = screen.getByRole("dialog", {
    name: "Aufgabe löschen",
  });
  expect(
    within(dialog).getByRole("button", { name: "Aufgabe endgültig löschen" }),
  ).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
  expect(calls).toHaveLength(0);
  expect(screen.getByLabelText("Titel", { exact: true })).toHaveValue(
    "Entwurf behalten",
  );
});
it.each(["comment", "wait", "move"])(
  "keeps %s as a deliberate separate journal command",
  async (action) => {
    const calls = provision();
    await editor();
    const label =
      action === "comment"
        ? "Kommentar hinzufügen"
        : action === "wait"
          ? "Warten"
          : "Verschieben";
    fireEvent.click(screen.getByRole("button", { name: label }));
    const dialog = screen.getByRole("dialog", { name: label });
    expect(calls).toHaveLength(0);
    if (action === "comment")
      fireEvent.change(
        within(dialog).getByLabelText("Kommentar", { exact: true }),
        { target: { value: "Bewusster Kommentar" } },
      );
    if (action === "wait") {
      fireEvent.change(within(dialog).getByLabelText("Wartet auf"), {
        target: { value: "Testteam" },
      });
      fireEvent.change(within(dialog).getByLabelText("Gegenstand"), {
        target: { value: "Freigabe" },
      });
    }
    if (action === "move")
      fireEvent.change(within(dialog).getByLabelText("Zielabschnitt"), {
        target: { value: "section:new" },
      });
    fireEvent.click(
      within(dialog).getByRole("button", {
        name:
          action === "comment"
            ? "Kommentar absenden"
            : action === "wait"
              ? "Warten bestätigen"
              : "Verschieben bestätigen",
      }),
    );
    await act(async () => {});
    expect(calls).toHaveLength(1);
    expect(calls[0]!.action).toBe(action);
    expect(calls[0]!.fields).toBeUndefined();
    if (action === "move")
      expect(calls[0]).toMatchObject({ sectionId: "section:new" });
  },
);
it.each(["unknown", "partial"])(
  "keeps %s visible, preserves inputs and does not replay a mutation",
  async (status) => {
    const calls = provision(status);
    const close = await editor();
    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText("Titel", { exact: true }), {
      target: { value: "Nicht verlieren" },
    });
    await saveTask();
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(calls).toHaveLength(1);
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Fortschritt dokumentieren" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Aufgabenklärung" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Titel", { exact: true })).toHaveValue(
      "Nicht verlieren",
    );
  },
);

it("waits for an existing read pause to end before loading an already open comment section", async () => {
  const load = vi.fn(async () => [
    {
      id: "after-pause",
      content: "Nach der Pause sicher geladen",
      posted_at: null,
    },
  ]);
  const view = render(<TaskComments disabled load={load} />);
  const details = view.container.querySelector("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  await act(async () => {});
  expect(load).not.toHaveBeenCalled();
  view.rerender(<TaskComments disabled={false} load={load} />);
  expect(
    await screen.findByText("Nach der Pause sicher geladen"),
  ).toBeVisible();
  expect(load).toHaveBeenCalledOnce();
});
it.each(["transport", "server", "acknowledgement"])(
  "blocks changed requests after a %s submit failure and recovers only by reading the same journal key",
  async (kind) => {
    const posts: TaskCommand[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/tasks/preview") {
          const body = JSON.parse(init!.body as string);
          return Response.json({
            basis: inspection.basis,
            before: inspection.task,
            fields: body.fields,
          });
        }
        if (url === "/api/tasks/submit") {
          posts.push(JSON.parse(init!.body as string));
          if (kind === "transport") throw new TypeError("synthetic lost reply");
          if (kind === "acknowledgement") return Response.json({});
          return Response.json(
            { error: { message: "Synthetic server response" } },
            { status: 500 },
          );
        }
        if (url === "/api/tasks")
          return Response.json([
            {
              id: "uncertain-submit",
              status: "unknown",
              code: "OUTCOME_UNKNOWN",
              retryAt: null,
              result: null,
              input: posts[0],
            },
          ]);
        return Response.json(inspection);
      }),
    );
    const close = await editor();
    fireEvent.change(screen.getByLabelText("Titel", { exact: true }), {
      target: { value: "Originaleingabe erhalten" },
    });
    await saveTask();
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
    expect(screen.getByLabelText("Titel", { exact: true })).toHaveValue(
      "Originaleingabe erhalten",
    );
    expect(posts).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Schreibauftrag im Journal prüfen",
      }),
    );
    await act(async () => {});
    expect(posts).toHaveLength(1);
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
  },
);

it("shows refreshed inspection comments without retaining an outdated initial array", () => {
  const load = vi.fn();
  const view = render(
    <TaskComments
      comments={[{ id: "initial", content: "Vorher", posted_at: null }]}
      load={load}
    />,
  );
  const details = view.container.querySelector("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  view.rerender(
    <TaskComments
      comments={[
        { id: "fresh", content: "Frisch nachgelesen", posted_at: null },
      ]}
      load={load}
    />,
  );
  expect(screen.getByText("Frisch nachgelesen")).toBeVisible();
  expect(screen.queryByText("Vorher")).toBeNull();
  expect(load).not.toHaveBeenCalled();
});

it("does not present a changed draft when the initial native source could not be loaded", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { error: { message: "Quelle nicht verfügbar" } },
        { status: 503 },
      ),
    ),
  );
  const close = vi.fn(),
    confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(
    <TaskEditor
      snapshot={snapshot}
      context={context}
      taskId={inspection.task.id}
      close={close}
    />,
  );
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
  expect(close).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
});
it("does not offer known non-private project targets for a native fun task", async () => {
  provision("queued", {
    ...inspection,
    task: { ...inspection.task, labels: ["fun"] },
  });
  const extended = {
    ...snapshot,
    projects: [
      ...snapshot.projects,
      {
        id: "synthetic-work",
        name: "Berufliches Ziel",
        inbox: false,
        available: true,
        assignedTo: null,
      },
      {
        id: "synthetic-inbox",
        name: "Eingang",
        inbox: true,
        available: true,
        assignedTo: null,
      },
    ],
  };
  render(
    <TaskEditor
      snapshot={extended}
      context={context}
      taskId={inspection.task.id}
      close={vi.fn()}
    />,
  );
  await screen.findByDisplayValue(inspection.task.content);
  fireEvent.click(screen.getByRole("button", { name: "Verschieben" }));
  const dialog = screen.getByRole("dialog", { name: "Verschieben" });
  fireEvent.change(within(dialog).getByRole("combobox", { name: "Zielart" }), {
    target: { value: "project" },
  });
  expect(dialog.querySelector('option[value="synthetic-work"]')).toBeNull();
  expect(dialog.querySelector('option[value="synthetic-inbox"]')).toBeNull();
});

it("retains the existing discard protection for unfinished AI input inside the task editor", async () => {
  const calls = provision(),
    close = await editor(),
    confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.click(
    screen.getByRole("button", { name: "Fortschritt dokumentieren" }),
  );
  fireEvent.change(screen.getByLabelText("Unfertige KI-Eingabe"), {
    target: { value: "Originalwortlaut behalten" },
  });
  expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
  expect(confirm).toHaveBeenCalledWith("Entwurf verwerfen?");
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Unfertige KI-Eingabe")).toHaveValue(
    "Originalwortlaut behalten",
  );
  expect(calls).toHaveLength(0);
});

it("does not adopt another recurrence instance when refreshing after a document operation from review", async () => {
  const source: TaskInspection = {
    ...inspection,
    task: {
      ...inspection.task,
      due: { date: "2026-10-25", is_recurring: true, string: "every week" },
    },
  };
  const next: TaskInspection = {
    ...source,
    basis: "c".repeat(64),
    task: {
      ...source.task,
      due: { date: "2026-11-01", is_recurring: true, string: "every week" },
    },
  };
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      Response.json(
        path.startsWith("/api/tasks?contextId=")
          ? reads++ === 0
            ? source
            : next
          : { labels: [] },
      ),
    ),
  );
  render(
    <TaskEditor
      snapshot={snapshot}
      context={context}
      taskId={source.task.id}
      expectedInstanceKey={entryKey({
        taskId: source.task.id,
        source: source.task,
      })}
      close={vi.fn()}
    />,
  );
  await screen.findByDisplayValue(source.task.content);
  expect(screen.getByText("Aktuelle Wiederholung: every week")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Dokumentnachweis nachlesen" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(/Aufgabeninstanz/);
  expect(screen.getByLabelText("Geplantes Datum")).toHaveValue("2026-10-25");
  expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
});

it("retains the due follow-up hint inside the structured waiting property", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-29T00:30:00Z"));
  const task: TaskView = {
    data: inspection.task,
    state: "active",
    sectionName: "Wartet",
    retrievedAt: "2026-10-25T08:00:00Z",
    waiting: { who: "Testteam", subject: "Freigabe", followUp: "2026-10-28" },
  };
  render(<TaskProperties task={task} status="Wartet" />);
  expect(screen.getByText("28.10.2026 · fällig")).toBeVisible();
});

it("keeps a tapped tooltip open through compatibility mouseleave and touch pointerout while preserving mouse hover, Escape and blur", () => {
  const { container } = render(<InfoTip label="Test">Erklärung</InfoTip>);
  const button = screen.getByRole("button", { name: "Information zu Test" });
  const wrapper = container.querySelector(".ux-tooltip")!;
  const pointer = (type: string, pointerType: string) => {
    const event = new MouseEvent(type, { bubbles: true });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    fireEvent(wrapper, event);
  };
  fireEvent.click(button);
  fireEvent.mouseLeave(wrapper);
  pointer("pointerout", "touch");
  expect(screen.getByRole("tooltip")).toBeVisible();
  fireEvent.keyDown(button, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  pointer("pointerover", "mouse");
  expect(screen.getByRole("tooltip")).toBeVisible();
  pointer("pointerout", "mouse");
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.focus(button);
  expect(screen.getByRole("tooltip")).toBeVisible();
  fireEvent.blur(button);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});
