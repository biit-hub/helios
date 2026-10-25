import { expect } from "@playwright/test";
import type { Page, Locator, Dialog } from "@playwright/test";
export async function closeTaskDialog(page: Page, dialog: Locator) {
  const preview = page.getByRole("dialog", {
    name: "Änderungen speichern",
    exact: true,
  });
  if (await preview.isVisible())
    await preview
      .getByRole("button", { name: "Zurück zur Aufgabe", exact: true })
      .click();
  const discard = async (confirmation: Dialog) => {
    expect(confirmation.message()).toMatch(/Entwurf|gespeichert|ungeklärt/);
    await confirmation.accept();
  };
  page.once("dialog", discard);
  try {
    await dialog
      .getByRole("button", { name: "Abbrechen", exact: true })
      .click();
    await expect(dialog).toBeHidden();
  } finally {
    page.off("dialog", discard);
  }
}
