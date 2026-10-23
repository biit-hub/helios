import { test, expect } from "@playwright/test";
import type { WorkSnapshot } from "@helios/contracts";
import { bootstrapWorkSettings } from "../fixtures/browser-work";
import { closeTaskDialog } from "../fixtures/task-dialog";
import { projects } from "../fixtures/todoist";
test("E9.2 central context, settings-only Kanban, preserved unknown history, two-browser conflict and pending navigation", async ({
  page,
  browser,
  baseURL,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Desktop stabilization; mobile duplicate is intentionally omitted.",
  );
  const { errors } = await bootstrapWorkSettings(page, baseURL);
  const control = (data: Record<string, unknown>) =>
    fetch(new URL("/control", process.env.TODOIST_TEST_ORIGIN!), {
      method: "POST",
      body: JSON.stringify({ mode: "ok", ...data }),
    });
  await control({ scenario: "stabilization" });
  const privateRow = page.locator(".context-editor").filter({
    has: page.getByRole("heading", { name: /^Privat\s+Privat$/ }),
  });
  await privateRow
    .getByRole("combobox", { name: "Todoist-Projekt", exact: true })
    .selectOption(projects[0]!.id);
  await privateRow
    .getByRole("button", { name: "Kontext speichern", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Arbeitgeber hinzufügen", exact: true })
    .click();
  const newRow = page.locator(".context-editor").filter({
    has: page.getByRole("heading", {
      name: /^Neuer Arbeitgeber\b/,
      exact: true,
    }),
  });
  await newRow.getByLabel("Anzeigename").fill("Atelier Test");
  await newRow
    .getByRole("combobox", { name: "Todoist-Projekt", exact: true })
    .selectOption(projects[1]!.id);
  await newRow
    .getByRole("button", { name: "Kontext speichern", exact: true })
    .click();
  await page.getByRole("button", { name: "Atelier Test", exact: true }).click();
  await control({
    removeSection: { projectId: projects[1]!.id, name: "Wartet" },
  });
  const setup = page.getByRole("region", {
    name: "Projektabschnitte für Atelier Test",
  });
  await setup.getByRole("button", { name: "Kanban-Abschnitte prüfen" }).click();
  await expect(setup.getByText("Wartet", { exact: true })).toBeVisible();
  await setup
    .getByRole("button", { name: "Fehlende Abschnitte bewusst anlegen" })
    .click();
  await expect(
    setup.getByText("Alle vier Abschnitte sind in Todoist nachgewiesen.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 20000 });
  for (const [name, path] of [
    ["Fokus", "/"],
    ["Tagesplan", "/plan"],
    ["Epics", "/epics"],
    ["Morgenroutine", "/morning"],
    ["Einstellungen", "/settings/contexts"],
    ["Aufgaben", "/tasks"],
  ]) {
    await page
      .getByRole("navigation", { name: "Hauptnavigation" })
      .getByRole("link", { name, exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(path === "/" ? "^" + baseURL + "/\\?" : path + "\\?"),
    );
    await expect(
      page.getByRole("button", { name: "Atelier Test", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Atelier Test", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Kanban-Abschnitte einrichten" }),
  ).toHaveCount(0);
  const refresh = page.getByRole("button", {
    name: "Aufgaben aktualisieren",
    exact: true,
  });
  await expect(refresh).toBeEnabled({ timeout: 20000 });
  await refresh.click();
  await expect(
    page.locator(".task-list").getByRole("heading", {
      name: "Synthetische frühere Projektaufgabe",
      exact: true,
    }),
  ).toBeVisible();
  await control({ removeTask: "scope-browser-old" });
  await expect(refresh).toBeEnabled({ timeout: 20000 });
  await refresh.click();
  await expect(page.locator(".task-list .task-card")).toHaveCount(0);
  await page.locator(".historical-tasks > summary").click();
  await expect(
    page.locator(".historical-tasks").getByRole("heading", {
      name: "Synthetische frühere Projektaufgabe",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Aufgabe öffnen und bearbeiten: Synthetische frühere/,
    }),
  ).toHaveCount(0);
  await expect(
    page.locator(".historical-tasks").getByRole("button", {
      name: /aufnehmen|abschliessen|löschen|bearbeiten/i,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Privat", exact: true }).click();
  await expect(refresh).toBeEnabled({ timeout: 20000 });
  await refresh.click();
  await expect(
    page.getByRole("button", {
      name: "Aufgabe öffnen und bearbeiten: Synthetische private Quelle",
      exact: true,
    }),
  ).toBeVisible();
  const snapshot: WorkSnapshot = await page.request
    .get("/api/work")
    .then((r) => r.json());
  const privateContext = snapshot.contexts.find((c) => c.kind === "private")!;
  const secondContext = await browser.newContext({
    storageState: await page.context().storageState(),
  });
  const second = await secondContext.newPage();
  await second.goto(baseURL + "/tasks?context=" + privateContext.id);
  await second
    .getByRole("button", {
      name: "Aufgabe öffnen und bearbeiten: Synthetische private Quelle",
      exact: true,
    })
    .click();
  const secondEditor = second.getByRole("dialog", {
    name: "Aufgabe bearbeiten",
  });
  await expect(secondEditor.getByLabel("Titel", { exact: true })).toHaveValue(
    "Synthetische private Quelle",
  );
  await page
    .getByRole("button", {
      name: "Aufgabe öffnen und bearbeiten: Synthetische private Quelle",
      exact: true,
    })
    .click();
  const editor = page.getByRole("dialog", { name: "Aufgabe bearbeiten" });
  await editor
    .getByLabel("Titel", { exact: true })
    .fill("Synthetische private Quelle v2");
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/tasks/submit", async (route) => {
    await hold;
    await route.continue();
  });
  await editor
    .getByRole("button", { name: "Änderungen bewusst bestätigen", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Atelier Test", exact: true }),
  ).toBeDisabled();
  await editor.press("Escape");
  await expect(editor).toBeVisible();
  release();
  await expect(editor).toBeHidden({ timeout: 20000 });
  await page.unroute("**/api/tasks/submit");
  await expect(
    page.getByRole("heading", {
      name: "Synthetische private Quelle v2",
      exact: true,
    }),
  ).toBeVisible();
  await secondEditor
    .getByLabel("Titel", { exact: true })
    .fill("Synthetische konkurrierende Änderung");
  await secondEditor
    .getByRole("button", { name: "Änderungen bewusst bestätigen", exact: true })
    .click();
  await expect(secondEditor.getByRole("alert")).toContainText(
    /geändert|Quelle|zwischenzeitlich/,
  );
  await expect(secondEditor.getByLabel("Titel", { exact: true })).toHaveValue(
    "Synthetische konkurrierende Änderung",
  );
  await expect(editor).toBeHidden();
  await closeTaskDialog(second, secondEditor);
  await secondContext.close();
  await page.getByRole("button", { name: "Atelier Test", exact: true }).click();
  const current: WorkSnapshot = await page.request
    .get("/api/work")
    .then((r) => r.json());
  const work = current.contexts.find((c) => c.name === "Atelier Test")!;
  const deactivated = await page.request.post("/api/work/context-save", {
    headers: { Origin: baseURL! },
    data: {
      id: work.id,
      revision: work.revision,
      name: work.name,
      theme: work.theme,
      active: false,
      projectId: work.projectId,
      termihubEmployerId: work.termihubEmployerId,
      termihubInstanceRef: work.termihubInstanceRef,
    },
  });
  expect(deactivated.ok()).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Kontext bewusst auswählen",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Privat\s+Privat$/ }),
  ).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});
