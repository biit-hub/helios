import { expect, test } from "@playwright/test";
import { bootstrapWorkSettings } from "../fixtures/browser-work";
import type { TaskOperationView } from "@helios/contracts";
import { projects } from "../fixtures/todoist";
test("E4 verified create/edit refresh without F5; comments, waiting, labels, close and history", async ({
  page,
  baseURL,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Desktop workflow; mobile routine is separate.",
  );
  const { errors } = await bootstrapWorkSettings(page, baseURL);
  const contextRow = page
    .locator(".context-editor")
    .filter({ has: page.getByRole("heading", { name: /Privat/ }) });
  await contextRow
    .getByRole("combobox", { name: "Todoist-Projekt", exact: true })
    .selectOption(projects[0]!.id);
  await contextRow
    .getByRole("button", { name: "Kontext speichern", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Aufgabe erfassen", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Aufgabe erfassen" });
  await dialog
    .getByLabel("Titel", { exact: true })
    .fill("Synthetische Eingangserfassung E4");
  await dialog
    .getByRole("button", { name: "Aufgabe erstellen", exact: true })
    .dblclick();
  await expect(dialog).toBeHidden({ timeout: 20000 });
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Aufgabe in Todoist erstellt und nachgewiesen." }),
  ).toBeVisible();
  const journal: TaskOperationView[] = await page.request
    .get("/api/tasks")
    .then((r) => r.json());
  const intake = journal.filter(
    (r) => r.input?.fields?.content === "Synthetische Eingangserfassung E4",
  );
  expect(intake).toHaveLength(1);
  expect(intake[0]!.status).toBe("succeeded");
  expect(intake[0]!.result).toMatchObject({ task: { id: expect.any(String) } });
  await page.getByRole("link", { name: "Aufgaben", exact: true }).click();
  await page
    .getByRole("button", { name: "Aufgabe erfassen", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Aufgabe erfassen" });
  await dialog
    .getByLabel("Titel", { exact: true })
    .fill("Synthetische Verwaltungsaufgabe E4");
  await dialog
    .getByRole("combobox", { name: "Todoist-Projekt", exact: true })
    .selectOption(projects[0]!.id);
  await dialog
    .getByRole("textbox", { name: "Beschreibung", exact: true })
    .fill(
      "## Ziel\nSynthetischer Inhalt bleibt erhalten.\n\n[Notiz](https://example.com/note)",
    );
  const labels = dialog.getByRole("combobox", { name: "Labels suchen" });
  await labels.fill("Doku");
  await expect(
    dialog.getByRole("option", { name: "Dokumentation" }),
  ).toBeVisible();
  await labels.press("Enter");
  await expect(
    dialog.getByRole("button", { name: "Label entfernen: Dokumentation" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Aufgabe erstellen", exact: true })
    .click();
  await expect(dialog).toBeHidden({ timeout: 20000 });
  await expect(
    page.getByRole("heading", {
      name: "Synthetische Verwaltungsaufgabe E4",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Aufgaben suchen", { exact: true })
    .fill("Verwaltungsaufgabe E4");
  await expect(page.locator(".task-list .task-card")).toHaveCount(1);
  async function open(title = "Synthetische Aufgabe E4 bearbeitet") {
    const row = page
      .locator(".task-entry")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    if ((await row.getAttribute("open")) === null)
      await row.locator(":scope > summary").click();
    await page
      .getByRole("button", {
        name: "Aufgabe öffnen und bearbeiten: " + title,
        exact: true,
      })
      .click();
    const editor = page.getByRole("dialog", { name: "Aufgabe bearbeiten" });
    await expect(editor.getByLabel("Titel", { exact: true })).toHaveValue(
      title,
    );
    await editor.locator(".ux-editor-actions > summary").click();
    return editor;
  }
  dialog = await open("Synthetische Verwaltungsaufgabe E4");
  await expect(
    dialog.getByRole("button", { name: "Label entfernen: Dokumentation" }),
  ).toBeVisible();
  await dialog
    .getByLabel("Titel", { exact: true })
    .fill("Synthetische Aufgabe E4 bearbeitet");
  await dialog
    .getByRole("textbox", { name: "Beschreibung", exact: true })
    .fill(
      "## Ziel\nSynthetischer Inhalt bleibt erhalten.\n\nDie Bearbeitung wurde geprüft.\n\n[Notiz](https://example.com/note)",
    );
  await dialog
    .getByRole("combobox", { name: "Priorität", exact: true })
    .selectOption("3");
  await dialog.locator(".ux-editor-planning > summary").click();
  await dialog
    .getByLabel("Geplantes Datum", { exact: true })
    .fill("2026-10-20");
  await dialog.getByLabel("Echte Deadline", { exact: true }).fill("2026-10-23");
  await dialog
    .getByRole("button", { name: "Änderungen bewusst bestätigen", exact: true })
    .click();
  await expect(dialog).toBeHidden({ timeout: 20000 });
  await expect(
    page.getByRole("heading", {
      name: "Synthetische Aufgabe E4 bearbeitet",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.getByLabel("Aufgaben suchen", { exact: true }).inputValue(),
  ).toBe("");
  dialog = await open();
  await dialog.locator(".ux-editor-planning > summary").click();
  await expect(
    dialog.getByRole("textbox", { name: "Beschreibung", exact: true }),
  ).toHaveValue(/Die Bearbeitung wurde geprüft/);
  await expect(
    dialog.getByRole("combobox", { name: "Priorität", exact: true }),
  ).toHaveValue("3");
  await expect(
    dialog.getByLabel("Geplantes Datum", { exact: true }),
  ).toHaveValue("2026-10-20");
  await expect(
    dialog.getByLabel("Echte Deadline", { exact: true }),
  ).toHaveValue("2026-10-23");
  await dialog
    .getByLabel("Kommentar", { exact: true })
    .fill("Synthetischer Kommentar E4");
  await dialog
    .getByRole("button", { name: "Kommentar hinzufügen", exact: true })
    .click();
  await expect(dialog).toBeHidden({ timeout: 20000 });
  dialog = await open();
  await dialog
    .getByText("Kommentare und vorhandene Beschreibung", { exact: true })
    .click();
  await expect(
    dialog.getByText("Synthetischer Kommentar E4", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByLabel("Wartet auf", { exact: true })
    .fill("Synthetisches Team");
  await dialog.getByLabel("Gegenstand", { exact: true }).fill("Freigabe");
  await dialog.getByLabel("Nachfassen am", { exact: true }).fill("2026-10-22");
  await dialog
    .getByRole("button", { name: "Warten bewusst bestätigen", exact: true })
    .click();
  await expect(dialog).toBeHidden({ timeout: 20000 });
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("Wartet");
  await expect(
    page.getByRole("heading", {
      name: "Synthetische Aufgabe E4 bearbeitet",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: "private/e4-tasks.png", fullPage: true });
  dialog = await open();
  await dialog
    .getByLabel(
      "Ich bestätige ausdrücklich den Abschluss beziehungsweise die endgültige Löschung dieser Aufgabe.",
    )
    .check();
  await dialog
    .getByRole("button", { name: "Aufgabe abschliessen", exact: true })
    .click();
  await expect(dialog).toBeHidden({ timeout: 20000 });
  await expect(
    page
      .locator(".task-list")
      .getByRole("heading", { name: "Synthetische Aufgabe E4 bearbeitet" }),
  ).toHaveCount(0);
  await page.locator(".historical-tasks > summary").click();
  await expect(
    page
      .locator(".historical-tasks")
      .getByRole("heading", { name: "Synthetische Aufgabe E4 bearbeitet" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".historical-tasks")
      .getByRole("button", { name: /öffnen und bearbeiten/i }),
  ).toHaveCount(0);
  await page.reload();
  await page
    .getByText("Aufgabenänderungen und Einzelergebnisse", { exact: true })
    .click();
  await expect(
    page.getByText("Extern nachgewiesen", { exact: true }).first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
