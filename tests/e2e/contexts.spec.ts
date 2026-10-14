import { test, expect, devices } from "@playwright/test";
import { projects } from "../fixtures/todoist";
import { bootstrapWorkSettings } from "../fixtures/browser-work";
test("context settings, six themes, real guarded reads, reload, empty and connection-error states", async ({
  page,
  browser,
  baseURL,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Single-user scenario runs once and includes its own mobile context.",
  );
  const { password, nextCode, errors } = await bootstrapWorkSettings(
    page,
    baseURL,
  );
  const privateRow = page
    .locator(".context-editor")
    .filter({ has: page.getByRole("heading", { name: /Privat/ }) });
  await privateRow.getByLabel("Anzeigename").fill("Mein Privat");
  await privateRow
    .getByRole("button", { name: "Waldgrün", exact: true })
    .click();
  await expect(
    privateRow.getByRole("group", { name: "Farbschema" }).getByRole("button"),
  ).toHaveCount(6);
  await privateRow
    .getByRole("combobox", { name: "Todoist-Projekt", exact: true })
    .selectOption(projects[0]!.id);
  await privateRow
    .getByRole("button", { name: "Kontext speichern", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Mein Privat", exact: true }),
  ).toBeVisible();
  for (const [name, p] of [
    ["Atelier Nord", projects[1]!],
    ["Studio West", projects[2]!],
    ["Labor Süd", projects[3]!],
  ] as const) {
    await page
      .getByRole("button", { name: "Arbeitgeber hinzufügen", exact: true })
      .click();
    const row = page.locator(".context-editor").filter({
      has: page.getByRole("heading", { name: /Neuer Arbeitgeber/ }),
    });
    await row.getByLabel("Anzeigename").fill(name);
    await row.getByRole("button", { name: "Meerblau", exact: true }).click();
    await row
      .getByRole("combobox", { name: "Todoist-Projekt", exact: true })
      .selectOption(p.id);
    await row
      .getByRole("button", { name: "Kontext speichern", exact: true })
      .click();
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await page.screenshot({ path: "private/e2-settings.png", fullPage: true });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Labor Süd", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Aufgaben", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mein Privat", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Aufgaben aktualisieren", exact: true }),
  ).toBeEnabled({ timeout: 65000 });
  await page
    .getByRole("button", { name: "Aufgaben aktualisieren", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ausflug vorbereiten", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("2026-10-23", { exact: true })).toBeVisible();
  await expect(
    page.getByText("2026-10-20T10:00:00 · Europe/Zurich", { exact: true }),
  ).toBeVisible();
  const child = page.locator(".task-card").filter({
    has: page.getByRole("heading", { name: "Verbindung nachschlagen" }),
  });
  await child.locator("summary").click();
  await expect(
    child.getByRole("link", { name: "Ausflug vorbereiten", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "private/e2-tasks.png", fullPage: true });
  const parent = page.locator(".task-card").filter({
    has: page.getByRole("heading", { name: "Ausflug vorbereiten" }),
  });
  await parent.locator("summary").click();
  await expect(
    parent.getByRole("button", { name: "Kommentare lesen" }),
  ).toBeEnabled({ timeout: 20000 });
  await parent.getByRole("button", { name: "Kommentare lesen" }).click();
  await expect(parent.getByText("Synthetischer Fortschritt.")).toBeVisible();
  await page.getByRole("button", { name: "Atelier Nord", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Bereit für den ersten Abruf." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Aufgaben aktualisieren", exact: true }),
  ).toBeEnabled({ timeout: 20000 });
  await page
    .getByRole("button", { name: "Aufgaben aktualisieren", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Hier ist gerade Platz." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Atelier Nord", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Einstellungen", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Verbindung prüfen & Projekte laden" }),
  ).toBeEnabled({ timeout: 20000 });
  const fixtureOrigin = new URL(process.env.TODOIST_TEST_ORIGIN!);
  await fetch(new URL("/control", fixtureOrigin), {
    method: "POST",
    body: JSON.stringify({ mode: "auth_error" }),
  });
  await page
    .getByRole("button", { name: "Verbindung prüfen & Projekte laden" })
    .click();
  await expect(page.getByRole("alert").first()).toContainText(
    "API-Token abgewiesen",
  );
  await page.reload();
  await expect(
    page.locator(".problem-row").getByText(/API-Token abgewiesen/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Als geprüft markieren", exact: true })
    .click();
  await expect(page.getByText(/Geprüft · weiterhin offen/)).toBeVisible();
  await fetch(new URL("/control", fixtureOrigin), {
    method: "POST",
    body: JSON.stringify({ mode: "ok" }),
  });
  const stats = await fetch(new URL("/assertions", fixtureOrigin)).then((r) =>
    r.json(),
  );
  expect(stats.writes).toBe(0);
  expect(stats.reads).toBeGreaterThan(10);
  expect(stats.taskProjectIds).not.toContain("inbox:opaque");
  expect(
    stats.taskProjectIds.every((p: string) =>
      projects.slice(0, 2).some((v) => v.id === p),
    ),
  ).toBe(true);
  const mobile = await browser.newContext({
    userAgent: devices["iPhone 13"]!.userAgent,
    viewport: devices["iPhone 13"]!.viewport,
    isMobile: true,
    hasTouch: true,
  });
  const phone = await mobile.newPage();
  await phone.goto(baseURL + "/mobile");
  await phone.getByLabel("Benutzername").fill("synthetic_user");
  await phone.getByLabel("Passwort", { exact: true }).fill(password);
  await phone.getByRole("button", { name: "Weiter", exact: true }).click();
  await phone
    .getByLabel("Authenticator-Code", { exact: true })
    .fill(await nextCode());
  await phone
    .getByRole("button", { name: "Sicher anmelden", exact: true })
    .click();
  await expect(
    phone.getByRole("button", { name: "Studio West", exact: true }),
  ).toBeVisible();
  await phone.getByRole("button", { name: "Studio West", exact: true }).click();
  await expect(
    phone.getByRole("button", { name: "Studio West", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    phone.getByRole("navigation", { name: "Hauptnavigation" }),
  ).toHaveCount(0);
  await mobile.close();
  expect(errors).toEqual([]);
});
