import { test, expect } from "@playwright/test";
import { bootstrapWorkSettings } from "../fixtures/browser-work";
import { projects } from "../fixtures/todoist";
test("TermiHub settings, guarded mappings, refreshed budget and unchanged confirmed plan across two tabs", async ({
  page,
  baseURL,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Single-user desktop integration includes a second browser tab.",
  );
  const { errors } = await bootstrapWorkSettings(page, baseURL);
  const fixtureOrigin = new URL(process.env.TODOIST_TEST_ORIGIN!).origin;
  await fetch(fixtureOrigin + "/termihub-control", {
    method: "POST",
    body: JSON.stringify({ reset: true, mode: "ok" }),
  });
  await fetch(fixtureOrigin + "/control", {
    method: "POST",
    body: JSON.stringify({ mode: "ok", scenario: "planning" }),
  });
  const privateRow = page
    .locator(".context-editor")
    .filter({ has: page.getByRole("heading", { name: /Privat/ }) });
  await privateRow
    .getByRole("combobox", { name: "Todoist-Projekt", exact: true })
    .selectOption(projects[0]!.id);
  await privateRow
    .getByRole("button", { name: "Kontext speichern", exact: true })
    .click();
  await expect(
    page.getByText("Gespeichert. Todoist-Inhalte bleiben unverändert."),
  ).toBeVisible();
  const panel = page.getByRole("region", { name: "TermiHub-Einstellungen" });
  await panel.getByLabel("TermiHub-Serveradresse").fill(fixtureOrigin);
  await panel
    .getByLabel("Neuer TermiHub-API-Token")
    .fill("synthetic-termihub-only");
  await panel
    .getByRole("button", { name: "TermiHub-Token verschlüsselt speichern" })
    .click();
  await expect(panel.getByLabel("Neuer TermiHub-API-Token")).toHaveValue("");
  await panel
    .getByRole("button", { name: "Verbindung prüfen & Kalender lesen" })
    .click();
  await expect(panel.getByText(/Synthetic calendar ·/)).toBeVisible({
    timeout: 35000,
  });
  const state = await page.request.get("/api/work").then((r) => r.json());
  const c = state.contexts[0];
  const settings = await page.request
    .get("/api/termihub")
    .then((r) => r.json());
  expect(JSON.stringify(settings)).not.toContain("synthetic-termihub-only");
  await panel
    .getByLabel(/Privat · Arbeitsorganisation/)
    .selectOption(settings.organizations[0].id);
  await panel
    .getByLabel(/Synthetic calendar ·/)
    .selectOption("context:" + c.id);
  await panel
    .getByRole("button", { name: "TermiHub-Zuordnungen speichern" })
    .click();
  await expect(panel.getByText("Gespeichert.", { exact: true })).toBeVisible();
  const denied = await page.request.get(
    "/api/calendar?contextId=" + crypto.randomUUID(),
  );
  expect(denied.status()).toBe(404);
  const csrf = await page.request.post("/api/termihub/disable", {
    headers: { Origin: "https://attacker.invalid" },
    data: { revision: 2 },
  });
  expect(csrf.status()).toBe(403);
  await page.getByRole("link", { name: "Aufgaben", exact: true }).click();
  const refresh = page.getByRole("button", {
    name: "Aufgaben aktualisieren",
    exact: true,
  });
  await expect(refresh).toBeEnabled({ timeout: 65000 });
  await refresh.click();
  await expect(
    page.getByText("Aufgabenstand vollständig aktualisiert."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Fokus", exact: true }).click();
  await expect(
    page.getByText("Aktueller Kalenderstand", { exact: true }),
  ).toBeVisible({ timeout: 35000 });
  await expect(page.getByText(/480 Min./)).toBeVisible();
  await page
    .getByRole("button", { name: "Tagesvorschau erstellen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Auswahl bewusst bestätigen", exact: true })
    .click();
  await expect(
    page.getByText(
      "Tagesplan bestätigt. Alle nötigen Abschnittswechsel sind nachgelesen; geschützte Hierarchien bleiben unverändert.",
    ),
  ).toBeVisible({ timeout: 35000 });
  const before = await page.request
    .get("/api/plans?contextId=" + c.id)
    .then((r) => r.json());
  expect(before.plan.calendarBasis.budget.minimumMinutes).toBe(480);
  const second = await page.context().newPage();
  await second.goto(baseURL + "/");
  await fetch(fixtureOrigin + "/termihub-control", {
    method: "POST",
    body: JSON.stringify({ mode: "busy" }),
  });
  await expect(
    page.getByRole("button", { name: "Kalenderstand aktualisieren" }),
  ).toBeEnabled();
  // Respect the server read cooldown; retries here only enqueue read intents.
  await expect
    .poll(
      async () =>
        (
          await page.request.post("/api/termihub/refresh", {
            headers: { Origin: baseURL! },
            data: {},
          })
        ).status(),
      { timeout: 25000, intervals: [3000] },
    )
    .toBe(202);
  await expect
    .poll(
      async () =>
        (
          await page.request
            .get("/api/calendar?contextId=" + c.id)
            .then((r) => r.json())
        ).contexts[0].orientation.budget?.minimumMinutes,
      { timeout: 35000, intervals: [2000] },
    )
    .toBe(0);
  await second.reload();
  const after = await page.request
    .get("/api/plans?contextId=" + c.id)
    .then((r) => r.json());
  expect(after.plan).toEqual(before.plan);
  expect(after.history).toEqual(before.history);
  expect(after.calendarChanged).toBe(true);
  await expect(
    second.getByText(
      /Der Kalenderstand hat sich seit dieser Vorschau geändert/,
    ),
  ).toBeVisible();
  await fetch(fixtureOrigin + "/termihub-control", {
    method: "POST",
    body: JSON.stringify({ mode: "permission" }),
  });
  await expect
    .poll(
      async () =>
        (
          await page.request.post("/api/termihub/refresh", {
            headers: { Origin: baseURL! },
            data: {},
          })
        ).status(),
      { timeout: 25000, intervals: [3000] },
    )
    .toBe(202);
  await expect
    .poll(
      async () =>
        (
          await page.request
            .get("/api/calendar?contextId=" + c.id)
            .then((r) => r.json())
        ).contexts[0].orientation.state,
      { timeout: 35000, intervals: [2000] },
    )
    .toBe("stale");
  await second.reload();
  await expect(
    second.getByText("Veralteter Kalenderstand", { exact: true }),
  ).toBeVisible();
  const unchanged = await page.request
    .get("/api/plans?contextId=" + c.id)
    .then((r) => r.json());
  expect(unchanged.plan).toEqual(before.plan);
  expect(unchanged.history).toEqual(before.history);
  await second.screenshot({
    path: "private/e9-calendar-stale.png",
    fullPage: true,
  });
  await second.close();
  expect(errors).toEqual([]);
});
