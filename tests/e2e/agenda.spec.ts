import { test, expect } from "@playwright/test";
import { projects } from "../fixtures/todoist";
import { bootstrapWorkSettings } from "../fixtures/browser-work";
test("E5 ordering, keyboard and pointer drag, focus, persistent cyclic reserve and conscious addition", async ({
  page,
  baseURL,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Desktop-Tagesordnung; mobile Morgenroutine bleibt eine eigene spätere Etappe.",
  );
  const { errors } = await bootstrapWorkSettings(page, baseURL);
  await fetch(new URL("/control", process.env.TODOIST_TEST_ORIGIN!), {
    method: "POST",
    body: JSON.stringify({ mode: "ok", scenario: "agenda" }),
  });
  const row = page
    .locator(".context-editor")
    .filter({ has: page.getByRole("heading", { name: /Privat/ }) });
  await row
    .getByRole("combobox", { name: "Todoist-Projekt", exact: true })
    .selectOption(projects[0]!.id);
  await row
    .getByRole("button", { name: "Kontext speichern", exact: true })
    .click();
  await page.getByRole("link", { name: "Aufgaben", exact: true }).click();
  const refresh = page.getByRole("button", {
    name: "Aufgaben aktualisieren",
    exact: true,
  });
  await expect(refresh).toBeEnabled({ timeout: 65000 });
  await refresh.click();
  await page.getByRole("link", { name: "Fokus", exact: true }).click();
  await page
    .getByRole("button", { name: "Tagesvorschau erstellen", exact: true })
    .click();
  await expect(page.locator(".today-entry h3")).toHaveCount(5);
  await page
    .getByRole("button", { name: "Auswahl bewusst bestätigen", exact: true })
    .click();
  await expect(
    page.getByText(
      "Tagesplan bestätigt. Alle nötigen Abschnittswechsel sind nachgelesen; geschützte Hierarchien bleiben unverändert.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 30000 });
  const main = page.getByRole("region", { name: "Hauptauswahl", exact: true });
  await expect(main.locator(".agenda-entry h3")).toHaveCount(5);
  const original = await main.locator(".agenda-entry h3").allTextContents();
  const focused = await page.locator(".focus-hero h2").innerText();
  await main
    .getByRole("button", { name: original[1] + " nach oben", exact: true })
    .click();
  await expect(main.locator(".agenda-entry h3").first()).toHaveText(
    original[1]!,
  );
  await expect(page.locator(".focus-hero h2")).toHaveText(focused);
  await page.reload();
  await expect(main.locator(".agenda-entry h3").first()).toHaveText(
    original[1]!,
  );
  const handle = main.getByRole("button", {
    name: original[1] + " verschieben",
    exact: true,
  });
  await handle.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect(main.locator(".agenda-entry h3").first()).toHaveText(
    original[0]!,
  );
  // The keyboard drag can retain an inert placeholder until its settling animation ends.
  // Measure the next pointer target only after that temporary clone is removed.
  await expect(main.locator("[data-dnd-placeholder]")).toHaveCount(0);
  const source = main.getByRole("button", {
    name: original[0] + " verschieben",
    exact: true,
  });
  const target = main.getByRole("listitem").nth(2);
  await expect(source).toBeEnabled();
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  expect(from && to).toBeTruthy();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + 30, to!.y + to!.height - 8, { steps: 15 });
  await page.mouse.up();
  await expect(main.locator(".agenda-entry h3").first()).not.toHaveText(
    original[0]!,
  );
  const newFocus = main.locator(".agenda-entry").filter({
    has: page.getByRole("heading", { name: original[2], exact: true }),
  });
  await newFocus
    .getByRole("button", { name: "Als Fokus wählen", exact: true })
    .click();
  await expect(page.locator(".focus-hero h2")).toHaveText(original[2]!);
  for (const title of [original[3]!, original[4]!]) {
    await main
      .locator(".agenda-entry")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
      .getByRole("button", { name: "In die Reserve", exact: true })
      .click();
    await expect(main.locator(".agenda-entry h3")).not.toContainText([title]);
  }
  const reserve = page.getByRole("region", {
    name: "Zyklische Reserve",
    exact: true,
  });
  await expect(reserve.locator(".reserve-card h3")).toHaveText(original[3]!);
  await reserve
    .getByLabel("Grund fürs Überspringen (optional)")
    .fill("Später mit frischem Blick");
  await reserve
    .getByRole("button", { name: "Reservekarte überspringen", exact: true })
    .click();
  await expect(reserve.locator(".reserve-card h3")).toHaveText(original[4]!);
  await page.reload();
  await expect(reserve.locator(".reserve-card h3")).toHaveText(original[4]!);
  await reserve
    .getByRole("button", { name: "Reserveaufgabe abschliessen", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Reserveaufgabe bewusst abschliessen",
  });
  await dialog
    .getByLabel(
      "Ich bestätige den nativen Abschluss dieser Reserveaufgabe ausdrücklich.",
    )
    .check();
  await dialog
    .getByRole("button", { name: "Abschluss bewusst bestätigen", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(reserve.locator(".reserve-card h3")).toHaveText(original[3]!, {
    timeout: 25000,
  });
  await reserve
    .getByRole("button", { name: "Reservekarte überspringen", exact: true })
    .click();
  await expect(
    reserve.getByText(
      "Die Reserve macht Pause. Du kannst sie bewusst wieder aufnehmen.",
    ),
  ).toBeVisible();
  await page.reload();
  await expect(
    reserve.getByRole("button", {
      name: "Reserve wieder aufnehmen",
      exact: true,
    }),
  ).toBeVisible();
  await reserve
    .getByRole("button", { name: "Reserve wieder aufnehmen", exact: true })
    .click();
  await expect(reserve.locator(".reserve-card h3")).toHaveText(original[3]!);
  await page
    .getByRole("link", {
      name: "Weitere Aufgabe bewusst aufnehmen",
      exact: true,
    })
    .click();
  expect(new URL(page.url()).searchParams.get("context")).toBeTruthy();
  const extra = page.locator(".task-entry").filter({
    has: page.getByRole("heading", {
      name: "Synthetische Tagesaufgabe 5",
      exact: true,
    }),
  });
  await extra.locator(":scope > summary").click();
  await extra
    .getByRole("button", {
      name: "Bewusst in den Tagesplan aufnehmen",
      exact: true,
    })
    .click();
  await expect(
    extra.getByRole("button", { name: "Im Tagesplan", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await extra
    .getByRole("link", { name: "Zurück zur Tagesplanung", exact: true })
    .click();
  await expect(
    main.getByRole("heading", {
      name: "Synthetische Tagesaufgabe 5",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "private/e5-focus-reserve.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
