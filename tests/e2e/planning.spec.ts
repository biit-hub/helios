import { test, expect, chromium } from "@playwright/test";
import { projects } from "../fixtures/todoist";
import { bootstrapWorkSettings } from "../fixtures/browser-work";
test("persistent contextual daily plans, hierarchy-safe confirmation, focus and browser restart", async ({
  page,
  baseURL,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "E3-Desktoppilot läuft einmal; die mobile Morgenroutine folgt in einer späteren Etappe.",
  );
  const { errors } = await bootstrapWorkSettings(page, baseURL);
  const fixtureOrigin = new URL(process.env.TODOIST_TEST_ORIGIN!);
  await fetch(new URL("/control", fixtureOrigin), {
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
  for (const [name, p] of [
    ["Atelier Beispiel", projects[1]!],
    ["Leerer Kontext", projects[2]!],
  ] as const) {
    await page.getByRole("tab", { name: "Arbeitgeber", exact: true }).click();
    await page
      .getByRole("button", { name: "Arbeitgeber hinzufügen", exact: true })
      .click();
    const row = page.locator(".context-editor").filter({
      has: page.getByRole("heading", {
        name: /Neuer Arbeitgeber/,
      }),
    });
    await row.getByLabel("Anzeigename", { exact: true }).fill(name);
    await row
      .getByRole("combobox", { name: "Todoist-Projekt", exact: true })
      .selectOption(p.id);
    await row
      .getByRole("button", { name: "Kontext speichern", exact: true })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Arbeitgeber", exact: true }),
    ).toContainText(name);
  }
  async function refreshTasks() {
    await page.getByRole("link", { name: "Aufgaben", exact: true }).click();
    const button = page.getByRole("button", {
      name: "Aufgaben aktualisieren",
      exact: true,
    });
    await expect(button).toBeEnabled({ timeout: 65000 });
    await button.click();
    await expect(
      page.getByText("Aufgabenstand vollständig aktualisiert.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Fokus", exact: true }).click();
  }
  await refreshTasks();
  await page
    .getByRole("button", { name: "Tagesvorschau erstellen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Deine Tagesvorschau", exact: true }),
  ).toBeVisible();
  const order = await page.locator(".today-entry h3").allTextContents();
  expect(order).toHaveLength(4);
  await page
    .getByRole("button", { name: "Auswahl bewusst bestätigen", exact: true })
    .click();
  await expect(
    page.getByText(
      "Tagesplan bestätigt. Alle nötigen Abschnittswechsel sind nachgelesen; geschützte Hierarchien bleiben unverändert.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 30000 });
  await page.locator(".operation-panel details > summary").click();
  await expect(
    page.getByText(
      "Lokal ausgewählt · Hierarchie und Todoist-Abschnitt erhalten.",
      { exact: false },
    ),
  ).toBeVisible();
  const second = page.locator(".today-entry").nth(1);
  const title = await second.locator("h3").innerText();
  await second
    .getByRole("button", { name: "Als Fokus wählen", exact: true })
    .click();
  await expect(page.locator(".focus-hero h2")).toHaveText(title);
  await expect(page.locator(".today-entry h3")).toHaveText(order);
  const state = await page.context().storageState();
  const restarted = await chromium.launch();
  const restored = await restarted.newContext({ storageState: state });
  const reopened = await restored.newPage();
  await reopened.goto(baseURL + "/");
  await expect(reopened.locator(".focus-hero h2")).toHaveText(title);
  await expect(reopened.locator(".today-entry h3")).toHaveText(order);
  await restored.close();
  await restarted.close();
  await page.screenshot({ path: "private/e3-focus.png", fullPage: true });
  await page
    .getByRole("button", { name: "Atelier Beispiel", exact: true })
    .click();
  await refreshTasks();
  await page
    .getByRole("button", { name: "Tagesvorschau erstellen", exact: true })
    .click();
  await expect(page.locator(".today-entry")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Auswahl bewusst bestätigen", exact: true })
    .click();
  await expect(
    page.getByText(
      "Tagesplan bestätigt. Alle nötigen Abschnittswechsel sind nachgelesen; geschützte Hierarchien bleiben unverändert.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Privat", exact: true }).click();
  await expect(page.locator(".focus-hero h2")).toHaveText(title);
  await page
    .getByRole("button", { name: "Leerer Kontext", exact: true })
    .click();
  await refreshTasks();
  await page
    .getByRole("button", { name: "Tagesvorschau erstellen", exact: true })
    .click();
  await expect(
    page.getByText(
      "Heute ist hier gerade Platz. Es gibt keine geeigneten Aufgaben im zuletzt geladenen Bestand.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Auswahl bewusst bestätigen",
      exact: true,
    }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
