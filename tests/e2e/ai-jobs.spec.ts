import { test, expect, type Page } from "@playwright/test";
import { bootstrapWorkSettings } from "../fixtures/browser-work";
import { projects } from "../fixtures/todoist";
async function configure(page: Page, output: "Text" | "Datei") {
  const form = page
    .locator(".ai-job-setting")
    .filter({ has: page.getByRole("heading", { name: output, exact: true }) });
  await form.getByRole("switch", { name: "Ausgabe aktivieren" }).check();
  await form
    .getByRole("combobox", { name: "Lokales Modell für " + output })
    .selectOption("synthetic-local");
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/ai-jobs/settings") &&
      r.request().method() === "POST",
  );
  await form
    .getByRole("button", { name: "Einstellungen speichern", exact: true })
    .click();
  expect((await response).status()).toBe(200);
  await expect(
    page.getByRole("link", { name: "KI-Aufträge", exact: true }),
  ).toHaveAttribute("aria-disabled", "false");
}
test.afterEach(async () => {
  await fetch(new URL("/control", process.env.TODOIST_TEST_ORIGIN!), {
    method: "POST",
    body: JSON.stringify({ mode: "ok", releaseGpu: true }),
  });
});
test("F-001.1 local jobs, loss recovery, queue actions, native reference and responsive authenticated UI", async ({
  page,
  baseURL,
}, info) => {
  const { errors } = await bootstrapWorkSettings(page, baseURL);
  const context = page
    .locator(".context-editor")
    .filter({ has: page.getByRole("heading", { name: /^Privat\s+Privat$/ }) });
  await context
    .getByRole("combobox", { name: "Todoist-Projekt", exact: true })
    .selectOption(projects[0]!.id);
  await context
    .getByRole("button", { name: "Kontext speichern", exact: true })
    .click();
  await page
    .getByRole("button", { name: "KI-Delegation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "KI-Delegation", exact: true }),
  ).toBeVisible();
  await configure(page, "Text");
  await configure(page, "Datei");
  const before = await fetch(
    new URL("/assertions", process.env.TODOIST_TEST_ORIGIN!),
  ).then((r) => r.json());
  await page.getByRole("link", { name: "KI-Aufträge", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "KI-Aufträge", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".context-pill")).toHaveCount(0);
  await expect(page.getByText(/Keine KI-Aufträge vorhanden/)).toBeVisible();
  await page
    .getByRole("button", { name: "KI-Auftrag starten", exact: true })
    .click();
  const capture = page.getByRole("dialog", {
    name: "Neuer KI-Auftrag",
    exact: true,
  });
  await expect(
    capture.getByRole("textbox", { name: "Auftrag", exact: true }),
  ).toBeEnabled();
  await capture
    .getByRole("textbox", { name: "Auftrag", exact: true })
    .fill("Nicht verlieren");
  await capture
    .getByRole("button", { name: "Schliessen", exact: true })
    .click();
  await capture
    .getByRole("button", { name: "Weiterbearbeiten", exact: true })
    .click();
  await expect(
    capture.getByRole("textbox", { name: "Auftrag", exact: true }),
  ).toHaveValue("Nicht verlieren");
  // Simulate an existing E6 GPU run through the real shared lock, so these
  // admission/queue contracts stay deterministic with the F-001.2 worker enabled.
  await fetch(new URL("/control", process.env.TODOIST_TEST_ORIGIN!), {
    method: "POST",
    body: JSON.stringify({ mode: "ok", holdGpu: true }),
  });
  const prompt = "Synthetischer lokaler Bericht. ".repeat(15);
  await capture
    .getByRole("textbox", { name: "Auftrag", exact: true })
    .fill(prompt);
  let sent = 0;
  await page.route("**/api/ai-jobs/create", async (route) => {
    sent++;
    const response = await route.fetch();
    if (sent === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  await capture
    .getByRole("button", { name: "Auftrag erstellen", exact: true })
    .click();
  await expect(
    capture.getByRole("button", { name: "Auftragsstatus prüfen", exact: true }),
  ).toBeVisible();
  await capture
    .getByRole("button", { name: "Auftragsstatus prüfen", exact: true })
    .click();
  await capture
    .getByRole("link", { name: "KI-Auftrag öffnen", exact: true })
    .click();
  const detail = page.getByRole("dialog", { name: "KI-Auftrag", exact: true });
  await detail
    .locator("summary")
    .filter({ hasText: /^Originalauftrag$/ })
    .click();
  await expect(detail.locator(".ai-job-text").first()).toHaveText(prompt);
  await detail
    .getByRole("button", { name: "Priorisieren", exact: true })
    .click();
  await expect(
    detail.getByRole("button", { name: "Priorisiert", exact: true }),
  ).toBeDisabled();
  await detail.getByRole("button", { name: "Stoppen", exact: true }).click();
  await detail
    .getByRole("button", { name: "Auftrag stoppen", exact: true })
    .click();
  await expect(detail.getByText("Gestoppt", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "Schliessen", exact: true }).click();
  expect(sent).toBe(1);
  expect(
    (
      await fetch(
        new URL("/assertions", process.env.TODOIST_TEST_ORIGIN!),
      ).then((r) => r.json())
    ).writes,
  ).toBe(before.writes);
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("stopped");
  await expect(page.locator(".ai-job-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "KI-Auftrag starten", exact: true })
    .click();
  await expect(
    capture.getByRole("textbox", { name: "Auftrag", exact: true }),
  ).toBeEnabled();
  await capture
    .getByRole("textbox", { name: "Auftrag", exact: true })
    .fill("Synthetische PDF-Datei vorbereiten");
  await capture
    .getByRole("combobox", { name: "Ausgabe", exact: true })
    .selectOption("file");
  await capture
    .getByRole("combobox", { name: "Dateiformat", exact: true })
    .selectOption("pdf");
  await capture
    .getByRole("button", { name: "Auftrag erstellen", exact: true })
    .click();
  await expect(
    capture.getByRole("link", { name: "KI-Auftrag öffnen", exact: true }),
  ).toBeVisible();
  await capture
    .getByRole("button", { name: "Schliessen", exact: true })
    .click();
  await fetch(new URL("/control", process.env.TODOIST_TEST_ORIGIN!), {
    method: "POST",
    body: JSON.stringify({ mode: "ok", scenario: "ai" }),
  });
  await page.getByRole("link", { name: "Aufgaben", exact: true }).click();
  const refresh = page.getByRole("button", {
    name: "Aufgaben aktualisieren",
    exact: true,
  });
  await expect(refresh).toBeEnabled({ timeout: 65000 });
  await refresh.click();
  const row = page.locator(".task-entry").filter({
    has: page.getByRole("heading", {
      name: "Synthetische Präsentation vorbereiten",
      exact: true,
    }),
  });
  await row.locator(":scope > summary").click();
  await row
    .getByRole("button", { name: "An KI delegieren", exact: true })
    .click();
  const delegation = page.getByRole("dialog", {
    name: "Aufgabe an KI delegieren",
    exact: true,
  });
  await expect(
    delegation.getByRole("textbox", { name: "Auftrag", exact: true }),
  ).toBeEnabled();
  await expect(
    delegation.getByRole("textbox", { name: "Auftrag", exact: true }),
  ).toHaveValue(/Synthetische Präsentation/);
  await delegation
    .getByRole("textbox", { name: "Auftrag", exact: true })
    .fill("Nur lokal gespeicherter Delegationsprompt");
  await delegation
    .getByRole("button", { name: "Auftrag erstellen", exact: true })
    .click();
  await delegation
    .getByRole("link", { name: "KI-Auftrag öffnen", exact: true })
    .click();
  await expect(
    detail.getByText(/Todoist-Verknüpfung: nachgewiesen/),
  ).toBeVisible({ timeout: 30000 });
  await page.screenshot({
    path: "private/f001-1-" + info.project.name + "-detail-synthetic.png",
    fullPage: true,
  });
  await detail.getByRole("button", { name: "Schliessen", exact: true }).click();
  const list = await page.request.get("/api/ai-jobs").then((r) => r.json());
  expect(list.total).toBe(3);
  const linked = list.jobs.find((j: { reference: unknown }) => !!j.reference);
  expect(linked.reference.childId).toBeTruthy();
  expect(
    (
      await page.request
        .get(
          "/api/ai-jobs?" +
            new URLSearchParams({
              refTask: linked.reference.childId,
              contextId: linked.reference.contextId,
            }),
        )
        .then((r) => r.json())
    ).id,
  ).toBe(linked.id);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
