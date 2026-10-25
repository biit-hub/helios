import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AiJobDetail } from "@helios/contracts";
import { AiJobWorkflow } from "../../apps/web/components/ai-job-workflow";
const id = "55555555-5555-4555-8555-555555555555";
const job = (status: AiJobDetail["status"]): AiJobDetail => ({
  id,
  status,
  revision: 3,
  prompt: "Synthetisch",
  originalPrompt: "Synthetisch",
  result: "Ergebnis",
  output: "text",
  format: null,
  model: "synthetic-local",
  digest: "a".repeat(64),
  createdAt: "2026-10-25T12:00:00Z",
  updatedAt: "2026-10-25T12:00:00Z",
  code: null,
  reference: null,
  queuePosition: null,
  prioritized: false,
  turns: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      kind: "question",
      text: "Welche Zielgruppe?",
      questionId: null,
      createdAt: "2026-10-25T12:00:00Z",
    },
  ],
  results: [],
  events: [],
  attempts: [],
});
afterEach(() => vi.unstubAllGlobals());
it("answers the current question with revision and preserves the exact admission key after a lost reply", async () => {
  const posts: Record<string, unknown>[] = [];
  const updated = vi.fn();
  vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") {
      posts.push(JSON.parse(String(init.body)));
      throw Error("Verbindung unterbrochen");
    }
    return Response.json(job("awaiting_input"));
  });
  render(
    <AiJobWorkflow
      job={job("awaiting_input")}
      updated={updated}
      deleted={vi.fn()}
      dirty={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Deine Antwort"), {
    target: { value: "Nicht verlieren" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Antwort speichern & fortsetzen" }),
  );
  await screen.findByRole("button", { name: "Dieselbe Anfrage abgleichen" });
  fireEvent.click(
    screen.getByRole("button", { name: "Dieselbe Anfrage abgleichen" }),
  );
  await screen.findByRole("button", { name: "Gespeicherten Stand prüfen" });
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(posts[0]);
  expect(posts[0]).toMatchObject({
    id,
    revision: 3,
    text: "Nicht verlieren",
    questionId: job("awaiting_input").turns[0]!.id,
  });
});
it("requires conscious completion and never treats a ready result as automatically closed", async () => {
  const posts: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    posts.push(body);
    return Response.json({
      ...job("closed"),
      events: [
        {
          id,
          key: body.key,
          kind: "closed",
          revision: 4,
          createdAt: "2026-10-25T12:00:00Z",
          data: {},
        },
      ],
    });
  });
  render(
    <AiJobWorkflow
      job={job("ready")}
      updated={vi.fn()}
      deleted={vi.fn()}
      dirty={vi.fn()}
    />,
  );
  expect(posts).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Auftrag abschliessen" }));
  expect(posts).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Bestätigen" }));
  await screen.findByRole("button", { name: "Auftrag abschliessen" });
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({ id, revision: 3 });
});
it("offers neither running cancellation nor ready-only refinement during execution", () => {
  render(
    <AiJobWorkflow
      job={job("running")}
      updated={vi.fn()}
      deleted={vi.fn()}
      dirty={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
});
it("keeps ambiguous HTTP admission frozen until its stored event is read", async () => {
  let key = "";
  const updated = vi.fn();
  vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") {
      key = JSON.parse(String(init.body)).key;
      return Response.json({ message: "Ungeklärt" }, { status: 503 });
    }
    return Response.json({
      ...job("queued"),
      events: [
        {
          id,
          key,
          kind: "refine",
          revision: 4,
          createdAt: "2026-10-25T12:00:00Z",
          data: {},
        },
      ],
    });
  });
  render(
    <AiJobWorkflow
      job={job("ready")}
      updated={updated}
      deleted={vi.fn()}
      dirty={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Nachbearbeitung anfordern"), {
    target: { value: "Kürzer bitte" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Nachbearbeitung einreichen" }),
  );
  await screen.findByRole("button", { name: "Gespeicherten Stand prüfen" });
  fireEvent.click(
    screen.getByRole("button", { name: "Gespeicherten Stand prüfen" }),
  );
  await screen.findByRole("textbox", { name: "Nachbearbeitung anfordern" });
  expect(screen.getByLabelText("Nachbearbeitung anfordern")).toHaveValue("");
  expect(updated).toHaveBeenCalled();
});

it("reconciles a repeated delete after the original response was lost without inventing a new key", async () => {
  const posts: Record<string, unknown>[] = [];
  const deleted = vi.fn();
  vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") {
      posts.push(JSON.parse(String(init.body)));
      if (posts.length === 1) throw Error("Lost response after deletion");
    }
    return Response.json({ message: "Nicht verfügbar" }, { status: 404 });
  });
  render(
    <AiJobWorkflow
      job={job("closed")}
      updated={vi.fn()}
      deleted={deleted}
      dirty={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Auftrag löschen" }));
  fireEvent.click(screen.getByRole("button", { name: "Bestätigen" }));
  await screen.findByRole("button", { name: "Dieselbe Anfrage abgleichen" });
  fireEvent.click(
    screen.getByRole("button", { name: "Dieselbe Anfrage abgleichen" }),
  );
  await waitFor(() => expect(deleted).toHaveBeenCalledOnce());
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(posts[0]);
});
