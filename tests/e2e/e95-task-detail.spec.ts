import { test, expect } from "@playwright/test";
import { bootstrapWorkSettings } from "../fixtures/browser-work";
import { openTaskEditor } from "../fixtures/task-detail";
import { closeTaskDialog } from "../fixtures/task-dialog";
import { projects } from "../fixtures/todoist";

async function prepare(
  page: Parameters<typeof bootstrapWorkSettings>[0],
  baseURL: string | undefined,
) {
  const result = await bootstrapWorkSettings(page, baseURL);
  const context = page
    .locator(".context-editor")
    .filter({ has: page.getByRole("heading", { name: /^Privat\s+Privat$/ }) });
  await context
    .getByRole("combobox", { name: "Todoist-Projekt", exact: true })
    .selectOption(projects[0]!.id);
  await context
    .getByRole("button", { name: "Kontext speichern", exact: true })
    .click();
  await page.getByRole("link", { name: "Aufgaben", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Aufgaben", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Aufgabe erfassen", exact: true })
    .click();
  const create = page.getByRole("dialog", {
    name: "Aufgabe erfassen",
    exact: true,
  });
  await create
    .getByLabel("Titel", { exact: true })
    .fill("E9.5 synthetische UI-Aufgabe");
  await create
    .getByRole("combobox", { name: "Todoist-Projekt", exact: true })
    .selectOption(projects[0]!.id);
  await create
    .getByRole("textbox", { name: "Beschreibung", exact: true })
    .fill(
      "**Originalnotiz** bleibt erhalten.\n\n## Ziel\nEin prüfbares Ergebnis\n\n## Checkliste\n- [ ] Vorbereiten\n- [x] Klären\n- [ ] Prüfen\n\n## Notizen\n[Dokumentation](https://example.com/helios)",
    );
  await create
    .getByRole("button", { name: "Aufgabe erstellen", exact: true })
    .click();
  await expect(create).toBeHidden({ timeout: 20000 });
  return result;
}
test("E9.5 compact task properties, flat sections, draft protection, persistent toolbar and explicit action dialogs", async ({
  page,
  baseURL,
}, info) => {
  const { errors } = await prepare(page, baseURL);
  const title = "E9.5 synthetische UI-Aufgabe";
  const row = page
    .locator(".task-entry")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await row.locator(":scope > summary").click();
  await expect(row.getByText("Status", { exact: true })).toBeVisible();
  await expect(row.getByText("Priorität", { exact: true })).toBeVisible();
  await expect(
    row.getByRole("heading", { name: "Beschreibung", exact: true }),
  ).toBeVisible();
  await expect(row.getByText("Originalnotiz", { exact: true })).toBeVisible();
  await expect(
    row.getByRole("button", { name: "Kommentare lesen", exact: true }),
  ).toHaveCount(0);
  await expect(row.locator(".task-open")).toHaveCount(0);
  await row
    .locator("summary")
    .filter({ hasText: /^Kommentare$/ })
    .click();
  await expect(
    row.getByText("Keine Kommentare vorhanden.", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await row
    .locator("summary")
    .filter({ hasText: /^Technische Aufgabendetails$/ })
    .focus();
  await page.keyboard.press("Enter");
  await expect(row.getByText(/^Todoist-ID:/)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(row.getByText(/^Todoist-ID:/)).toBeHidden();
  await page.screenshot({
    path: `private/e9-5/${info.project.name}/expanded-task.png`,
    fullPage: true,
  });
  let editor = await openTaskEditor(page, title);
  await expect(editor.locator(":scope > .panel-heading button")).toHaveCount(0);
  await expect(
    editor.getByLabel("Aufgabenaktionen", { exact: true }).getByRole("button"),
  ).toHaveCount(7);
  const docs = editor.locator(".task-document");
  await expect(docs.locator("details details")).toHaveCount(0);
  await docs
    .locator("summary")
    .filter({ hasText: /^Checkliste \(3\)$/ })
    .click();
  await docs
    .getByLabel("Neuer Checklistenpunkt", { exact: true })
    .fill("Zusätzlich prüfen");
  await docs
    .getByLabel("Neuer Checklistenpunkt", { exact: true })
    .press("Enter");
  await expect(
    docs.locator("summary").filter({ hasText: /^Checkliste \(4\)$/ }),
  ).toBeVisible();
  await docs.getByLabel("Punkt 1 erledigt", { exact: true }).check();
  page.once("dialog", (dialog) => dialog.dismiss());
  await editor.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(
    docs.getByLabel("Checklistenpunkt 4", { exact: true }),
  ).toHaveValue("Zusätzlich prüfen");
  await docs
    .getByRole("button", { name: "Checklistenänderung prüfen", exact: true })
    .click();
  await docs
    .getByRole("button", { name: "Änderung bewusst bestätigen", exact: true })
    .click();
  await expect(docs.getByRole("status")).toContainText(
    "In Todoist nachgewiesen",
    { timeout: 20000 },
  );
  await expect(
    editor.getByRole("textbox", { name: "Beschreibung", exact: true }),
  ).toHaveValue(/Zusätzlich prüfen/);
  await docs
    .locator("summary")
    .filter({ hasText: /^Dokumentenlinks$/ })
    .click();
  await expect(
    docs.getByRole("link", { name: "Dokumentation", exact: true }),
  ).toHaveAttribute("href", "https://example.com/helios");
  await docs
    .getByLabel("Linkbezeichnung", { exact: true })
    .fill("Neue Dokumentation");
  await docs
    .getByLabel("Dokumentenadresse (HTTP, HTTPS oder Obsidian)", {
      exact: true,
    })
    .fill("https://example.com/new");
  await docs
    .getByRole("button", { name: "Neuen Link prüfen", exact: true })
    .click();
  await docs
    .getByRole("button", { name: "Änderung bewusst bestätigen", exact: true })
    .click();
  await expect(
    docs.getByRole("link", { name: "Neue Dokumentation", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  const viewport = page.viewportSize()!;
  for (const width of info.project.name === "desktop" ? [1024, 390] : [390]) {
    await page.setViewportSize({ width, height: 844 });
    await editor
      .getByRole("textbox", { name: "Beschreibung", exact: true })
      .scrollIntoViewIfNeeded();
    const geometry = await editor.evaluate((el) => {
      const bar = el
          .querySelector(".task-editor-toolbar")!
          .getBoundingClientRect(),
        root = el.getBoundingClientRect(),
        scroll = el
          .querySelector(".task-editor-scroll")!
          .getBoundingClientRect();
      return {
        visible: bar.top >= root.top && bar.bottom <= root.bottom + 1,
        height: bar.height,
        uncovered: scroll.bottom <= bar.top + 1,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(geometry.height).toBeLessThanOrEqual(width < 600 ? 230 : 130);
    expect(geometry).toMatchObject({
      visible: true,
      uncovered: true,
      overflow: false,
    });
    await page.screenshot({
      path: `private/e9-5/${info.project.name}/editor-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize(viewport);
  const fun = editor.getByRole("switch", {
    name: "Freiwillig / Spass",
    exact: true,
  });
  await fun.focus();
  await page.keyboard.press("Space");
  await expect(fun).toBeChecked();
  await editor.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(editor).toBeHidden({ timeout: 20000 });
  editor = await openTaskEditor(page, title);
  await expect(
    editor.getByRole("switch", { name: "Freiwillig / Spass", exact: true }),
  ).toBeChecked();
  await editor
    .getByRole("button", { name: "Verschieben", exact: true })
    .click();
  let action = page.getByRole("dialog", { name: "Verschieben", exact: true });
  await action
    .getByRole("combobox", { name: "Zielabschnitt", exact: true })
    .selectOption({ label: "In Arbeit" });
  await action
    .getByRole("button", { name: "Verschieben bestätigen", exact: true })
    .click();
  await expect(editor).toBeHidden({ timeout: 20000 });
  editor = await openTaskEditor(page, title);
  await editor.getByRole("button", { name: "Warten", exact: true }).click();
  action = page.getByRole("dialog", { name: "Warten", exact: true });
  await action
    .getByLabel("Wartet auf", { exact: true })
    .fill("Synthetisches Team");
  await action.getByLabel("Gegenstand", { exact: true }).fill("Testfreigabe");
  await action
    .getByLabel("Nächste Prüfung", { exact: true })
    .fill("2026-10-28");
  await action
    .getByRole("button", { name: "Warten bestätigen", exact: true })
    .click();
  await expect(editor).toBeHidden({ timeout: 20000 });
  editor = await openTaskEditor(page, title);
  await editor
    .getByRole("button", { name: "Kommentar hinzufügen", exact: true })
    .click();
  action = page.getByRole("dialog", {
    name: "Kommentar hinzufügen",
    exact: true,
  });
  await action
    .getByLabel("Kommentar", { exact: true })
    .fill("E9.5 bewusst bestätigter Kommentar");
  await action
    .getByRole("button", { name: "Kommentar absenden", exact: true })
    .dblclick();
  await expect(editor).toBeHidden({ timeout: 20000 });
  await row
    .locator("summary")
    .filter({ hasText: /^Kommentare$/ })
    .click();
  await row
    .locator("summary")
    .filter({ hasText: /^Kommentare$/ })
    .click();
  await expect(
    row.getByText("E9.5 bewusst bestätigter Kommentar", { exact: true }),
  ).toBeVisible();
  editor = await openTaskEditor(page, title);
  await editor
    .locator("summary")
    .filter({ hasText: /^Kommentare$/ })
    .click();
  await expect(
    editor.getByText("E9.5 bewusst bestätigter Kommentar", { exact: true }),
  ).toHaveCount(1);
  await editor
    .getByRole("button", { name: "Aufgabe löschen", exact: true })
    .click();
  action = page.getByRole("dialog", { name: "Aufgabe löschen", exact: true });
  await expect(action.getByText(/endgültig in Todoist gelöscht/)).toBeVisible();
  await page.screenshot({
    path: `private/e9-5/${info.project.name}/delete-confirmation.png`,
    fullPage: true,
  });
  await action.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(editor).toBeVisible();
  await editor
    .getByRole("button", { name: "Aufgabe abschliessen", exact: true })
    .click();
  action = page.getByRole("dialog", {
    name: "Aufgabe abschliessen",
    exact: true,
  });
  await expect(
    action.getByRole("button", { name: "Abschluss bestätigen", exact: true }),
  ).toBeEnabled();
  await action.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await editor
    .getByRole("button", { name: "Aufgabe löschen", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Aufgabe löschen", exact: true })
    .getByRole("button", { name: "Aufgabe endgültig löschen", exact: true })
    .click();
  await expect(editor).toBeHidden({ timeout: 20000 });
  await expect(
    page
      .locator(".task-list")
      .getByRole("heading", { name: title, exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("E9.5 unknown and partial field evidence blocks replay and retains the original editor input", async ({
  page,
  baseURL,
}) => {
  await prepare(page, baseURL);
  for (const status of ["unknown", "partial"]) {
    const editor = await openTaskEditor(page, "E9.5 synthetische UI-Aufgabe");
    let posts = 0,
      reads = 0;
    await page.route("**/api/tasks/submit", async (route) => {
      posts++;
      expect(route.request().postDataJSON().fields).toEqual({ duration: 45 });
      await route.fulfill({
        json: { operationId: "e95-synthetic-unconfirmed" },
      });
    });
    await page.route("**/api/tasks", async (route) => {
      reads++;
      await route.fulfill({
        json: [
          {
            id: "e95-synthetic-unconfirmed",
            status,
            code: "TODOIST_FIELDS_UNCONFIRMED",
            retryAt: null,
            result: {
              verification: {
                matched: ["due_date"],
                unmatched: ["duration"],
                acknowledged: true,
              },
            },
          },
        ],
      });
    });
    await editor.getByLabel("Dauer in Minuten", { exact: true }).fill("45");
    await editor
      .getByRole("button", { name: "Speichern", exact: true })
      .click();
    await expect(
      editor.getByRole("button", { name: "Speichern", exact: true }),
    ).toBeDisabled();
    await expect(
      editor.getByText("Dauer: nicht nachgewiesen", { exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      editor.getByLabel("Dauer in Minuten", { exact: true }),
    ).toHaveValue("45");
    await expect
      .poll(() => reads, { timeout: 10000 })
      .toBeGreaterThanOrEqual(2);
    expect(posts).toBe(1);
    await closeTaskDialog(page, editor);
    await page.unroute("**/api/tasks/submit");
    await page.unroute("**/api/tasks");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});
