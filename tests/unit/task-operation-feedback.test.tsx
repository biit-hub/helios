import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TaskEditor } from "../../apps/web/components/tasks";
import { taskChangedEvent } from "../../apps/web/components/task-events";
import type { WorkSnapshot } from "@helios/contracts";
vi.mock("../../apps/web/components/ai-drafts", () => ({
  AiDraftPanel: () => null,
}));
vi.mock("../../apps/web/components/task-document", () => ({
  TaskDocument: () => null,
}));
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
} as const;
const snapshot: WorkSnapshot = {
  contexts: [context],
  projects: [
    {
      id: context.projectId,
      name: "Synthetic project",
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
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it.each(["succeeded", "unknown", "partial"])(
  "closes and announces only verified creation, not %s assumptions",
  async (status) => {
    vi.useFakeTimers();
    const close = vi.fn(),
      changed = vi.fn();
    window.addEventListener(taskChangedEvent, changed);
    let posts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          posts++;
          return Response.json({ operationId: "synthetic-operation" });
        }
        return Response.json([
          {
            id: "synthetic-operation",
            status,
            code: null,
            retryAt: null,
            result:
              status === "succeeded" ? { task: { id: "verified-id" } } : null,
          },
        ]);
      }),
    );
    render(<TaskEditor snapshot={snapshot} close={close} />);
    fireEvent.change(screen.getByLabelText("Titel"), {
      target: { value: "Synthetic new task" },
    });
    const create = screen.getByRole("button", { name: "Aufgabe erstellen" });
    fireEvent.click(create);
    fireEvent.click(create);
    await act(async () => {});
    expect(posts).toBe(1);
    expect(close).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    if (status === "succeeded") {
      expect(close).toHaveBeenCalledOnce();
      expect(changed).toHaveBeenCalledOnce();
      expect(changed.mock.calls[0]![0].detail.taskId).toBe("verified-id");
    } else {
      expect(close).not.toHaveBeenCalled();
      expect(changed).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Titel")).toHaveValue("Synthetic new task");
      expect(create).toBeDisabled();
    }
    window.removeEventListener(taskChangedEvent, changed);
  },
);
