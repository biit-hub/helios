import { test, expect } from "@playwright/test";
import { bootstrapWorkSettings } from "../fixtures/browser-work";
import { closeTaskDialog } from "../fixtures/task-dialog";
import { projects } from "../fixtures/todoist";
test("E9.4 progress intent is consumed; context, reload and stored drafts never reopen a dialog", async ({
  page,
  baseURL,
}, info) => {
  const { errors } = await bootstrapWorkSettings(page, baseURL);
  await expect(page.locator(".ux-header-date")).toHaveText(
    /^\d{2}\.\d{2}\.\d{4}$/,
  );
  await expect(
    page.getByRole("button", { name: "Information zu Kontextfarbe" }),
  ).toHaveCount(0);
  const privateRow = page
    .locator(".context-editor")
    .filter({ has: page.getByRole("heading", { name: /^Privat\s+Privat$/ }) });
  const project = privateRow.getByRole("combobox", {
    name: "Todoist-Projekt",
    exact: true,
  });
  await expect(
    project.locator('option[value="' + projects[0]!.id + '"]'),
  ).not.toContainText(projects[0]!.id);
  await project.selectOption(projects[0]!.id);
  await privateRow
    .getByRole("button", { name: "Kontext speichern", exact: true })
    .click();
  await page.getByRole("tab", { name: "Arbeitgeber", exact: true }).click();
  await page
    .getByRole("button", { name: "Arbeitgeber hinzufügen", exact: true })
    .click();
  const employer = page.getByRole("dialog", {
    name: "Arbeitgeber hinzufügen",
    exact: true,
  });
  await employer
    .getByLabel("Anzeigename", { exact: true })
    .fill("Atelier E9.4");
  await employer
    .getByRole("combobox", { name: "Todoist-Projekt", exact: true })
    .selectOption(projects[1]!.id);
  await employer
    .getByRole("button", { name: "Kontext speichern", exact: true })
    .click();
  await expect(employer).toBeHidden();
  await page.getByRole("link", { name: "Aufgaben", exact: true }).click();
  const contexts = page.getByRole("group", { name: "Kontext auswählen" });
  await contexts.getByRole("button", { name: "Privat", exact: true }).click();
  const refresh = page.getByRole("button", {
    name: "Aufgaben aktualisieren",
    exact: true,
  });
  await expect(refresh).toBeEnabled({ timeout: 20000 });
  await refresh.click();
  await expect(
    page.getByRole("heading", { name: "Verbindung nachschlagen", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".context-caption")).toHaveCount(0);
  const filters = page.locator(".ux-filter-options > summary");
  await filters.click();
  const help = page.getByRole("button", { name: "Information zu Sortierung" });
  if (info.project.name === "mobile") await help.tap();
  else {
    await help.focus();
    await help.press("Enter");
  }
  await expect(page.getByRole("tooltip")).toBeVisible();
  await help.press("Escape");
  await expect(page.getByRole("tooltip")).toBeHidden();
  await filters.click();

  const pick = page.getByRole("dialog", {
    name: "Fortschritt: Aufgabe auswählen",
    exact: true,
  });
  await page
    .getByRole("link", { name: "Fortschritt notieren", exact: true })
    .click();
  await expect(pick).toBeVisible();
  const { mkdirSync } = await import("node:fs");
  const captures = "private/e9-4/" + info.project.name;
  mkdirSync(captures, { recursive: true });
  await page.screenshot({
    path: captures + "/progress-picker.png",
    fullPage: true,
  });
  await expect
    .poll(() => new URL(page.url()).searchParams.get("progress"))
    .toBeNull();
  await pick.getByRole("button", { name: "Schliessen", exact: true }).click();
  for (const name of ["Atelier E9.4", "Privat"]) {
    await contexts.getByRole("button", { name, exact: true }).click();
    await expect(pick).toBeHidden();
  }
  await page.reload();
  await expect(pick).toBeHidden();
  await page
    .getByRole("link", { name: "Fortschritt notieren", exact: true })
    .click();
  await expect(pick).toBeVisible();
  const search = pick.getByRole("searchbox", { name: "Aufgabe suchen" });
  await search.fill("no-such-synthetic-task");
  await expect(
    pick.getByText(
      "Keine passende aktuelle Aufgabe. Suche oder Aufgabenstand prüfen.",
    ),
  ).toBeVisible();
  await search.fill("Verbindung");
  await search.press("Tab");
  const choice = pick.getByRole("button", { name: /Verbindung nachschlagen/ });
  await expect(choice).toBeFocused();
  await choice.press("Enter");
  const editor = page.getByRole("dialog", {
    name: "Aufgabe bearbeiten",
    exact: true,
  });
  const progress = editor.getByRole("region", {
    name: "Fortschritt dokumentieren",
    exact: true,
  });
  await expect(progress).toBeVisible();
  await progress
    .getByLabel("Was hast du erledigt?")
    .fill("Quellen gesammelt. Noch 30 Minuten");
  await progress
    .getByRole("button", { name: "Vorschlag erstellen", exact: true })
    .click();
  await expect(
    progress.getByText("Entwurf bereit zur bewussten Prüfung.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 20000 });
  await closeTaskDialog(page, editor);
  await contexts
    .getByRole("button", { name: "Atelier E9.4", exact: true })
    .click();
  await contexts.getByRole("button", { name: "Privat", exact: true }).click();
  await page.reload();
  await expect(editor).toBeHidden();
  await expect(pick).toBeHidden();
  await page.getByRole("link", { name: "Fokus", exact: true }).click();
  await page.getByRole("link", { name: "Aufgaben", exact: true }).click();
  await expect(editor).toBeHidden();
  await page
    .getByRole("link", { name: "Fortschritt notieren", exact: true })
    .click();
  await pick
    .getByRole("searchbox", { name: "Aufgabe suchen" })
    .fill("Verbindung");
  await pick.getByRole("button", { name: /Verbindung nachschlagen/ }).click();
  await progress
    .locator("details")
    .filter({
      has: page.getByText("Gespeicherte Entwürfe wieder öffnen", {
        exact: true,
      }),
    })
    .locator("summary")
    .click();
  await progress.getByRole("button", { name: /Quellen gesammelt/ }).click();
  await expect(
    progress.getByText("Entwurf bereit zur bewussten Prüfung.", {
      exact: true,
    }),
  ).toBeVisible();
  await closeTaskDialog(page, editor);
  const folder = "private/e9-4/" + info.project.name;
  mkdirSync(folder, { recursive: true });
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: folder + "/tasks-" + width + ".png",
      fullPage: true,
    });
  }

  await page.getByRole("link", { name: "Tagesplan", exact: true }).click();
  const actions = page.locator(".planning-actions");
  await expect(actions).toBeVisible();
  const metrics = await actions.locator(":scope > *").evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        radius: getComputedStyle(element).borderRadius,
      };
    }),
  );
  expect(metrics).toHaveLength(2);
  expect(Math.abs(metrics[0]!.height - metrics[1]!.height)).toBeLessThan(1);
  expect(metrics[0]!.radius).toBe(metrics[1]!.radius);
  expect(
    metrics[1]!.y > metrics[0]!.y
      ? metrics[1]!.y - metrics[0]!.y - metrics[0]!.height
      : metrics[1]!.x - metrics[0]!.x - metrics[0]!.width,
  ).toBeGreaterThanOrEqual(11);
  const today = await page.locator(".ux-header-date").innerText();
  const historical = page.waitForResponse(
    (response) =>
      response.url().includes("/api/plans?") &&
      response.url().includes("day=2020-01-02"),
  );
  await page.getByLabel("Plantag ansehen", { exact: true }).fill("2020-01-02");
  expect((await (await historical).json()).day).toBe("2020-01-02");
  await expect(page.getByLabel("Plantag ansehen", { exact: true })).toHaveValue(
    "2020-01-02",
  );
  await expect(page.locator(".ux-header-date")).toHaveText(today);
  expect(errors).toEqual([]);
});
