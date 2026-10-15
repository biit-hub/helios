import { test, expect } from "@playwright/test";
import { bootstrapWorkSettings } from "../fixtures/browser-work";
import { projects } from "../fixtures/todoist";
test("E6 reviewed AI capture, persistent edited drafts, shared progress, checklist, timeout and form fallback", async ({
  page,
  baseURL,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Gemeinsamer Desktop-Workflow; physische mobile E3–E6-Abnahme bleibt offen.",
  );
  const { errors } = await bootstrapWorkSettings(page, baseURL);
  await fetch(new URL("/control", process.env.TODOIST_TEST_ORIGIN!), {
    method: "POST",
    body: JSON.stringify({ mode: "ok", scenario: "ai" }),
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
  await page
    .getByRole("button", { name: "＋ Aufgabe erfassen", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Aufgabe erfassen",
    exact: true,
  });
  await dialog
    .getByLabel("Titel", { exact: true })
    .fill("Manueller Titel hat Vorrang");
  await dialog.getByRole("button", { name: "KI-Modus", exact: true }).click();
  const capture = dialog.getByRole("region", {
    name: "KI-Aufgabenerfassung",
    exact: true,
  });
  await capture
    .getByLabel("Aufgabe in eigenen Worten")
    .fill("Synthetische Präsentation vorbereiten. 45 Minuten");
  const before = await fetch(
    new URL("/assertions", process.env.TODOIST_TEST_ORIGIN!),
  ).then((r) => r.json());
  await capture
    .getByRole("button", { name: "Lokale KI-Auswertung starten", exact: true })
    .click();
  await expect(
    capture.getByText("Entwurf bereit zur bewussten Prüfung.", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  expect(
    (
      await fetch(
        new URL("/assertions", process.env.TODOIST_TEST_ORIGIN!),
      ).then((r) => r.json())
    ).writes,
  ).toBe(before.writes);
  await page.screenshot({
    path: "private/e6-capture-synthetic.png",
    fullPage: true,
  });
  await expect(
    capture.getByLabel("Titel bearbeiten", { exact: true }),
  ).toHaveValue("Manueller Titel hat Vorrang");
  await capture
    .getByLabel("Titel bearbeiten", { exact: true })
    .fill("Bewusst korrigierter Titel");
  await capture
    .locator("fieldset")
    .filter({
      has: page.getByText("Restaufwand in Minuten (Schätzung)", {
        exact: true,
      }),
    })
    .getByRole("button", { name: "Diesen Vorschlag ablehnen", exact: true })
    .click();
  await capture
    .getByRole("button", {
      name: "Entwurfsentscheidungen speichern",
      exact: true,
    })
    .click();
  await dialog
    .getByRole("button", {
      name: "Dialog schliessen / Entwurf verwerfen",
      exact: true,
    })
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: "＋ Aufgabe erfassen", exact: true })
    .click();
  await dialog.getByRole("button", { name: "KI-Modus", exact: true }).click();
  await capture
    .getByText("Gespeicherte Entwürfe wieder öffnen", { exact: true })
    .click();
  await capture
    .getByRole("button", { name: /Synthetische Präsentation vorbereiten/ })
    .click();
  await expect(
    capture.getByLabel("Titel bearbeiten", { exact: true }),
  ).toHaveValue("Bewusst korrigierter Titel");
  await capture
    .getByRole("button", {
      name: "Ausgewählte Änderungen bewusst speichern",
      exact: true,
    })
    .click();
  await expect(
    capture.getByText("Alle gewählten Änderungen sind extern nachgewiesen.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 20000 });
  await dialog
    .getByRole("button", {
      name: "Dialog schliessen / Entwurf verwerfen",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Aufgabe öffnen und bearbeiten: Synthetische Präsentation vorbereiten",
      exact: true,
    })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Aufgabe bearbeiten",
    exact: true,
  });
  await editor
    .getByRole("button", { name: "Fortschritt dokumentieren", exact: true })
    .click();
  const progress = editor.getByRole("region", {
    name: "Fortschritt dokumentieren",
    exact: true,
  });
  await progress
    .getByLabel("Was hast du erledigt?")
    .fill("Quellen gesammelt. Noch 30 Minuten");
  await progress
    .getByRole("button", { name: "Lokale KI-Auswertung starten", exact: true })
    .click();
  await expect(
    progress.getByText("Entwurf bereit zur bewussten Prüfung.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 20000 });
  await progress
    .getByLabel("Fortschrittskommentar bearbeiten", { exact: true })
    .fill("Bewusst formulierter Fortschritt");
  await page.screenshot({
    path: "private/e6-progress-synthetic.png",
    fullPage: true,
  });
  const choices = progress.getByLabel("Diese Änderung auswählen", {
    exact: true,
  });
  for (let i = 0; i < (await choices.count()); i++)
    await choices.nth(i).check();
  await progress
    .getByRole("button", {
      name: "Ausgewählte Änderungen bewusst speichern",
      exact: true,
    })
    .click();
  await expect(
    progress.getByText("Alle gewählten Änderungen sind extern nachgewiesen.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 30000 });
  await editor.getByRole("button", { name: "Formular", exact: true }).click();
  await editor
    .getByRole("button", {
      name: "Aktuelle Quelle neu laden und Entwurf ersetzen",
      exact: true,
    })
    .click();
  await expect(
    editor.getByRole("textbox", { name: "Beschreibung", exact: true }),
  ).toHaveValue(/- \[x\] Quellen sammeln/);
  await expect(
    editor.getByRole("textbox", { name: "Beschreibung", exact: true }),
  ).toHaveValue(/## Notizen\nFremden Abschnitt erhalten/);
  await expect(
    editor.getByLabel("Dauer in Minuten", { exact: true }),
  ).toHaveValue("30");
  await editor
    .getByRole("button", {
      name: "Dialog schliessen / Entwurf verwerfen",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "＋ Aufgabe erfassen", exact: true })
    .click();
  await dialog.getByRole("button", { name: "KI-Modus", exact: true }).click();
  await fetch(new URL("/control", process.env.TODOIST_TEST_ORIGIN!), {
    method: "POST",
    body: JSON.stringify({ mode: "ok", aiMode: "timeout" }),
  });
  await capture
    .getByLabel("Aufgabe in eigenen Worten")
    .fill("Synthetischer Text bleibt beim Timeout erhalten");
  await capture
    .getByRole("button", { name: "Lokale KI-Auswertung starten", exact: true })
    .click();
  await expect(
    capture.getByText("KI-Auswertung fehlgeschlagen.", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(capture.getByLabel("Aufgabe in eigenen Worten")).toHaveValue(
    "Synthetischer Text bleibt beim Timeout erhalten",
  );
  await dialog.getByRole("button", { name: "Formular", exact: true }).click();
  await dialog
    .getByLabel("Titel", { exact: true })
    .fill("Formular bleibt ohne KI nutzbar");
  await expect(
    dialog.getByRole("button", { name: "Aufgabe erstellen", exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});
