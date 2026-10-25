import { test, expect } from "@playwright/test";
import { bootstrapWorkSettings } from "../fixtures/browser-work";
import type { AiJobDetail } from "@helios/contracts";
test("UX-035 closed AI surfaces remain gray and version cards keep one frame", async ({
  page,
  baseURL,
}) => {
  await bootstrapWorkSettings(page, baseURL);
  await page
    .getByRole("button", { name: "KI-Delegation", exact: true })
    .click();
  const setting = page
    .locator(".ai-job-setting")
    .filter({ has: page.getByRole("heading", { name: "Text", exact: true }) });
  await setting.getByRole("switch", { name: "Ausgabe aktivieren" }).check();
  await setting
    .getByRole("combobox", { name: "Lokales Modell für Text" })
    .selectOption("synthetic-local");
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/ai-jobs/settings") &&
      r.request().method() === "POST",
  );
  await setting
    .getByRole("button", { name: "Einstellungen speichern", exact: true })
    .click();
  expect((await saved).status()).toBe(200);
  const created = await page.request.post("/api/ai-jobs/create", {
    headers: { Origin: process.env.AUTH_ORIGIN! },
    data: {
      key: crypto.randomUUID(),
      prompt: "Synthetischer Auftrag zur Prüfung abgeschlossener Karten",
      output: "text",
      format: null,
      origin: null,
    },
  });
  expect(created.status()).toBe(202);
  let job = (await created.json()) as AiJobDetail;
  await expect
    .poll(
      async () => {
        job = await page.request
          .get("/api/ai-jobs?id=" + job.id)
          .then((r) => r.json());
        return job.status;
      },
      { timeout: 45000 },
    )
    .toBe("ready");
  const closed = await page.request.post("/api/ai-jobs/close", {
    headers: { Origin: process.env.AUTH_ORIGIN! },
    data: { key: crypto.randomUUID(), id: job.id, revision: job.revision },
  });
  expect(closed.ok()).toBe(true);
  await page.getByRole("link", { name: "KI-Aufträge", exact: true }).click();
  const card = page.locator(".ai-job-card-closed");
  await expect(card.getByText("Abgeschlossen", { exact: true })).toBeVisible();
  expect(
    await card.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(240, 238, 232)");
  await card
    .getByRole("button", { name: "Auftrag ansehen", exact: true })
    .click();
  const result = page
    .getByRole("dialog", { name: "KI-Auftrag", exact: true })
    .locator(".ai-job-result-card");
  await expect(result).toHaveCount(1);
  expect(await result.evaluate((el) => getComputedStyle(el).paddingLeft)).toBe(
    "0px",
  );
  expect(
    await result
      .locator(":scope > details")
      .evaluate((el) => getComputedStyle(el).borderTopWidth),
  ).toBe("0px");
  await expect(
    result.getByRole("button", { name: "Ergebnis kopieren", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
