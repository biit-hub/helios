import { test, expect, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { generateSync } from "otplib";
import { token, projects } from "../fixtures/todoist";
test("context settings, six themes, real guarded reads, reload, empty and connection-error states", async ({
  page,
  browser,
  baseURL,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Single-user scenario runs once and includes its own mobile context.",
  );
  execFileSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "tests/e2e/fixture-bootstrap.ts"],
    { stdio: "pipe" },
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const password = "Synthetic passphrase 72!";
  const { proof } = JSON.parse(
    readFileSync("private/e2e-fixture.json", "utf8"),
  );
  await page.goto("/setup");
  await page.getByLabel("Setupnachweis").fill(proof);
  await page.getByLabel("Dein Passwort", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Authenticator einrichten", exact: true })
    .click();
  await page.getByText("Manuell einrichten", { exact: true }).click();
  const secret = (await page.locator(".secret-text").textContent())!.trim();
  let last = "";
  async function nextCode() {
    let code = "";
    await expect
      .poll(
        () => {
          code = generateSync({ secret });
          return code !== last;
        },
        { timeout: 35000, intervals: [500] },
      )
      .toBe(true);
    last = code;
    return code;
  }
  await page
    .getByLabel("Authenticator-Code", { exact: true })
    .fill(await nextCode());
  await page
    .getByRole("button", { name: "Code bestätigen", exact: true })
    .click();
  await page
    .getByLabel("Ich habe die Recovery-Codes sicher gespeichert.")
    .check();
  await page
    .getByRole("button", { name: "Konto aktivieren", exact: true })
    .click();
  await expect(page).toHaveURL(baseURL + "/");
  await page.getByRole("link", { name: "Einstellungen", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Arbeitgeber & Privat" }),
  ).toBeVisible();
  expect(
    await page.request
      .get("/api/work")
      .then((r) => r.json())
      .then((v) => v.contexts),
  ).toHaveLength(1);
  await page.getByLabel("Aktuelles Passwort", { exact: true }).fill(password);
  await page
    .getByLabel("Neuer Authenticator-Code", { exact: true })
    .fill(await nextCode());
  await page
    .getByRole("button", { name: "Änderungen bestätigen", exact: true })
    .click();
  await expect(
    page.getByText("Bestätigung für maximal fünf Minuten gültig."),
  ).toBeVisible();
  await page.getByLabel("Neuer Todoist-API-Token").fill(token);
  await page
    .getByRole("button", { name: "Token verschlüsselt speichern", exact: true })
    .click();
  await expect(page.getByLabel("Neuer Todoist-API-Token")).toHaveValue("");
  await page
    .getByRole("button", {
      name: "Verbindung prüfen & Projekte laden",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Verbindung: Verbunden", { exact: true }),
  ).toBeVisible();
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
