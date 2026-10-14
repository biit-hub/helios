import { test, expect, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { generateSync } from "otplib";
const password = "Synthetic passphrase 72!";
let previousCode = "";
async function nextCode(secret: string) {
  let code = "";
  await expect
    .poll(
      () => {
        code = generateSync({ secret });
        return code !== previousCode;
      },
      { timeout: 35000, intervals: [500] },
    )
    .toBe(true);
  previousCode = code;
  return code;
}
test("complete bootstrap, MFA, simultaneous sessions, step-up, recovery and password change", async ({
  page,
  browser,
  baseURL,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Single-user lifecycle executes once; mobile guards run in both projects.",
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { proof } = JSON.parse(
    readFileSync("private/e2e-fixture.json", "utf8"),
  );
  await page.goto("/setup");
  await page.getByLabel("Setupnachweis").fill(proof);
  await page.getByLabel("Dein Passwort", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Authenticator einrichten", exact: true })
    .click();
  await expect(
    page.getByAltText("QR-Code für den Helios-Authenticator"),
  ).toBeVisible();
  await page.getByText("Manuell einrichten", { exact: true }).click();
  let secret = (await page.locator(".secret-text").textContent())!.trim();
  await page
    .getByLabel("Authenticator-Code", { exact: true })
    .fill(await nextCode(secret));
  await page
    .getByRole("button", { name: "Code bestätigen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Recovery-Codes sicher aufbewahren" }),
  ).toBeVisible();
  const recoveryCodes = await page
    .locator(".recovery-codes li")
    .allTextContents();
  expect(recoveryCodes).toHaveLength(10);
  expect(await page.request.get("/api/protected").then((r) => r.status())).toBe(
    401,
  );
  await page
    .getByLabel("Ich habe die Recovery-Codes sicher gespeichert.")
    .check();
  await page
    .getByRole("button", { name: "Konto aktivieren", exact: true })
    .click();
  await expect(page).toHaveURL(baseURL + "/");
  await expect(page.getByText(/Dein Zugang ist geschützt/)).toBeVisible();
  const second = await browser.newContext({
    userAgent: devices["iPhone 13"]!.userAgent,
    isMobile: true,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  const mobile = await second.newPage();
  await mobile.goto(baseURL + "/mobile");
  await mobile.getByLabel("Benutzername").fill("synthetic_user");
  await mobile.getByLabel("Passwort", { exact: true }).fill(password);
  await mobile.getByLabel("Diesem Gerät vertrauen").check();
  await mobile.getByRole("button", { name: "Weiter", exact: true }).click();
  expect(
    await mobile.request.get("/api/protected").then((r) => r.status()),
  ).toBe(401);
  await mobile
    .getByLabel("Authenticator-Code", { exact: true })
    .fill(await nextCode(secret));
  await mobile
    .getByRole("button", { name: "Sicher anmelden", exact: true })
    .click();
  await expect(mobile).toHaveURL(baseURL + "/mobile");
  expect(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/settings/security");
  await expect(page.locator(".sessions li")).toHaveCount(2);
  await page.getByLabel("Aktuelles Passwort").fill(password);
  await page
    .getByLabel("Neuer Authenticator-Code")
    .fill(await nextCode(secret));
  await page
    .getByRole("button", {
      name: "Sicherheitsaktionen bestätigen",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Bestätigung für maximal fünf Minuten gültig."),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Alle anderen Sitzungen widerrufen",
      exact: true,
    })
    .click();
  await expect(page.locator(".sessions li")).toHaveCount(1);
  expect(
    await mobile.request.get("/api/protected").then((r) => r.status()),
  ).toBe(401);
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  await expect(page).toHaveURL(baseURL + "/login");
  await page.getByLabel("Benutzername").fill("synthetic_user");
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Authenticator verloren? Recovery-Code verwenden",
    })
    .click();
  await page
    .getByLabel("Recovery-Code", { exact: true })
    .fill(recoveryCodes[0]!);
  await page
    .getByRole("button", { name: "Sicher anmelden", exact: true })
    .click();
  await expect(page).toHaveURL(baseURL + "/setup");
  expect(await page.request.get("/api/protected").then((r) => r.status())).toBe(
    401,
  );
  await page.getByLabel("Dein Passwort", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Authenticator einrichten", exact: true })
    .click();
  await expect(
    page.getByAltText("QR-Code für den Helios-Authenticator"),
  ).toBeVisible();
  await page.getByText("Manuell einrichten", { exact: true }).click();
  secret = (await page.locator(".secret-text").textContent())!.trim();
  previousCode = "";
  await page
    .getByLabel("Authenticator-Code", { exact: true })
    .fill(await nextCode(secret));
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
  await page.goto("/settings/security");
  await page.getByLabel("Aktuelles Passwort").fill(password);
  await page
    .getByLabel("Neuer Authenticator-Code")
    .fill(await nextCode(secret));
  await page
    .getByRole("button", {
      name: "Sicherheitsaktionen bestätigen",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Bestätigung für maximal fünf Minuten gültig."),
  ).toBeVisible();
  await page
    .getByLabel("Neues Passwort", { exact: true })
    .fill("Another synthetic passphrase 73!");
  await page
    .getByRole("button", {
      name: "Passwort ändern und neu anmelden",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(baseURL + "/login");
  expect(await page.request.get("/api/protected").then((r) => r.status())).toBe(
    401,
  );
  await second.close();
  expect(errors).toEqual([]);
});
