import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { AiJobCapture } from "../../apps/web/components/ai-job-capture";
import { AiJobSettingsPanel } from "../../apps/web/components/ai-job-settings";
import { AiJobDetails, AiJobs } from "../../apps/web/components/ai-jobs";
import {
  aiJobOutputs,
  type AiJobDetail,
  type AiJobSettings,
} from "@helios/contracts";
import { tasks } from "../fixtures/todoist";

const settings: AiJobSettings = {
  connected: true,
  code: null,
  models: [
    {
      name: "synthetic-local",
      digest: "a".repeat(64),
      size: 100,
      local: true,
      available: true,
      reason: null,
    },
  ],
  outputs: aiJobOutputs.map((output) => ({
    output,
    enabled: true,
    model: "synthetic-local",
    revision: 1,
    available: true,
    reason: null,
  })),
};
const detail = (patch: Partial<AiJobDetail> = {}): AiJobDetail => ({
  id: "55555555-5555-4555-8555-555555555555",
  prompt: "Synthetic",
  originalPrompt: "Synthetischer Originalprompt",
  result: "",
  status: "queued",
  revision: 1,
  output: "text",
  format: null,
  model: "synthetic-local",
  digest: "a".repeat(64),
  createdAt: "2026-10-25T10:00:00Z",
  updatedAt: "2026-10-25T10:00:00Z",
  queuePosition: 1,
  prioritized: false,
  code: null,
  reference: null,
  turns: [],
  results: [],
  events: [],
  attempts: [],
  ...patch,
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function capture(fetcher?: typeof fetch) {
  vi.stubGlobal("fetch", fetcher ?? (async () => Response.json(settings)));
  render(<AiJobCapture />);
  fireEvent.click(screen.getByRole("button", { name: "KI-Auftrag starten" }));
  await screen.findByRole("button", { name: "Auftrag erstellen" });
  await act(async () => {});
}
it("protects unsaved prompts when closing and preserves editing", async () => {
  await capture();
  fireEvent.change(screen.getByLabelText("Auftrag"), {
    target: { value: "Nicht verlieren" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Schliessen" }));
  expect(
    screen.getByText("Ungespeicherten KI-Auftrag verwerfen?"),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Weiterbearbeiten" }));
  expect(screen.getByLabelText("Auftrag")).toHaveValue("Nicht verlieren");
});
it("submits one selected file format with no implicit Todoist origin", async () => {
  const posts: Record<string, unknown>[] = [];
  await capture(async (_url, init) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      posts.push(body);
      return Response.json(
        detail({ id: body.key, output: "file", format: "pdf" }),
      );
    }
    return Response.json(settings);
  });
  fireEvent.change(screen.getByLabelText("Auftrag"), {
    target: { value: "Synthetischer Bericht" },
  });
  fireEvent.change(screen.getByLabelText("Ausgabe"), {
    target: { value: "file" },
  });
  fireEvent.change(screen.getByLabelText("Dateiformat"), {
    target: { value: "pdf" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Auftrag erstellen" }));
  await screen.findByText(/Auftrag gespeichert/);
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({
    prompt: "Synthetischer Bericht",
    output: "file",
    format: "pdf",
    origin: null,
  });
});
it("keeps input and the same id after a lost reply, reconciles before a duplicate native creation", async () => {
  const posts: Record<string, unknown>[] = [];
  await capture(async (url, init) => {
    if (init?.method === "POST") {
      posts.push(JSON.parse(String(init.body)));
      throw new TypeError("Synthetischer Abbruch");
    }
    if (String(url).includes("?id="))
      return Response.json(detail({ id: String(posts[0]!.key) }));
    return Response.json(settings);
  });
  fireEvent.change(screen.getByLabelText("Auftrag"), {
    target: { value: "Erhalten" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Auftrag erstellen" }));
  await screen.findByRole("button", { name: "Auftragsstatus prüfen" });
  expect(screen.getByLabelText("Auftrag")).toHaveValue("Erhalten");
  expect(screen.getByLabelText("Auftrag")).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Auftragsstatus prüfen" }),
  );
  await screen.findByRole("link", { name: "KI-Auftrag öffnen" });
  expect(posts).toHaveLength(1);
});
it("allows only the unchanged same-id local request after unknown, never a new id", async () => {
  const posts: unknown[] = [];
  await capture(async (_url, init) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      posts.push(body);
      if (posts.length === 1) throw new TypeError("Lost response");
      return Response.json(detail({ id: body.key }));
    }
    return Response.json(settings);
  });
  fireEvent.change(screen.getByLabelText("Auftrag"), {
    target: { value: "Nicht doppelt" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Auftrag erstellen" }));
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Mit derselben ID erneut senden",
    }),
  );
  await screen.findByRole("link", { name: "KI-Auftrag öffnen" });
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(posts[0]);
});
it("preserves a rejected request and disables unavailable output types", async () => {
  await capture(async (_url, init) =>
    init?.method === "POST"
      ? Response.json(
          { error: { message: "Quelle verändert" } },
          { status: 409 },
        )
      : Response.json({
          ...settings,
          outputs: settings.outputs.map((o) => ({
            ...o,
            available: o.output === "text",
          })),
        }),
  );
  expect(
    screen.getByRole("option", { name: "Recherche · nicht verfügbar" }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Auftrag"), {
    target: { value: "Behalten" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Auftrag erstellen" }));
  await screen.findByText("Quelle verändert");
  expect(screen.getByLabelText("Auftrag")).toHaveValue("Behalten");
  expect(
    screen.queryByRole("button", { name: "Auftragsstatus prüfen" }),
  ).toBeNull();
});
it("opens an existing locally verified reference instead of offering another delegation", async () => {
  vi.stubGlobal("fetch", async (url: string) =>
    Response.json(
      url.includes("refTask")
        ? { id: detail().id }
        : url.includes("/api/tasks?")
          ? { task: tasks[0], basis: "b".repeat(64) }
          : settings,
    ),
  );
  render(
    <AiJobCapture
      origin={{ contextId: crypto.randomUUID(), taskId: tasks[0]!.id }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "An KI delegieren" }));
  expect(
    await screen.findByRole("link", { name: "Zugehörigen KI-Auftrag öffnen" }),
  ).toHaveAttribute("href", "/ai-jobs?job=" + detail().id);
  expect(
    screen.queryByRole("button", { name: "Auftrag erstellen" }),
  ).toBeNull();
});
it("requires a deliberate confirmation to stop a waiting job and sends its revision", async () => {
  const posts: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      posts.push(JSON.parse(String(init.body)));
      return Response.json(
        detail({ status: "stopped", revision: 2, queuePosition: null }),
      );
    }
    return Response.json(detail());
  });
  render(
    <AiJobDetails id={detail().id} close={vi.fn()} changed={async () => {}} />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Stoppen" }));
  expect(posts).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Auftrag stoppen" }));
  await screen.findByText("Gestoppt");
  expect(posts[0]).toMatchObject({ id: detail().id, revision: 1 });
  fireEvent.click(screen.getByText("Originalauftrag", { selector: "summary" }));
  expect(screen.getByText(detail().originalPrompt)).toBeVisible();
});
it("offers no preemption controls for running jobs", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json(detail({ status: "running", queuePosition: null })),
  );
  render(
    <AiJobDetails id={detail().id} close={vi.fn()} changed={async () => {}} />,
  );
  await screen.findByText("In Arbeit");
  expect(screen.queryByRole("button", { name: "Stoppen" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Priorisieren" })).toBeNull();
});
it("renders empty/filter states and requests date sorting without changing business data", async () => {
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    urls.push(url);
    return Response.json({ jobs: [], total: 0, page: 1, pageSize: 20 });
  });
  render(<AiJobs />);
  await screen.findByText(/Keine KI-Aufträge vorhanden/);
  fireEvent.change(screen.getByLabelText("Status"), {
    target: { value: "stopped" },
  });
  await screen.findByText(/Keine KI-Aufträge für diesen Filter/);
  fireEvent.change(screen.getByLabelText("Sortierung"), {
    target: { value: "oldest" },
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  expect(urls.at(-1)).toContain("sort=oldest");
  expect(urls.at(-1)).toContain("status=stopped");
});
it("lets a changed installed model version be explicitly acknowledged without choosing a fallback", async () => {
  const posts: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") posts.push(JSON.parse(String(init.body)));
    return Response.json({
      ...settings,
      outputs: settings.outputs.map((o) => ({
        ...o,
        available: o.output !== "text",
      })),
    });
  });
  render(<AiJobSettingsPanel />);
  const button = await screen.findByRole("button", {
    name: "Modellversion bewusst bestätigen",
  });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  await act(async () => {});
  expect(posts[0]).toMatchObject({
    output: "text",
    model: "synthetic-local",
    enabled: true,
    revision: 1,
  });
  expect(
    within(
      screen.getByRole("combobox", { name: "Lokales Modell für Text" }),
    ).getByRole("option", { name: "synthetic-local" }),
  ).toBeInTheDocument();
});
it("lets the user disable an unavailable configured model without clearing its choice first", async () => {
  const posts: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") posts.push(JSON.parse(String(init.body)));
    return Response.json({
      ...settings,
      models: [],
      connected: false,
      outputs: settings.outputs.map((o) => ({ ...o, available: false })),
    });
  });
  render(<AiJobSettingsPanel />);
  const checkbox = (
    await screen.findAllByRole("switch", { name: "Ausgabe aktivieren" })
  )[0]!;
  fireEvent.click(checkbox);
  const form = checkbox.closest("form")!;
  const save = within(form).getByRole("button", {
    name: "Einstellungen speichern",
  });
  expect(save).toBeEnabled();
  fireEvent.click(save);
  await act(async () => {});
  expect(posts[0]).toMatchObject({
    enabled: false,
    model: "synthetic-local",
    output: "text",
  });
});
it.each([401, 403, 408, 500, 503])(
  "keeps ambiguous HTTP %s after submission bound to the original id",
  async (status) => {
    const posts: Record<string, unknown>[] = [];
    await capture(async (url, init) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return Response.json(
          { error: { message: "Synthetic response after admission" } },
          { status },
        );
      }
      if (String(url).includes("?id="))
        return Response.json(detail({ id: String(posts[0]!.key) }));
      return Response.json(settings);
    });
    fireEvent.change(screen.getByLabelText("Auftrag"), {
      target: { value: "Nicht erneut anlegen" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Auftrag erstellen" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Auftragsstatus prüfen" }),
    );
    await screen.findByRole("link", { name: "KI-Auftrag öffnen" });
    expect(posts).toHaveLength(1);
  },
);
