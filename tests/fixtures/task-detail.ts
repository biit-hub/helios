import { expect, type Page } from "@playwright/test";
export async function openTaskEditor(page: Page, title: string) {
  const row = page
    .locator(".task-entry")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  if ((await row.getAttribute("open")) === null)
    await row.locator(":scope > summary").click();
  await row.getByRole("button", { name: "Bearbeiten", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Aufgabe bearbeiten",
    exact: true,
  });
  await expect(editor.getByLabel("Titel", { exact: true })).toHaveValue(title);
  return editor;
}

export async function confirmTaskSave(page: Page) {
  const confirmation = page.getByRole("dialog", {
    name: "Änderungen speichern",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await confirmation
    .getByRole("button", { name: "Änderungen speichern", exact: true })
    .click();
}
