import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { AiJobDetails, AiJobs } from "../../apps/web/components/ai-jobs";
import { AiJobStatusBadge } from "../../apps/web/components/ai-job-status";
import {
  aiJobStatuses,
  aiJobStatusNames,
  type AiJobDetail,
} from "@helios/contracts";
const job = (patch: Partial<AiJobDetail> = {}): AiJobDetail => ({
  id: "55555555-5555-4555-8555-555555555555",
  prompt: "Kurzer Originalprompt",
  originalPrompt: "Vollständiger ursprünglicher Auftrag",
  result: "Vorschau des Ergebnisses",
  status: "ready",
  revision: 2,
  output: "text",
  format: null,
  model: "synthetic-local",
  digest: "a".repeat(64),
  createdAt: "2026-10-25T12:00:00Z",
  updatedAt: "2026-10-25T12:00:00Z",
  queuePosition: null,
  prioritized: false,
  code: null,
  reference: null,
  turns: [],
  events: [],
  attempts: [],
  results: [1, 2].map((version) => ({
    id: "result-" + version,
    version,
    text: "Resultat Version " + version,
    createdAt: "2026-10-25T12:00:00Z",
    artifact: null,
    sources: [],
    uncertainties: [],
  })),
  ...patch,
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it.each(aiJobStatuses)(
  "labels status %s and adds a non-colour icon",
  (status) => {
    const view = render(<AiJobStatusBadge status={status} />);
    expect(screen.getByText(aiJobStatusNames[status])).toBeVisible();
    expect(view.container.querySelector(".ui-badge svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  },
);
it("combines literal prompt search with status, date sort and reset while retaining pagination parameters", async () => {
  const requests: URL[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    requests.push(new URL(url, "http://synthetic.test"));
    return Response.json({ jobs: [], total: 0, page: 1, pageSize: 20 });
  });
  render(<AiJobs />);
  await screen.findByText(/Keine KI-Aufträge vorhanden/);
  fireEvent.change(screen.getByLabelText("Originalprompt durchsuchen"), {
    target: { value: "  ÜBERblick_%  " },
  });
  fireEvent.change(screen.getByLabelText("Status"), {
    target: { value: "closed" },
  });
  fireEvent.change(screen.getByLabelText("Sortierung"), {
    target: { value: "oldest" },
  });
  await waitFor(() =>
    expect(requests.at(-1)?.searchParams.get("q")).toBe("ÜBERblick_%"),
  );
  const query = requests.at(-1)!.searchParams;
  expect(query.get("status")).toBe("closed");
  expect(query.get("sort")).toBe("oldest");
  expect(query.get("page")).toBe("1");
  await screen.findByText("Keine KI-Aufträge für diese Suche gefunden.");
  fireEvent.click(screen.getByRole("button", { name: "Suche zurücksetzen" }));
  await waitFor(() =>
    expect(requests.at(-1)!.searchParams.has("q")).toBe(false),
  );
  expect(requests.at(-1)!.searchParams.get("status")).toBe("closed");
  expect(requests.at(-1)!.searchParams.get("sort")).toBe("oldest");
});
it("dims closed cards, hides only the overview preview and preserves opening the full prompt and every result version", async () => {
  const value = job({ status: "closed" });
  vi.stubGlobal("fetch", async (url: string) =>
    Response.json(
      String(url).includes("?id=")
        ? value
        : { jobs: [value], total: 1, page: 1, pageSize: 20 },
    ),
  );
  const view = render(<AiJobs />);
  await screen.findByRole("heading", { name: value.prompt });
  expect(view.container.querySelector(".ai-job-card")).toHaveClass(
    "ai-job-card-closed",
  );
  expect(screen.queryByText(value.result)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Auftrag ansehen" }));
  const dialog = await screen.findByRole("dialog", { name: "KI-Auftrag" });
  await within(dialog).findByText("Resultat Version 2");
  expect(within(dialog).getByText(value.originalPrompt)).toBeInTheDocument();
  expect(within(dialog).getByText("Resultat Version 1")).toBeInTheDocument();
  expect(
    within(dialog)
      .getByText("Resultat Version 2")
      .closest(".ai-job-result-card"),
  ).not.toBeNull();
  expect(
    within(dialog).queryByRole("textbox", {
      name: "Nachbearbeitung anfordern",
    }),
  ).not.toBeInTheDocument();
});
it("keeps copying the exact result and separates refinement from completion and deletion", async () => {
  const copy = vi.fn(async () => {});
  const prior = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: copy },
  });
  try {
    vi.stubGlobal("fetch", async () => Response.json(job()));
    render(
      <AiJobDetails id={job().id} close={() => {}} changed={async () => {}} />,
    );
    const result = await screen.findByText("Resultat Version 2");
    fireEvent.click(
      within(result.closest(".ai-job-result-card") as HTMLElement).getByRole(
        "button",
        { name: "Ergebnis kopieren" },
      ),
    );
    await act(async () => {});
    expect(copy).toHaveBeenCalledWith("Resultat Version 2");
    const field = screen.getByRole("textbox", {
      name: "Nachbearbeitung anfordern",
    });
    expect(field.closest(".ai-job-followup")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Nachbearbeitung einreichen" }),
    ).toBeDisabled();
    fireEvent.change(field, { target: { value: "Bitte präzisieren" } });
    expect(
      screen.getByRole("button", { name: "Nachbearbeitung einreichen" }),
    ).toBeEnabled();
    expect(
      screen
        .getByRole("button", { name: "Auftrag abschliessen" })
        .closest(".ai-job-followup"),
    ).toBeNull();
  } finally {
    if (prior) Object.defineProperty(navigator, "clipboard", prior);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});
