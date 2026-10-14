import { afterEach, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Workbench } from "../../apps/web/components/workbench";
import type { WorkSnapshot } from "@helios/contracts";
const snapshot: WorkSnapshot = {
  contexts: [],
  projects: [],
  problems: [],
  integration: {
    revision: 0,
    enabled: true,
    hasToken: false,
    keyAvailable: true,
    state: "not_connected",
    lastCheckedAt: null,
    lastCatalogAt: null,
    nextAllowedAt: null,
  },
};
afterEach(() => vi.unstubAllGlobals());
function connection() {
  return within(
    screen
      .getByRole("heading", { name: "Todoist verbinden" })
      .closest("section")!,
  );
}
async function submitToken() {
  render(<Workbench settings />);
  const input = await screen.findByLabelText("Neuer Todoist-API-Token");
  fireEvent.change(input, { target: { value: "synthetic-token-only" } });
  fireEvent.click(
    connection().getByRole("button", { name: "Token verschlüsselt speichern" }),
  );
  return input;
}
it("shows a required security confirmation beside the token and preserves input for retry", async () => {
  const message =
    "Bitte zuerst Passwort und neuen Authenticator-Code bestätigen.";
  const fetcher = vi.fn(async (path: string) =>
    path === "/api/work"
      ? Response.json(snapshot)
      : Response.json(
          { error: { code: "STEP_UP_REQUIRED", message } },
          { status: 403 },
        ),
  );
  vi.stubGlobal("fetch", fetcher);
  const input = await submitToken();
  expect(await connection().findByRole("alert")).toHaveTextContent(message);
  expect(input).toHaveValue("synthetic-token-only");
  expect(
    connection().getByRole("link", { name: /Passwort und neuen/ }),
  ).toHaveAttribute("href", "#sensitive-changes");
  expect(
    connection().getByRole("button", {
      name: "Verbindung prüfen & Projekte laden",
    }),
  ).toBeDisabled();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("reports transport errors at the token field", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path === "/api/work") return Response.json(snapshot);
      throw new Error("Verbindung unterbrochen.");
    }),
  );
  await submitToken();
  expect(await connection().findByRole("alert")).toHaveTextContent(
    "Verbindung unterbrochen.",
  );
});
it("clears the token after saving and enables connection checks from the refreshed snapshot", async () => {
  let saved = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path === "/api/work")
        return Response.json(
          saved
            ? {
                ...snapshot,
                integration: {
                  ...snapshot.integration,
                  revision: 1,
                  hasToken: true,
                  state: "not_tested",
                },
              }
            : snapshot,
        );
      saved = true;
      return Response.json({ ok: true });
    }),
  );
  const input = await submitToken();
  await waitFor(() => expect(input).toHaveValue(""));
  expect(
    connection().getByText(/Token verschlüsselt gespeichert/),
  ).toBeVisible();
  expect(
    connection().getByRole("button", {
      name: "Verbindung prüfen & Projekte laden",
    }),
  ).toBeEnabled();
});
