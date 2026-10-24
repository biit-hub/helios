import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { bootstrapWorkSettings } from "../fixtures/browser-work";

test("E9.3 approved shell, contextual scopes, employer dialog, six color previews and keyboard help", async ({
  page,
  baseURL,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "One synthetic scenario includes all three responsive widths.",
  );
  const { errors } = await bootstrapWorkSettings(page, baseURL);
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
  await expect(nav.locator("a")).toHaveText([
    "Fokus",
    "Tagesplan",
    "Aufgaben",
    "Epics",
    "Morgenroutine",
    "Probleme",
    "Einstellungen",
  ]);
  await expect(
    page.getByRole("group", { name: "Kontext auswählen" }),
  ).toHaveCount(0);
  const color = page.getByRole("combobox", {
    name: "Kontextfarbe",
    exact: true,
  });
  await expect(color.locator("option")).toHaveCount(6);
  await color.selectOption("gold");
  await expect(
    page.getByRole("img", { name: "Farbvorschau: Gold" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Arbeitgeber", exact: true }).click();
  await page.getByRole("tab", { name: "Privat", exact: true }).click();
  await expect(color).toHaveValue("gold");
  await page.getByRole("tab", { name: "Arbeitgeber", exact: true }).click();
  await page
    .getByRole("button", { name: "Arbeitgeber hinzufügen", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Arbeitgeber hinzufügen",
    exact: true,
  });
  await dialog
    .getByLabel("Anzeigename", { exact: true })
    .fill("E9.3 synthetischer Arbeitgeber");
  await dialog
    .getByRole("combobox", { name: "Kontextfarbe", exact: true })
    .selectOption("blue");
  await expect(
    dialog.getByRole("img", { name: "Farbvorschau: Meerblau" }),
  ).toBeVisible();
  const help = dialog.getByRole("button", {
    name: "Information zu Kontextfarbe",
  });
  await help.focus();
  await help.press("Enter");
  await expect(dialog.getByRole("tooltip")).toBeVisible();
  await help.press("Escape");
  await expect(dialog.getByRole("tooltip")).toBeHidden();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Schliessen", exact: true }).click();
  await expect(
    dialog.getByText("Ungespeicherte Eingaben verwerfen?", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Weiterbearbeiten", exact: true })
    .click();
  await expect(dialog.getByLabel("Anzeigename", { exact: true })).toHaveValue(
    "E9.3 synthetischer Arbeitgeber",
  );
  await dialog
    .getByRole("button", { name: "Kontext speichern", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("combobox", { name: "Arbeitgeber", exact: true }),
  ).toContainText("E9.3 synthetischer Arbeitgeber");
  const folder = "private/e9-3/implemented";
  mkdirSync(folder, { recursive: true });
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${folder}/settings-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.getByRole("link", { name: "Fokus", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Privat", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const active = page.locator('.context-pill[aria-pressed="true"]');
    expect(
      await active.evaluate((e) => getComputedStyle(e, "::after").content),
    ).toBe("none");
    await page.screenshot({
      path: `${folder}/focus-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await expect(
    page.getByRole("button", { name: "KI-Auftrag starten", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Probleme", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Kontext auswählen" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Fokus", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Privat", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
