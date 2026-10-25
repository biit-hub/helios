import { test, expect } from "@playwright/test";
import { bootstrapWorkSettings } from "../fixtures/browser-work";
import { openTaskEditor } from "../fixtures/task-detail";
import { projects } from "../fixtures/todoist";

test("E9.6 saves core fields, goal, pending checklist text and a link together after one review and refreshes without reload", async ({
  page,
  baseURL,
}, info) => {
  const { errors } = await bootstrapWorkSettings(page, baseURL);
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
  await page
    .getByRole("button", { name: "Aufgabe erfassen", exact: true })
    .click();
  let editor = page.getByRole("dialog", {
    name: "Aufgabe erfassen",
    exact: true,
  });
  const original = "E9.6 synthetische Aufgabe",
    title = "E9.6 gemeinsam gespeichert";
  await editor.getByLabel("Titel", { exact: true }).fill(original);
  await editor
    .getByRole("combobox", { name: "Todoist-Projekt", exact: true })
    .selectOption(projects[0]!.id);
  await editor
    .getByRole("textbox", { name: "Beschreibung", exact: true })
    .fill(
      "Originalnotiz.\n\n## Ziel\nAltes Ziel\n\n## Checkliste\n- [ ] Bestehend",
    );
  await editor
    .getByRole("button", { name: "Aufgabe erstellen", exact: true })
    .click();
  await expect(editor).toBeHidden({ timeout: 20000 });
  const submissions: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    if (
      request.url().endsWith("/api/tasks/submit") &&
      request.method() === "POST"
    )
      submissions.push(request.postDataJSON());
  });
  editor = await openTaskEditor(page, original);
  await editor.getByLabel("Titel", { exact: true }).fill(title);
  const description = editor.getByRole("textbox", {
    name: "Beschreibung",
    exact: true,
  });
  await description.fill(
    (await description.inputValue()).replace(
      "Originalnotiz.",
      "Originalnotiz bewusst ergänzt.",
    ),
  );
  const docs = editor.getByRole("region", {
    name: "Ziel, Checkliste und Dokumentenlinks",
  });
  await docs
    .locator("summary")
    .filter({ hasText: /^Ziel$/ })
    .click();
  await expect(
    docs.getByRole("textbox", { name: "Ziel", exact: true }),
  ).toHaveValue("Altes Ziel");
  await docs
    .getByRole("textbox", { name: "Ziel", exact: true })
    .fill("Ein gemeinsam bestätigtes Ziel");
  await docs
    .locator("summary")
    .filter({ hasText: /^Checkliste \(1\)$/ })
    .click();
  await docs
    .getByLabel("Neuer Checklistenpunkt", { exact: true })
    .fill("Zentral speichern ohne Extra-Plus");
  await docs
    .locator("summary")
    .filter({ hasText: /^Dokumentenlinks$/ })
    .click();
  await docs
    .getByLabel("Linkbezeichnung", { exact: true })
    .fill("Geprüftes Dokument");
  await docs
    .getByLabel("Dokumentenadresse (HTTP, HTTPS oder Obsidian)", {
      exact: true,
    })
    .fill("https://example.com/e96");
  await editor.getByRole("button", { name: "Speichern", exact: true }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Änderungen speichern",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await expect(
    confirmation.getByText("Checkliste (2)", { exact: true }),
  ).toBeVisible();
  await expect(confirmation.locator("details")).not.toHaveAttribute("open");
  expect(submissions).toHaveLength(0);
  await confirmation
    .getByRole("button", { name: "Zurück zur Aufgabe", exact: true })
    .click();
  await expect(
    docs.getByLabel("Neuer Checklistenpunkt", { exact: true }),
  ).toHaveValue("Zentral speichern ohne Extra-Plus");
  await editor.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(confirmation).toBeVisible();
  const { mkdirSync } = await import("node:fs");
  const folder = "private/e9-6/" + info.project.name;
  mkdirSync(folder, { recursive: true });
  await page.screenshot({
    path: folder + "/combined-confirmation.png",
    fullPage: true,
  });
  await confirmation
    .getByRole("button", { name: "Änderungen speichern", exact: true })
    .dblclick();
  await expect(editor).toBeHidden({ timeout: 20000 });
  expect(submissions).toHaveLength(1);
  expect(Object.keys(submissions[0]!.fields as object).sort()).toEqual([
    "content",
    "description",
  ]);
  expect(
    (submissions[0]!.documents as { kind: string }[]).map((x) => x.kind),
  ).toEqual(["goal", "checklist", "link-add"]);
  const row = page
    .locator(".task-entry")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(row).toBeVisible();
  if ((await row.getAttribute("open")) === null)
    await row.locator(":scope > summary").click();
  await expect(
    row.getByText("Ein gemeinsam bestätigtes Ziel", { exact: true }),
  ).toBeVisible();
  await expect(
    row.getByRole("link", { name: "Geprüftes Dokument", exact: true }),
  ).toHaveAttribute("href", "https://example.com/e96");
  await expect(
    row.getByText(/Zentral speichern ohne Extra-Plus/),
  ).toBeVisible();
  const comment = row
    .locator(".task-accordion")
    .filter({ has: page.getByText("Kommentare", { exact: true }) })
    .first();
  const head = comment.locator(":scope > summary");
  const bounds = await head.boundingBox(),
    outer = await comment.boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(outer!.width - 3);
  if (info.project.name === "mobile")
    await page.touchscreen.tap(
      bounds!.x + bounds!.width - 5,
      bounds!.y + bounds!.height / 2,
    );
  else {
    await head.hover();
    expect(
      await head.evaluate((e) => getComputedStyle(e).backgroundColor),
    ).toBe("rgb(250, 240, 223)");
    await head.click({
      position: { x: bounds!.width - 5, y: bounds!.height / 2 },
    });
  }
  await expect(comment).toHaveAttribute("open", "");
  const action = await row
      .getByRole("button", { name: "Bearbeiten", exact: true })
      .boundingBox(),
    card = await row.boundingBox();
  expect(action!.x - card!.x).toBeGreaterThanOrEqual(12);
  editor = await openTaskEditor(page, title);
  await expect(
    editor.getByRole("textbox", { name: "Beschreibung", exact: true }),
  ).toHaveValue(/Originalnotiz bewusst ergänzt/);
  for (const width of info.project.name === "desktop" ? [1024, 390] : [390]) {
    await page.setViewportSize({ width, height: 844 });
    const smart = editor.locator(".task-accordion").filter({
      has: page.getByText("SMART-Ziel prüfen und verbessern", {
        exact: true,
      }),
    });
    const summary = smart.locator(":scope > summary");
    await summary.scrollIntoViewIfNeeded();
    await summary.click();
    const inset = await smart
      .locator(":scope > .task-accordion-body")
      .evaluate((e) => parseFloat(getComputedStyle(e).paddingLeft));
    expect(inset).toBeGreaterThanOrEqual(10);
    await page.screenshot({
      path: folder + "/smart-" + width + ".png",
      fullPage: true,
    });
    await summary.click();
  }
  expect(errors).toEqual([]);
});
