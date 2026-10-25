import { test, expect } from "@playwright/test";
import { bootstrapWorkSettings } from "../fixtures/browser-work";
import { projects } from "../fixtures/todoist";
test("E8 native Epic, reviewed goal/checklist/link edits, reload and safe manual subtree detachment", async ({
  page,
  baseURL,
}, info) => {
  // Die eigenständige mobile Routine ist E11; E8 bietet bewusst eine Desktop-Epicansicht.
  // Die gemeinsamen API-/MFA-/Scope-Verträge werden unabhängig davon serverseitig geprüft.
  test.skip(
    info.project.name !== "desktop",
    "Desktop-Epicansicht; mobile Routine bleibt E11.",
  );
  const { errors } = await bootstrapWorkSettings(page, baseURL);
  await fetch(new URL("/control", process.env.TODOIST_TEST_ORIGIN!), {
    method: "POST",
    body: JSON.stringify({ mode: "ok", scenario: "epics" }),
  });
  const context = page
    .locator(".context-editor")
    .filter({ has: page.getByRole("heading", { name: /Privat/ }) });
  await context
    .getByRole("combobox", { name: "Todoist-Projekt", exact: true })
    .selectOption(projects[0]!.id);
  await context
    .getByRole("button", { name: "Kontext speichern", exact: true })
    .click();
  await page.getByRole("link", { name: "Aufgaben", exact: true }).click();
  const refresh = page.getByRole("button", {
    name: "Aufgaben aktualisieren",
    exact: true,
  });
  await expect(refresh).toBeEnabled({ timeout: 65000 });
  await refresh.click();
  await page.getByRole("link", { name: "Epics", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetisches Handbuch", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Epic öffnen", exact: true }).click();
  const doc = page.locator(".task-document");
  await doc
    .locator("summary")
    .filter({ hasText: /^Ziel$/ })
    .click();
  await doc
    .locator("summary")
    .filter({ hasText: /^Dokumentenlinks$/ })
    .click();
  await expect(
    doc.getByRole("textbox", { name: "Ziel", exact: true }),
  ).toHaveValue("Handbuch veröffentlichen", { timeout: 20000 });
  await doc
    .locator("summary")
    .filter({ hasText: /^Hierarchie und Fortschritt$/ })
    .click();
  await expect(
    doc.getByRole("link", { name: "Synthetische Quellen", exact: true }),
  ).toBeVisible();
  await doc
    .getByRole("textbox", { name: "Ziel", exact: true })
    .fill("Geprüftes synthetisches Handbuch veröffentlichen");
  await doc
    .getByRole("button", { name: "Zieländerung prüfen", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Änderungen speichern", exact: true }),
  ).toBeVisible();
  await doc
    .getByRole("button", { name: "Änderung bewusst bestätigen", exact: true })
    .click();
  await expect(doc.getByRole("status")).toContainText(
    "In Todoist nachgewiesen",
    { timeout: 25000 },
  );
  await doc
    .locator("summary")
    .filter({ hasText: /^Checkliste \(/ })
    .click();
  await doc
    .getByLabel("Checklistenpunkt 1", { exact: true })
    .fill("Quellen gründlich sammeln");
  await doc
    .getByLabel("Neuer Checklistenpunkt", { exact: true })
    .fill("Gliederung prüfen");
  await doc
    .getByRole("button", { name: "Checklistenpunkt hinzufügen", exact: true })
    .click();
  await doc
    .getByLabel("Checklistenpunkt 2", { exact: true })
    .fill("Gliederung prüfen");
  await doc.getByLabel("Punkt 2 erledigt", { exact: true }).check();
  await doc
    .getByRole("button", { name: "Punkt 2 nach oben", exact: true })
    .click();
  await doc
    .getByRole("button", { name: "Checklistenänderung prüfen", exact: true })
    .click();
  await doc
    .getByRole("button", { name: "Änderung bewusst bestätigen", exact: true })
    .click();
  await expect(doc.getByRole("status")).toContainText(
    "In Todoist nachgewiesen",
    { timeout: 25000 },
  );
  await doc
    .getByLabel("Linkbezeichnung", { exact: true })
    .fill("Synthetischer Obsidian-Plan");
  await doc
    .getByLabel("Dokumentenadresse (HTTP, HTTPS oder Obsidian)", {
      exact: true,
    })
    .fill("obsidian://open?vault=Test&file=Handbuch");
  await doc
    .getByRole("button", { name: "Neuen Link prüfen", exact: true })
    .click();
  await doc
    .getByRole("button", { name: "Änderung bewusst bestätigen", exact: true })
    .click();
  await expect(
    doc.getByRole("link", { name: "Synthetischer Obsidian-Plan", exact: true }),
  ).toHaveAttribute("href", "obsidian://open?vault=Test&file=Handbuch");
  await page.screenshot({ path: "private/e8-epics.png", fullPage: true });
  await page.reload();
  await page.getByRole("button", { name: "Epic öffnen", exact: true }).click();
  await page
    .locator(".task-document summary")
    .filter({ hasText: /^Ziel$/ })
    .click();
  await expect(
    page
      .locator(".task-document")
      .getByRole("textbox", { name: "Ziel", exact: true }),
  ).toHaveValue("Geprüftes synthetisches Handbuch veröffentlichen");
  await page
    .getByRole("button", {
      name: "Aufgabenformular und manuelle Aktionen öffnen",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Aufgabe bearbeiten",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Aufgabe abschliessen", exact: true })
    .click();
  const completion = page.getByRole("dialog", {
    name: "Aufgabe abschliessen",
    exact: true,
  });
  await expect(
    completion.getByRole("heading", {
      name: "Epic manuell abschliessen",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    completion.getByRole("button", {
      name: "Abschluss bestätigen",
      exact: true,
    }),
  ).toBeDisabled();
  await completion
    .getByLabel(/Alle angezeigten offenen Teilbäume bewusst trennen/)
    .check();
  await completion
    .getByLabel(/Ich bestätige die angezeigte Hierarchiewirkung/)
    .check();

  await completion
    .getByRole("button", { name: "Abschluss bestätigen", exact: true })
    .click();
  await expect(dialog).toBeHidden({ timeout: 25000 });
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Änderung in Todoist gespeichert und nachgewiesen." }),
  ).toBeVisible();
  const data = await page.request
    .get(
      "/api/epics?contextId=" +
        (await page.request.get("/api/work").then((r) => r.json())).contexts[0]
          .id +
        "&taskId=browser-child",
    )
    .then((r) => r.json());
  expect(data.inspection.task.checked).toBe(false);
  expect(data.inspection.task.parent_id).toBeNull();
  expect(data.children[0].id).toBe("browser-grandchild");
  expect(errors).toEqual([]);
});
