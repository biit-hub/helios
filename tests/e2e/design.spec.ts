import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { bootstrapWorkSettings } from "../fixtures/browser-work";
import { projects } from "../fixtures/todoist";

const phase = process.env.DESIGN_CAPTURE_PHASE ?? "current";
if (!["before", "after", "current"].includes(phase))
  throw new Error("Unknown design capture phase");
async function capture(page: Page, name: string) {
  await expect(
    page.locator('.context-picker [aria-pressed="true"]'),
  ).toBeVisible();
  const folder = `private/e9-1/${phase}`;
  mkdirSync(folder, { recursive: true });
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(
      page.locator('.context-picker [aria-pressed="true"]'),
    ).toBeVisible();
    if (name === "epics")
      await expect(page.locator(".epic-grid h3").first()).toBeVisible();
    if (name === "agenda" || name === "focus")
      await expect(page.locator(".agenda-entry").first()).toBeVisible();
    if (phase !== "before") {
      await expect(
        page.getByRole("button", { name: "＋ Aufgabe erfassen", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `${folder}/${name}-${width}.png`,
      fullPage: (await page.getByRole("dialog").count()) === 0,
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
async function connectProject(page: Page, scenario: string) {
  const response = await fetch(
    new URL("/control", process.env.TODOIST_TEST_ORIGIN!),
    {
      method: "POST",
      body: JSON.stringify({ mode: "ok", scenario }),
    },
  );
  expect(response.ok).toBe(true);
  const editor = page.locator(".context-editor").filter({
    has: page.getByRole("heading", { name: /Privat/ }),
  });
  await editor
    .getByRole("combobox", { name: "Todoist-Projekt", exact: true })
    .selectOption(projects[0]!.id);
  await editor
    .getByRole("button", { name: "Kontext speichern", exact: true })
    .click();
  await page.getByRole("link", { name: "Aufgaben", exact: true }).click();
  const refresh = page.getByRole("button", {
    name: "Aufgaben aktualisieren",
    exact: true,
  });
  await expect(refresh).toBeEnabled({ timeout: 65000 });
  await refresh.click();
  await expect(page.locator(".task-card").first()).toBeVisible();
}

test("E9.1 synthetic desktop design evidence: settings, tasks, dialogs, plan, focus, routine", async ({
  page,
  baseURL,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Desktop-Audit; mobile PWA bleibt E11.",
  );
  const { errors } = await bootstrapWorkSettings(page, baseURL);
  await expect(
    page.getByRole("heading", { name: "TermiHub verbinden" }),
  ).toBeVisible();
  if (phase !== "before") {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("link", { name: "Zum Inhalt", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
    await page.locator("#main-content").evaluate((element) => element.blur());
    await expect(
      page.getByRole("navigation", { name: "Einstellungsbereiche" }),
    ).toBeVisible();
  }
  await capture(page, "settings");
  await connectProject(page, "planning");
  await capture(page, "tasks");
  await page
    .getByRole("button", { name: /^Aufgabe öffnen und bearbeiten:/ })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Aufgabe bearbeiten" }),
  ).toBeVisible();
  await capture(page, "task-editor");
  await page
    .getByRole("button", { name: "Dialog schliessen / Entwurf verwerfen" })
    .click();
  await page
    .getByRole("button", { name: "＋ Aufgabe erfassen", exact: true })
    .click();
  await page.getByRole("button", { name: "KI-Modus", exact: true }).click();
  await capture(page, "ai-capture");
  await page
    .getByRole("button", { name: "Dialog schliessen / Entwurf verwerfen" })
    .click();
  await page.getByRole("link", { name: "Fokus", exact: true }).click();
  await page
    .getByRole("button", { name: "Tagesvorschau erstellen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Deine Tagesvorschau", exact: true }),
  ).toBeVisible();
  await capture(page, "plan-preview");
  await page
    .getByRole("button", { name: "Auswahl bewusst bestätigen", exact: true })
    .click();
  await expect(page.locator(".focus-hero h2")).toBeVisible({ timeout: 30000 });
  await capture(page, "focus");
  await page.getByRole("link", { name: "Tagesplan", exact: true }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Hauptnavigation" })
      .getByRole("link", { name: "Tagesplan", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.locator('.context-picker [aria-pressed="true"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Heute im Blick", exact: true }),
  ).toBeVisible();
  await capture(page, "agenda");
  await page.getByRole("link", { name: "Morgenroutine", exact: true }).click();
  await page
    .getByRole("button", { name: "Morgenroutine starten", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Schritte der Morgenroutine" }),
  ).toBeVisible();
  await capture(page, "morning-loading");
  await expect(
    page.getByText("Eingang wird gelesen …", { exact: true }),
  ).toHaveCount(0);
  await capture(page, "morning-inbox");
  await page.getByRole("button", { name: /^Kontexte wählen ·/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Für welche Kontexte möchtest du planen?",
      exact: true,
    }),
  ).toBeVisible();
  await capture(page, "morning-contexts");
  await page
    .locator(".routine-contexts")
    .getByRole("checkbox", { name: "Privat", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Kontextauswahl speichern", exact: true })
    .click();
  const steps = page.getByRole("navigation", {
    name: "Schritte der Morgenroutine",
  });
  await steps.getByRole("button", { name: /^Rückblick ·/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Ein ruhiger Rückblick · Privat",
      exact: true,
    }),
  ).toBeVisible();
  await capture(page, "morning-review");
  await steps.getByRole("button", { name: /^Aufgaben klären ·/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Was möchtest du noch klären?",
      exact: true,
    }),
  ).toBeVisible();
  await capture(page, "morning-enrichment");
  await steps.getByRole("button", { name: /^Tagesplanung ·/ }).click();
  await expect(
    page.getByRole("heading", { name: "Heute im Blick", exact: true }),
  ).toBeVisible();
  await capture(page, "morning-planning");
  await steps.getByRole("button", { name: /^Probleme prüfen ·/ }).click();
  await expect(
    page.getByRole("heading", { name: "Verbindungen & Probleme", exact: true }),
  ).toBeVisible();
  await capture(page, "morning-problems");
  expect(errors).toEqual([]);
});

test("E9.1 synthetic desktop design evidence: Epic and SMART editor", async ({
  page,
  baseURL,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Desktop-Audit; mobile PWA bleibt E11.",
  );
  const { errors } = await bootstrapWorkSettings(page, baseURL);
  await connectProject(page, "epics");
  await page.getByRole("link", { name: "Epics", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetisches Handbuch", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Epics und Ziele", exact: true }),
  ).toBeVisible();
  await capture(page, "epics");
  await page.getByRole("button", { name: "Epic öffnen", exact: true }).click();
  await page.locator(".task-document summary").first().click();
  await expect(
    page.getByRole("textbox", { name: "Ziel", exact: true }),
  ).toHaveValue("Handbuch veröffentlichen");
  await capture(page, "epic-editor");
  expect(errors).toEqual([]);
});

test("E9.1 synthetic desktop design evidence: TermiHub mappings, read error and loading", async ({
  page,
  baseURL,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Desktop-Audit; mobile PWA bleibt E11.",
  );
  const { errors } = await bootstrapWorkSettings(page, baseURL);
  const fixtureOrigin = new URL(process.env.TODOIST_TEST_ORIGIN!).origin;
  const reset = await fetch(fixtureOrigin + "/termihub-control", {
    method: "POST",
    body: JSON.stringify({ reset: true, mode: "ok" }),
  });
  expect(reset.ok).toBe(true);
  const panel = page.getByRole("region", { name: "TermiHub-Einstellungen" });
  await panel.getByLabel("TermiHub-Serveradresse").fill(fixtureOrigin);
  await panel
    .getByLabel("Neuer TermiHub-API-Token")
    .fill("synthetic-termihub-only");
  await panel
    .getByRole("button", {
      name: "TermiHub-Token verschlüsselt speichern",
      exact: true,
    })
    .click();
  await expect(panel.getByLabel("Neuer TermiHub-API-Token")).toHaveValue("");
  await panel
    .getByRole("button", {
      name: "Verbindung prüfen & Kalender lesen",
      exact: true,
    })
    .click();
  await expect(panel.getByText(/Synthetic calendar ·/)).toBeVisible({
    timeout: 35000,
  });
  if (phase !== "before") {
    await expect(
      panel.getByRole("group", {
        name: "1. Verbindung einrichten",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      panel.getByRole("group", {
        name: "4. Kalender bewusst zuordnen",
        exact: true,
      }),
    ).toBeVisible();
  }
  await capture(page, "termihub-mappings");
  await page.route("**/api/termihub", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: {
          message:
            "Synthetischer Verbindungsfehler. Bitte später erneut laden.",
        },
      },
    }),
  );
  await page.reload();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Synthetischer Verbindungsfehler." }),
  ).toBeVisible();
  await capture(page, "settings-error");
  await page.unroute("**/api/termihub");
  let release: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/termihub", async (route) => {
    await ready;
    await route.continue();
  });
  try {
    await page.reload();
    await expect(
      page.getByText("Kalendereinstellungen werden geladen …", { exact: true }),
    ).toBeVisible();
    await capture(page, "settings-loading");
  } finally {
    release();
  }
  await expect(panel.getByLabel("TermiHub-Serveradresse")).toBeVisible();
  expect(errors).toEqual([]);
});
