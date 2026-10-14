import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { generateSync } from "otplib";
import { token } from "./todoist";
export async function bootstrapWorkSettings(
  page: Page,
  baseURL: string | undefined,
) {
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

  return { password, nextCode, errors };
}
