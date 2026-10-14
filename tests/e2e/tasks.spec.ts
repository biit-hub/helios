import { expect, test } from "@playwright/test";
import { bootstrapWorkSettings } from "../fixtures/browser-work";
import { projects } from "../fixtures/todoist";
test("E4 form intake, contextual editing, waiting, filter, close and persistent journal", async ({
  page,
  baseURL,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "E4-Aufgabenverwaltung ist Desktop; mobile Routine folgt separat.",
  );
  const { errors } = await bootstrapWorkSettings(page, baseURL);
  const row = page
    .locator(".context-editor")
    .filter({ has: page.getByRole("heading", { name: /Privat/ }) });
  await row
    .getByRole("combobox", { name: "Todoist-Projekt", exact: true })
    .selectOption(projects[0]!.id);
  await row
    .getByRole("button", { name: "Kontext speichern", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Privat", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "＋ Aufgabe erfassen", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Aufgabe erfassen" });
  await dialog
    .getByLabel("Titel", { exact: true })
    .fill("Synthetische Eingangserfassung E4");
  await dialog
    .getByRole("button", { name: "Aufgabe erstellen", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toHaveText(/Extern nachgewiesen/, {
    timeout: 20000,
  });
  await dialog
    .getByRole("button", { name: "Dialog schliessen / Entwurf verwerfen" })
    .click();
  await page
    .getByRole("button", { name: "＋ Aufgabe erfassen", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Aufgabe erfassen" });
  await dialog
    .getByLabel("Titel", { exact: true })
    .fill("Synthetische Verwaltungsaufgabe E4");
  await dialog
    .getByRole("combobox", { name: "Todoist-Projekt", exact: true })
    .selectOption(projects[0]!.id);
  await dialog
    .getByLabel("Beschreibung", { exact: true })
    .fill(
      "## Ziel\nSynthetischer Inhalt bleibt erhalten.\n\n[Notiz](https://example.com/note)",
    );
  await dialog
    .getByRole("button", { name: "Aufgabe erstellen", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toHaveText(/Extern nachgewiesen/, {
    timeout: 20000,
  });
  await dialog
    .getByRole("button", { name: "Dialog schliessen / Entwurf verwerfen" })
    .click();
  await page.getByRole("link", { name: "Aufgaben", exact: true }).click();
  const refresh = page.getByRole("button", {
    name: "Aufgaben aktualisieren",
    exact: true,
  });
  await expect(refresh).toBeEnabled({ timeout: 20000 });
  await refresh.click();
  await page
    .getByLabel("Aufgaben suchen", { exact: true })
    .fill("Verwaltungsaufgabe E4");
  await expect(page.locator(".task-card")).toHaveCount(1);
  await page
    .getByRole("button", {
      name: "Aufgabe öffnen und bearbeiten: Synthetische Verwaltungsaufgabe E4",
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog", { name: "Aufgabe bearbeiten" });
  await expect(dialog.getByLabel("Titel", { exact: true })).toHaveValue(
    "Synthetische Verwaltungsaufgabe E4",
  );
  await dialog
    .getByLabel("Titel", { exact: true })
    .fill("Synthetische Aufgabe E4 bearbeitet");
  await dialog
    .getByLabel("Geplantes Datum", { exact: true })
    .fill("2026-10-20");
  await dialog.getByLabel("Echte Deadline", { exact: true }).fill("2026-10-23");
  await dialog
    .getByRole("button", { name: "Änderungen bewusst bestätigen", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toHaveText(/Extern nachgewiesen/, {
    timeout: 20000,
  });
  await dialog
    .getByRole("button", {
      name: "Aktuelle Quelle neu laden und Entwurf ersetzen",
    })
    .click();
  await expect(dialog.getByLabel("Titel", { exact: true })).toHaveValue(
    "Synthetische Aufgabe E4 bearbeitet",
  );
  await dialog
    .getByLabel("Kommentar", { exact: true })
    .fill("Synthetischer Kommentar E4");
  await dialog
    .getByRole("button", { name: "Kommentar hinzufügen", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toHaveText(/Extern nachgewiesen/, {
    timeout: 20000,
  });
  await dialog
    .getByRole("button", {
      name: "Aktuelle Quelle neu laden und Entwurf ersetzen",
    })
    .click();
  await expect(dialog.getByLabel("Wartet auf", { exact: true })).toBeEnabled();
  await dialog
    .getByLabel("Wartet auf", { exact: true })
    .fill("Synthetisches Team");
  await dialog.getByLabel("Gegenstand", { exact: true }).fill("Freigabe");
  await dialog.getByLabel("Nachfassen am", { exact: true }).fill("2026-10-22");
  await dialog
    .getByRole("button", { name: "Warten bewusst bestätigen", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toHaveText(/Extern nachgewiesen/, {
    timeout: 20000,
  });
  await dialog
    .getByRole("button", { name: "Dialog schliessen / Entwurf verwerfen" })
    .click();
  await page.getByLabel("Aufgaben suchen", { exact: true }).fill("");
  await expect(refresh).toBeEnabled({ timeout: 20000 });
  await refresh.click();
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
  await page
    .getByRole("button", {
      name: "Aufgabe öffnen und bearbeiten: Synthetische Aufgabe E4 bearbeitet",
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog", { name: "Aufgabe bearbeiten" });
  await expect(dialog.getByLabel("Titel", { exact: true })).toHaveValue(
    "Synthetische Aufgabe E4 bearbeitet",
  );
  await dialog
    .getByLabel(
      "Ich bestätige ausdrücklich den Abschluss beziehungsweise die endgültige Löschung dieser Aufgabe.",
    )
    .check();
  await dialog
    .getByRole("button", { name: "Aufgabe abschliessen", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toHaveText(/Extern nachgewiesen/, {
    timeout: 20000,
  });
  await dialog
    .getByRole("button", { name: "Dialog schliessen / Entwurf verwerfen" })
    .click();
  await page.reload();
  await page
    .getByText("Aufgabenänderungen und Einzelergebnisse", { exact: true })
    .click();
  await expect(
    page.getByText("Extern nachgewiesen", { exact: true }).first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
