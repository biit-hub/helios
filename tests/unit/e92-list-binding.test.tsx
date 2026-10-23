import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { tasks as syntheticTasks } from "../fixtures/todoist";
import { Workbench } from "../../apps/web/components/workbench";
import type { TaskList, WorkSnapshot } from "@helios/contracts";
vi.mock("../../apps/web/components/tasks", () => ({
  TaskCapture: () => null,
  TaskManager: ({ tasks }: { tasks: { data: { content: string } }[] }) => (
    <div aria-label="Current test tasks">
      {tasks.map((t) => (
        <p key={t.data.content}>{t.data.content}</p>
      ))}
    </div>
  ),
}));
const privateId = "11111111-1111-4111-8111-111111111111",
  workId = "22222222-2222-4222-8222-222222222222";
const base = {
  kind: "private",
  name: "Private test",
  theme: "copper",
  active: true,
  configured: true,
  projectId: "private-project",
  revision: 1,
  termihubEmployerId: null,
  termihubInstanceRef: null,
  lastSyncAt: "2026-10-23T08:00:00Z",
} as const;
const snapshot: WorkSnapshot = {
  contexts: [
    { ...base, id: privateId },
    {
      ...base,
      id: workId,
      name: "Work test",
      kind: "employer",
      projectId: "work-project",
    },
  ],
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
function list(projectId: string, revision: number, title: string) {
  return {
    projectId,
    contextRevision: revision,
    tasks: [
      {
        data: {
          ...syntheticTasks[1]!,
          id: title,
          content: title,
          project_id: projectId,
        },
        state: "active",
        sectionName: null,
        retrievedAt: "2026-10-23T08:00:00Z",
      },
    ],
    historicalTasks: [],
    configured: true,
    connected: true,
    lastSyncAt: null,
    stale: false,
  } as TaskList;
}
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});
it("discards a late response from the previous selected context", async () => {
  window.history.replaceState(null, "", "/tasks?context=" + privateId);
  let completePrivate!: (r: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string) =>
      path === "/api/work"
        ? Promise.resolve(Response.json(snapshot))
        : path.includes(privateId)
          ? new Promise<Response>((r) => {
              completePrivate = r;
            })
          : Promise.resolve(
              Response.json(list("work-project", 1, "Correct work task")),
            ),
    ),
  );
  render(<Workbench />);
  fireEvent.click(await screen.findByRole("button", { name: "Work test" }));
  expect(await screen.findByText("Correct work task")).toBeVisible();
  await act(async () =>
    completePrivate(
      Response.json(list("private-project", 1, "Wrong late task")),
    ),
  );
  expect(screen.queryByText("Wrong late task")).toBeNull();
  expect(screen.getByText("Correct work task")).toBeVisible();
});
it("reloads the authoritative mapping when a list reports a newer context revision", async () => {
  window.history.replaceState(null, "", "/tasks?context=" + privateId);
  let snapshots = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path === "/api/work") {
        snapshots++;
        return Response.json(
          snapshots === 1
            ? snapshot
            : {
                ...snapshot,
                contexts: [
                  {
                    ...snapshot.contexts[0],
                    projectId: "new-project",
                    revision: 2,
                  },
                ],
              },
        );
      }
      return Response.json(list("new-project", 2, "Current remapped task"));
    }),
  );
  render(<Workbench />);
  expect(await screen.findByText("Current remapped task")).toBeVisible();
  expect(snapshots).toBe(2);
  expect(screen.getByRole("button", { name: "Private test" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
