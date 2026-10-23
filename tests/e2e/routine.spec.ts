import { closeTaskDialog } from "../fixtures/task-dialog";
import { test, expect, chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { bootstrapWorkSettings } from "../fixtures/browser-work";
import { projects } from "../fixtures/todoist";
test("E7 persistent morning routine, inbox without AI, reviewed progress, planning and shared restart", async ({
  page,
  baseURL,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Smartphoneoptimierte gemeinsame PWA folgt in E11; serverseitige E7-Verträge sind geräteunabhängig.",
  );
  const { errors } = await bootstrapWorkSettings(page, baseURL);
  await fetch(new URL("/control", process.env.TODOIST_TEST_ORIGIN!), {
    method: "POST",
    body: JSON.stringify({ mode: "ok", scenario: "routine" }),
  });
  const editor = page
    .locator(".context-editor")
    .filter({ has: page.getByRole("heading", { name: /Privat/ }) });
  await editor
    .getByRole("combobox", { name: "Todoist-Projekt", exact: true })
    .selectOption(projects[0]!.id);
  await editor
    .getByRole("button", { name: "Kontext speichern", exact: true })
    .click();
  await page.getByRole("link", { name: "Aufgaben", exact: true }).click();
  const refresh = page.getByRole("button", {
    name: "Aufgaben aktualisieren",
    exact: true,
  });
  await expect(refresh).toBeEnabled({ timeout: 65000 });
  await refresh.click();
  await expect(
    page.getByText("Synthetische Reviewaufgabe 0", { exact: true }),
  ).toBeVisible();
  execFileSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "tests/e2e/routine-history.ts"],
    { stdio: "pipe" },
  );
  await page.getByRole("link", { name: "Morgenroutine", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Morgenroutine starten", exact: true }),
  ).toBeVisible();
  expect(
    (await page.request.get("/api/routine").then((r) => r.json())).routine,
  ).toBeNull();
  await page
    .getByRole("button", { name: "Morgenroutine starten", exact: true })
    .click();
  for (let n = 0; n < 3; n++) {
    const card = page.getByRole("article", {
      name: "Aktuelle Eingangskarte",
      exact: true,
    });
    await expect(card).toHaveCount(1);
    await expect(
      card.getByRole("heading", {
        name: "Synthetischer Eingang " + n,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      card.getByRole("combobox", { name: "Zielprojekt", exact: true }),
    ).toHaveValue("");
    if (n === 2) {
      await card
        .getByRole("button", { name: "Für später liegen lassen", exact: true })
        .click();
    } else {
      await card
        .getByRole("combobox", { name: "Zielprojekt", exact: true })
        .selectOption(projects[3]!.id);
      await card
        .getByRole("checkbox", {
          name: "Diese Projektzuordnung ausdrücklich bestätigen",
          exact: true,
        })
        .check();
      await card
        .getByRole("button", { name: "Bewusst zuordnen", exact: true })
        .click();
    }
    await expect(
      card.getByRole("heading", {
        name: "Synthetischer Eingang " + n,
        exact: true,
      }),
    ).toHaveCount(0, { timeout: 25000 });
  }
  await expect(
    page.getByText(/Du hast bereits einige Einträge bewusst bearbeitet/),
  ).toBeVisible({ timeout: 25000 });
  const inboxState = (
    await page.request.get("/api/routine").then((r) => r.json())
  ).routine;
  expect(inboxState.inboxSuccesses).toBe(3);
  expect(inboxState.deferredIds).toContain("routine-inbox-2");
  const controls = page.locator(".routine-controls");
  await controls
    .getByRole("button", {
      name: "Diesen Schritt überspringen · offen lassen",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Für welche Kontexte möchtest du planen?",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .locator(".routine-contexts")
    .getByRole("checkbox", { name: "Privat", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Kontextauswahl speichern", exact: true })
    .click();
  await controls
    .getByRole("button", {
      name: "Diesen Schritt bewusst abschliessen und weiter",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Ein ruhiger Rückblick · Privat",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/Letzter relevanter bestätigter Plan:/),
  ).toBeVisible();
  await expect(page.locator(".routine-review-card")).toHaveCount(2);
  await page.screenshot({
    path: "private/e7-review-synthetic.png",
    fullPage: true,
  });
  const first = page.locator(".routine-review-card").filter({
    has: page.getByText("Synthetische Reviewaufgabe 0", { exact: true }),
  });
  await first
    .getByRole("button", { name: "Fortschritt dokumentieren", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Aufgabe bearbeiten",
    exact: true,
  });
  const progress = dialog.getByRole("region", {
    name: "Fortschritt dokumentieren",
    exact: true,
  });
  await progress
    .getByLabel("Was hast du erledigt?", { exact: true })
    .fill("Quellen gesammelt. Noch 30 Minuten");
  await progress
    .getByRole("button", { name: "Lokale KI-Auswertung starten", exact: true })
    .click();
  await expect(
    progress.getByText("Entwurf bereit zur bewussten Prüfung.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 25000 });
  for (const choice of await progress
    .getByLabel("Diese Änderung auswählen", { exact: true })
    .all())
    await choice.check();
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
  ).toBeVisible({ timeout: 40000 });
  await closeTaskDialog(page, dialog);
  await first
    .getByRole("button", { name: "Teilweise erledigt bestätigen", exact: true })
    .click();
  await expect(
    first.getByText("Teilweise erledigt – ausdrücklich rückgemeldet", {
      exact: true,
    }),
  ).toBeVisible();
  const second = page.locator(".routine-review-card").filter({
    has: page.getByText("Synthetische Reviewaufgabe 1", { exact: true }),
  });
  await second.getByRole("checkbox").check();
  await page
    .getByRole("button", {
      name: "Ausgewählte als nicht begonnen bestätigen",
      exact: true,
    })
    .click();
  await expect(
    second.getByText("Nicht begonnen – ausdrücklich rückgemeldet", {
      exact: true,
    }),
  ).toBeVisible();
  await controls
    .getByRole("button", {
      name: "Diesen Schritt bewusst abschliessen und weiter",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Was möchtest du noch klären?",
      exact: true,
    }),
  ).toBeVisible();
  await controls
    .getByRole("button", {
      name: "Diesen Schritt überspringen · offen lassen",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Aktuelle Tagesvorschau nach dem Review vorbereiten",
      exact: true,
    })
    .click();
  await expect(page.locator(".today-entry")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Auswahl bewusst bestätigen", exact: true })
    .click();
  await expect(
    page.getByText(
      "Tagesplan bestätigt. Alle nötigen Abschnittswechsel sind nachgelesen; geschützte Hierarchien bleiben unverändert.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 30000 });
  await controls
    .getByRole("button", {
      name: "Diesen Schritt bewusst abschliessen und weiter",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(
      "Diese Prüfung ist freiwillig. «Geprüft» bedeutet weiterhin nicht «behoben».",
      { exact: true },
    ),
  ).toBeVisible();
  const state = await page.context().storageState();
  const restarted = await chromium.launch();
  const cloned = await restarted.newContext({ storageState: state });
  const reopened = await cloned.newPage();
  await reopened.goto(baseURL + "/morning");
  await expect(
    reopened.getByText(
      "Diese Prüfung ist freiwillig. «Geprüft» bedeutet weiterhin nicht «behoben».",
      { exact: true },
    ),
  ).toBeVisible();
  const stored = (
    await reopened.request.get("/api/routine").then((r) => r.json())
  ).routine;
  expect(stored.steps.inbox).toBe("skipped_open");
  expect(stored.contexts[0].steps.enrichment).toBe("skipped_open");
  expect(stored.contexts[0].steps.planning).toBe("done");
  expect(stored.complete).toBe(false);
  const headers = { Origin: baseURL! };
  const firstAction = await page.request.post("/api/routine/navigate", {
    headers,
    data: {
      key: crypto.randomUUID(),
      id: stored.id,
      revision: stored.revision,
      step: "contexts",
    },
  });
  expect(firstAction.ok()).toBe(true);
  const stale = await reopened.request.post("/api/routine/skip", {
    headers,
    data: {
      key: crypto.randomUUID(),
      id: stored.id,
      revision: stored.revision,
      step: "problems",
    },
  });
  expect(stale.status()).toBe(409);
  await reopened.reload();
  await expect(
    reopened.getByRole("heading", {
      name: "Für welche Kontexte möchtest du planen?",
      exact: true,
    }),
  ).toBeVisible();
  await cloned.close();
  await restarted.close();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Für welche Kontexte möchtest du planen?",
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
