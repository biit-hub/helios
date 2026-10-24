import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TermiHubConnection } from "../../apps/web/components/termihub-settings";
import { CalendarContextPanel } from "../../apps/web/components/calendar-context";
import { emptyOrientation } from "../../packages/backend/src/termihub/policy";
import type { TermiHubSettings } from "@helios/contracts";
const settings: TermiHubSettings = {
  integrationId: null,
  revision: 0,
  baseUrl: "",
  enabled: false,
  hasToken: false,
  keyAvailable: true,
  state: "not_connected",
  syncing: false,
  lastCheckedAt: null,
  lastCatalogAt: null,
  lastSyncAt: null,
  nextAllowedAt: null,
  calendars: [],
  organizations: [],
  mappings: [],
  contexts: [],
};
afterEach(() => vi.unstubAllGlobals());
it("shows step-up failure beside TermiHub token and retains the entered value", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path, init) =>
      init?.method === "POST"
        ? Response.json(
            {
              error: {
                message:
                  "Bitte zuerst Passwort und neuen Authenticator-Code bestätigen.",
              },
            },
            { status: 403 },
          )
        : Response.json(settings),
    ),
  );
  render(<TermiHubConnection onChange={async () => {}} />);
  const token = await screen.findByLabelText("Neuer TermiHub-API-Token");
  fireEvent.change(screen.getByLabelText("TermiHub-Serveradresse"), {
    target: { value: "https://calendar.example.invalid" },
  });
  fireEvent.change(token, { target: { value: "synthetic-termihub-only" } });
  fireEvent.click(
    screen.getByRole("button", {
      name: "TermiHub-Token verschlüsselt speichern",
    }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Passwort und neuen Authenticator-Code",
  );
  expect(token).toHaveValue("synthetic-termihub-only");
  expect(
    screen.getByRole("button", { name: "Verbindung prüfen & Kalender lesen" }),
  ).toBeDisabled();
});
it("clears token only after successful save and authoritative reload", async () => {
  let saved = false;
  const changed = vi.fn(async () => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path, init) => {
      if (init?.method === "POST") {
        saved = true;
        return Response.json({ revision: 1 });
      }
      return Response.json(
        saved
          ? {
              ...settings,
              revision: 1,
              enabled: true,
              hasToken: true,
              state: "saved",
            }
          : settings,
      );
    }),
  );
  render(<TermiHubConnection onChange={changed} />);
  const input = await screen.findByLabelText("Neuer TermiHub-API-Token");
  fireEvent.change(screen.getByLabelText("TermiHub-Serveradresse"), {
    target: { value: "https://calendar.example.invalid" },
  });
  fireEvent.change(input, { target: { value: "synthetic-termihub-only" } });
  fireEvent.click(
    screen.getByRole("button", {
      name: "TermiHub-Token verschlüsselt speichern",
    }),
  );
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(screen.getByLabelText("Neuer TermiHub-API-Token")).toHaveValue("");
  expect(
    screen.getByRole("button", { name: "Verbindung prüfen & Kalender lesen" }),
  ).toBeEnabled();
});
it("labels stale bounds as historical and leaves manual planning available", async () => {
  const orientation = {
    ...emptyOrientation("2026-10-15", "Europe/Zurich", "stale"),
    observedBudget: { minimumMinutes: 30, maximumMinutes: 90 },
    retrievedAt: "2026-10-15T08:00:00Z",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        day: orientation.day,
        timezone: orientation.timezone,
        isToday: true,
        contexts: [
          {
            contextId: "synthetic-context",
            name: "Synthetic context",
            orientation,
          },
        ],
      }),
    ),
  );
  render(<CalendarContextPanel contextId="synthetic-context" />);
  fireEvent.click(
    (await screen.findByText("Arbeitszeit & Kalender")).closest("summary")!,
  );
  expect(await screen.findByText("Veralteter Kalenderstand")).toBeVisible();
  expect(screen.getByText(/Frühere Orientierung: 30–90 Min/)).toBeVisible();
  expect(
    screen.getByText(/Manuell planen bleibt jederzeit möglich/),
  ).toBeVisible();
});
it("reports a newer calendar basis without posting a plan mutation", async () => {
  const old = {
    ...emptyOrientation("2026-10-15", "Europe/Zurich", "ready"),
    basis: "synthetic-old",
  };
  const current = { ...old, basis: "synthetic-new" };
  const fetcher = vi.fn(async () =>
    Response.json({
      day: current.day,
      timezone: current.timezone,
      isToday: true,
      contexts: [
        {
          contextId: "synthetic-context",
          name: "Synthetic context",
          orientation: current,
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(
    <CalendarContextPanel
      contextId="synthetic-context"
      basis={{
        snapshotId: null,
        snapshotRevision: 1,
        basis: old.basis,
        state: old.state,
        retrievedAt: null,
        budget: null,
        workMinutes: null,
        fixedMinutes: null,
        uncertainMinutes: null,
        warnings: [],
      }}
    />,
  );
  expect(
    await screen.findByText(
      /Der Kalenderstand hat sich seit dieser Vorschau geändert/,
    ),
  ).toBeVisible();
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0]).toEqual([
    "/api/calendar?contextId=synthetic-context",
    { method: "GET", headers: {}, body: undefined, cache: "no-store" },
  ]);
});

import { calendarDisplay } from "../../apps/web/components/calendar-display";
it("expires a displayed snapshot at its boundary even without a new server response", () => {
  const time = Date.parse("2026-10-15T08:15:00Z");
  const orientation = {
    ...emptyOrientation("2026-10-15", "Europe/Zurich", "ready"),
    snapshotId: "synthetic-snapshot",
    retrievedAt: "2026-10-15T08:00:00Z",
    freshUntil: "2026-10-15T08:15:00Z",
    reliable: true,
    budget: { minimumMinutes: 30, maximumMinutes: 60 },
  };
  expect(calendarDisplay(orientation, time - 1, false).reliable).toBe(true);
  const expired = calendarDisplay(orientation, time, false);
  expect(expired.state).toBe("stale");
  expect(expired.reliable).toBe(false);
  expect(expired.budget).toBeNull();
  expect(expired.observedBudget).toEqual(orientation.budget);
  expect(orientation.reliable).toBe(true);
});
it("withholds the displayed current budget when the browser read fails", () => {
  const orientation = {
    ...emptyOrientation("2026-10-15", "Europe/Zurich", "ready"),
    snapshotId: "synthetic-snapshot",
    retrievedAt: "2026-10-15T08:00:00Z",
    freshUntil: "2026-10-15T08:15:00Z",
    reliable: true,
    budget: { minimumMinutes: 30, maximumMinutes: 60 },
  };
  expect(
    calendarDisplay(orientation, Date.parse("2026-10-15T08:01:00Z"), true)
      .budget,
  ).toBeNull();
  expect(
    calendarDisplay(orientation, Date.parse("2026-10-15T08:01:00Z"), false)
      .budget,
  ).toEqual(orientation.budget);
});
it("explains the actual unmapped sources and offers a direct settings link", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        isToday: true,
        day: "2026-10-23",
        timezone: "Europe/Zurich",
        contexts: [
          {
            contextId: "synthetic",
            name: "Synthetic workplace",
            orientation: {
              ...emptyOrientation("2026-10-23", "Europe/Zurich", "unmapped"),
              mappingIssues: [
                {
                  kind: "calendar",
                  name: "Synthetic open source",
                  reason: "unassigned",
                },
              ],
            },
          },
        ],
      }),
    ),
  );
  render(<CalendarContextPanel contextId="synthetic" />);
  fireEvent.click(
    (await screen.findByText("Arbeitszeit & Kalender")).closest("summary")!,
  );
  expect(await screen.findByText(/Synthetic open source/)).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Kalenderzuordnungen öffnen" }),
  ).toHaveAttribute("href", "/settings/contexts#termihub-settings");
  expect(
    screen.getByText(/Kein verlässlich berechnetes freies Zeitbudget/),
  ).toBeVisible();
});

it("reloads context metadata after adding or selecting an employer without changing other mappings", async () => {
  const privateContext = {
    id: "private-synthetic",
    name: "Synthetic private",
    active: true,
    revision: 1,
    organizationId: "org-private",
    instanceMatches: true,
  };
  const employer = {
    id: "employer-synthetic",
    name: "Synthetic new employer",
    active: true,
    revision: 1,
    organizationId: null,
    instanceMatches: true,
  };
  let fresh = false;
  const fetcher = vi.fn(async () =>
    Response.json({
      ...settings,
      enabled: true,
      hasToken: true,
      contexts: fresh ? [privateContext, employer] : [privateContext],
      organizations: [{ id: "org-private", name: "Synthetic organization" }],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const { rerender } = render(
    <TermiHubConnection
      onChange={async () => {}}
      contextId="private-synthetic"
      mode="mapping"
    />,
  );
  expect(
    await screen.findByLabelText("Synthetic private · Arbeitsorganisation"),
  ).toHaveValue("org-private");
  fresh = true;
  rerender(
    <TermiHubConnection
      onChange={async () => {}}
      contextId="employer-synthetic"
      mode="mapping"
    />,
  );
  expect(
    await screen.findByLabelText(
      "Synthetic new employer · Arbeitsorganisation",
    ),
  ).toBeVisible();
  expect(
    screen.getByLabelText("Synthetic private · Arbeitsorganisation"),
  ).toHaveValue("org-private");
  expect(
    screen.getByLabelText("Synthetic private · Arbeitsorganisation"),
  ).not.toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
