import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";
import { AiDraftPanel } from "../../apps/web/components/ai-drafts";
import type { AiDraftView, WorkSnapshot } from "@helios/contracts";
const seed: AiDraftView = {
  id: "11111111-1111-4111-8111-111111111111",
  contextId: null,
  taskId: null,
  kind: "capture",
  input: "Synthetischer Input",
  manualFields: {},
  timezone: "Europe/Zurich",
  revision: 2,
  status: "ready",
  code: null,
  model: "synthetic",
  promptVersion: "synthetic-v1",
  schemaVersion: "synthetic-v1",
  sourceFingerprint: "a".repeat(64),
  patches: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      kind: "title",
      value: "Ursprünglich",
      edited: "Ursprünglich",
      target: null,
      evidence: "Synthetischer Input",
      reason: "Synthetisch",
      selected: false,
      rejected: false,
      status: "pending",
      operationId: null,
    },
  ],
  output: null,
  staleDate: false,
  confirmedClear: false,
  checklist: [],
  createdAt: "2026-10-15T04:00:00Z",
  operationId: null,
};
const snapshot = { projects: [], contexts: [] } as unknown as WorkSnapshot;
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function setup() {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const pending: ((r: Response) => void)[] = [];
  let first = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (first) {
        first = false;
        return Response.json({ available: true, drafts: [seed] });
      }
      return new Promise<Response>((resolve) => pending.push(resolve));
    }),
  );
  render(<AiDraftPanel kind="capture" snapshot={snapshot} />);
  fireEvent.click(
    await screen.findByText("Gespeicherte Entwürfe wieder öffnen"),
  );
  fireEvent.click(await screen.findByRole("button", { name: /ready/ }));
  await screen.findByLabelText("Titel bearbeiten");
  return pending;
}
function response(revision: number, title: string) {
  return Response.json({
    available: true,
    drafts: [
      {
        ...seed,
        revision,
        patches: seed.patches.map((p) => ({ ...p, edited: title })),
      },
    ],
  });
}
it("does not roll back an edited server draft when an older poll arrives later", async () => {
  const pending = await setup();
  await act(async () => {
    vi.advanceTimersByTime(2000);
  });
  await act(async () => {
    vi.advanceTimersByTime(2000);
  });
  expect(pending).toHaveLength(2);
  await act(async () => {
    pending[1]!(response(4, "Neuerer Serverstand"));
  });
  expect(screen.getByLabelText("Titel bearbeiten")).toHaveValue(
    "Neuerer Serverstand",
  );
  await act(async () => {
    pending[0]!(response(3, "Veralteter Serverstand"));
  });
  expect(screen.getByLabelText("Titel bearbeiten")).toHaveValue(
    "Neuerer Serverstand",
  );
});
it("retains unsaved user edits and reports a concurrent draft revision instead of overwriting", async () => {
  const pending = await setup();
  fireEvent.change(screen.getByLabelText("Titel bearbeiten"), {
    target: { value: "Meine ungespeicherte Korrektur" },
  });
  await act(async () => {
    vi.advanceTimersByTime(2000);
  });
  await act(async () => {
    pending[0]!(response(3, "Anderes Gerät"));
  });
  expect(screen.getByLabelText("Titel bearbeiten")).toHaveValue(
    "Meine ungespeicherte Korrektur",
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "zwischenzeitlich geändert",
  );
});

it.each([false, true])(
  "stops an approved batch after unexpected remote revision/edit=%s instead of applying new intent",
  async (changed) => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const operationId = "33333333-3333-4333-8333-333333333333";
    const first = {
      ...seed,
      kind: "progress" as const,
      contextId: "44444444-4444-4444-8444-444444444444",
      taskId: "synthetic",
      patches: [
        {
          ...seed.patches[0]!,
          kind: "comment" as const,
          value: "Schritt eins",
          edited: "Schritt eins",
        },
        {
          ...seed.patches[0]!,
          id: "55555555-5555-4555-8555-555555555555",
          kind: "check-add" as const,
          value: "Schritt zwei",
          edited: "Schritt zwei",
        },
      ],
    };
    let gets = 0,
      applies = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (String(url).endsWith("/edit")) {
          return Response.json({
            ...first,
            revision: 3,
            patches: first.patches.map((p) => ({ ...p, selected: true })),
          });
        }
        if (String(url).endsWith("/apply")) {
          applies++;
          return Response.json({
            operationId,
            draft: {
              ...first,
              revision: 4,
              status: "applying",
              operationId,
              patches: first.patches.map((p, i) => ({
                ...p,
                selected: true,
                ...(i === 0 ? { status: "queued", operationId } : {}),
              })),
            },
          });
        }
        gets++;
        return Response.json({
          available: true,
          drafts: [
            gets === 1
              ? first
              : {
                  ...first,
                  revision: 6,
                  patches: first.patches.map((p, i) => ({
                    ...p,
                    selected: true,
                    ...(i === 0
                      ? { status: "verified", operationId }
                      : {
                          edited: changed
                            ? "Andere nicht bestätigte Fassung"
                            : p.edited,
                        }),
                  })),
                },
          ],
        });
      }),
    );
    render(
      <AiDraftPanel
        kind="progress"
        contextId={first.contextId}
        taskId="synthetic"
        snapshot={snapshot}
      />,
    );
    fireEvent.click(
      await screen.findByText("Gespeicherte Entwürfe wieder öffnen"),
    );
    fireEvent.click(await screen.findByRole("button", { name: /ready/ }));
    for (const input of screen.getAllByLabelText("Diese Änderung auswählen"))
      fireEvent.click(input);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Ausgewählte Änderungen bewusst speichern",
      }),
    );
    await screen.findByText(
      "Änderung angenommen; externer Nachweis steht aus.",
    );
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "während des Speicherns geändert",
    );
    expect(applies).toBe(1);
  },
);
