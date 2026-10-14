import { test, expect, chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { generateSync } from "otplib";
import { token, projects } from "../fixtures/todoist";
test("persistent contextual daily plans, hierarchy-safe confirmation, focus and browser restart", async ({
  page,
  baseURL,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "E3-Desktoppilot läuft einmal; die mobile Morgenroutine folgt in einer späteren Etappe.",
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
  // A normal login does not grant permission to replace integration credentials.
  await page.getByLabel("Neuer Todoist-API-Token").fill(token);
  await page
    .getByRole("button", { name: "Token verschlüsselt speichern", exact: true })
    .click();
  const connection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Todoist verbinden" }) });
  await expect(connection.getByRole("alert")).toHaveText(
    "Bitte zuerst Passwort und neuen Authenticator-Code bestätigen.",
  );
  await expect(
    page.getByRole("button", {
      name: "Verbindung prüfen & Projekte laden",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.getByLabel("Neuer Todoist-API-Token")).toHaveValue(token);
  await connection.getByRole("link", { name: /Passwort und neuen/ }).click();
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
  await expect(
    connection.getByText(/Token verschlüsselt gespeichert/),
  ).toBeVisible();
  await expect(connection.getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Verbindung prüfen & Projekte laden",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Verbindung: Verbunden", { exact: true }),
  ).toBeVisible();
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
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
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
      page.getByText("Gespeichert. Todoist-Inhalte bleiben unverändert.", {
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
  expect(await page.locator(".today-entry h3").allTextContents()).toEqual(
    order,
  );
  const state = await page.context().storageState();
  const restarted = await chromium.launch();
  const restored = await restarted.newContext({ storageState: state });
  const reopened = await restored.newPage();
  await reopened.goto(baseURL + "/");
  await expect(reopened.locator(".focus-hero h2")).toHaveText(title);
  expect(await reopened.locator(".today-entry h3").allTextContents()).toEqual(
    order,
  );
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
