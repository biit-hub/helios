import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import type { AiJobDetail } from "@helios/contracts";
import { bootstrapWorkSettings } from "../fixtures/browser-work";
async function control(data: Record<string, boolean>) {
  const response = await fetch(
    new URL("/control", process.env.TODOIST_TEST_ORIGIN!),
    { method: "POST", body: JSON.stringify({ mode: "ok", ...data }) },
  );
  const diagnostic = await response.text();
  expect(
    response.ok,
    `Synthetic control HTTP ${response.status}: ${diagnostic}`,
  ).toBe(true);
}
async function create(page: Page, prompt: string) {
  const response = await page.request.post("/api/ai-jobs/create", {
    headers: { Origin: process.env.AUTH_ORIGIN! },
    data: {
      key: crypto.randomUUID(),
      prompt,
      output: "text",
      format: null,
      origin: null,
    },
  });
  expect(response.status()).toBe(202);
  return response.json() as Promise<AiJobDetail>;
}
async function state(page: Page, id: string, wanted: string) {
  await expect
    .poll(
      async () =>
        (await page.request.get("/api/ai-jobs?id=" + id).then((r) => r.json()))
          .status,
      { timeout: 45000 },
    )
    .toBe(wanted);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test.afterEach(async () => {
  await control({ releaseGpu: true });
});
test("UX-034/035 shared loading, reduced motion, contrast, prompt search, status and immutable result presentation", async ({
  page,
  baseURL,
}, info) => {
  const { errors } = await bootstrapWorkSettings(page, baseURL);
  mkdirSync("private/ui-consistency", { recursive: true });
  await page
    .getByRole("button", { name: "KI-Delegation", exact: true })
    .click();
  const settings = page
    .locator(".ai-job-setting")
    .filter({ has: page.getByRole("heading", { name: "Text", exact: true }) });
  const toggle = settings.getByRole("switch", { name: "Ausgabe aktivieren" });
  const track = settings.locator(".ui-switch-track");
  const trackBox = await track.boundingBox();
  expect(trackBox!.width).toBe(40);
  expect(trackBox!.height).toBe(24);
  const layout = await settings
    .locator("label.ui-switch")
    .evaluate((el) => getComputedStyle(el).flexDirection);
  expect(layout).toBe("row");
  await toggle.focus();
  await toggle.press("Space");
  await expect(toggle).toBeChecked();
  await settings
    .getByRole("combobox", { name: "Lokales Modell für Text" })
    .selectOption("synthetic-local");
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/ai-jobs/settings") &&
      r.request().method() === "POST",
  );
  await settings
    .getByRole("button", { name: "Einstellungen speichern", exact: true })
    .click();
  expect((await saved).status()).toBe(200);
  await control({ holdGpu: true });
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let posts = 0;
  await page.route("**/api/ai-jobs/create", async (route) => {
    posts++;
    await gate;
    await route.continue();
  });
  await page
    .getByRole("button", { name: "KI-Auftrag starten", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Neuer KI-Auftrag",
    exact: true,
  });
  const prompt = "Synthetischer UX-Auftrag ÜBERSICHT";
  await dialog
    .getByRole("textbox", { name: "Auftrag", exact: true })
    .fill(prompt);
  const admitted = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/ai-jobs/create") &&
      r.request().method() === "POST",
  );
  await dialog
    .getByRole("button", { name: "Auftrag erstellen", exact: true })
    .click();
  const pending = dialog.getByRole("button", {
    name: "KI-Auftrag wird erstellt …",
    exact: true,
  });
  await expect(pending).toBeDisabled();
  await expect(dialog.locator("canvas")).toHaveCount(1);
  await expect(
    dialog.getByRole("button", { name: "Schliessen", exact: true }),
  ).toBeDisabled();
  const widths = info.project.name === "desktop" ? [1440, 1024, 390] : [390];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 950 });
    await noOverflow(page);
    const sphere = await pending.locator("canvas").boundingBox();
    const text = await pending.locator(".ui-button-label").boundingBox();
    expect(sphere?.width).toBe(24);
    expect(sphere!.x + sphere!.width).toBeLessThanOrEqual(text!.x);
    await page.screenshot({
      path: `private/ui-consistency/loading-${info.project.name}-${width}.png`,
    });
  }
  await page.setViewportSize({
    width: info.project.name === "desktop" ? 1440 : 390,
    height: 950,
  });
  const visual = await pending.evaluate((button) => {
    const style = getComputedStyle(button);
    const channels = (value: string) =>
      value
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((v) => {
          const s = v / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
    const luminance = (c: number[]) =>
      c[0]! * 0.2126 + c[1]! * 0.7152 + c[2]! * 0.0722;
    const a = luminance(channels(style.color)),
      b = luminance(channels(style.backgroundColor));
    return {
      contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      opacity: style.opacity,
    };
  });
  expect(visual.contrast).toBeGreaterThanOrEqual(4.5);
  expect(visual.opacity).toBe("1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const staticImage = await pending
    .locator("canvas")
    .evaluate(async (canvas) => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      return (canvas as HTMLCanvasElement).toDataURL();
    });
  const nextImage = await pending.locator("canvas").evaluate(async (canvas) => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return (canvas as HTMLCanvasElement).toDataURL();
  });
  expect(nextImage).toBe(staticImage);
  release();
  const response = await admitted;
  expect(response.status()).toBe(202);
  const created = (await response.json()) as AiJobDetail;
  expect(posts).toBe(1);
  await expect(dialog.getByText(/Auftrag gespeichert/)).toBeVisible();
  await expect(dialog.locator("canvas")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Schliessen", exact: true }).click();
  await page.unroute("**/api/ai-jobs/create");
  await page.getByRole("link", { name: "KI-Aufträge", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "KI-Auftrag starten", exact: true }),
  ).toBeEnabled();
  await expect(
    page
      .locator(".ai-job-card")
      .filter({ hasText: prompt })
      .getByText("In Warteschlange", { exact: true }),
  ).toBeVisible();
  await control({ releaseGpu: true });
  await state(page, created.id, "ready");
  await page.reload();
  await page
    .getByRole("searchbox", { name: "Originalprompt durchsuchen" })
    .fill("übersicht");
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("ready");
  await page
    .getByRole("combobox", { name: "Sortierung", exact: true })
    .selectOption("oldest");
  await expect(page.locator(".ai-job-card")).toHaveCount(1);
  await expect(page.locator(".ai-job-card .ui-badge-success")).toHaveText(
    "Erledigt",
  );
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("error");
  await expect(
    page.getByText("Keine KI-Aufträge für diese Suche gefunden."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Suche zurücksetzen", exact: true })
    .click();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("");
  await page
    .getByRole("button", { name: "Auftrag ansehen", exact: true })
    .click();
  const detail = page.getByRole("dialog", { name: "KI-Auftrag", exact: true });
  const result = detail.locator(".ai-job-result-card").last();
  await expect(
    result.getByText("Synthetisches geprüftes Ergebnis", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as unknown as { uiCopied: string }).uiCopied = value;
        },
      },
    });
  });
  await result
    .getByRole("button", { name: "Ergebnis kopieren", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => (window as unknown as { uiCopied: string }).uiCopied,
    ),
  ).toBe("Synthetisches geprüftes Ergebnis");
  const followup = detail.locator(".ai-job-followup");
  const textArea = followup.getByRole("textbox", {
    name: "Nachbearbeitung anfordern",
    exact: true,
  });
  const refine = followup.getByRole("button", {
    name: "Nachbearbeitung einreichen",
    exact: true,
  });
  await expect(refine).toBeDisabled();
  const fieldBox = await textArea.boundingBox(),
    buttonBox = await refine.boundingBox();
  expect(buttonBox!.y).toBeGreaterThanOrEqual(fieldBox!.y + fieldBox!.height);
  expect(fieldBox!.width).toBeGreaterThan(200);
  await textArea.fill(
    "Synthetische Verbesserung mit erhaltener erster Version",
  );
  await refine.click();
  await state(page, created.id, "ready");
  await expect(detail.locator(".ai-job-result-card")).toHaveCount(2, {
    timeout: 20000,
  });
  await expect(
    detail.getByText("Synthetisch nachbearbeitetes Ergebnis", { exact: true }),
  ).toBeVisible();
  const versionHeader = detail
    .locator(".ai-job-result-card")
    .first()
    .locator("summary");
  if (info.project.name === "desktop") {
    await page.mouse.move(0, 0);
    const beforeHover = await versionHeader.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    await versionHeader.hover();
    const onHover = await versionHeader.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(onHover).not.toBe(beforeHover);
  }
  await versionHeader.focus();
  await versionHeader.press("Enter");
  expect(
    await versionHeader.evaluate((el) => getComputedStyle(el).outlineWidth),
  ).toBe("3px");
  await expect(
    detail.getByText("Synthetisches geprüftes Ergebnis", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `private/ui-consistency/results-${info.project.name}.png`,
  });
  await detail
    .getByRole("button", { name: "Auftrag abschliessen", exact: true })
    .click();
  await detail.getByRole("button", { name: "Bestätigen", exact: true }).click();
  await state(page, created.id, "closed");
  await detail.getByRole("button", { name: "Schliessen", exact: true }).click();
  const closed = page.locator(".ai-job-card-closed");
  await expect(
    closed.getByRole("heading", { name: prompt, exact: true }),
  ).toBeVisible();
  await expect(
    closed.getByText("Abgeschlossen", { exact: true }),
  ).toBeVisible();
  await expect(
    closed.getByText("Synthetisch nachbearbeitetes Ergebnis", { exact: true }),
  ).toHaveCount(0);
  const failed = await create(
    page,
    "Synthetischer Modellfehler: UX-Darstellung",
  );
  await state(page, failed.id, "error");
  const question = await create(page, "Synthetische Rückfrage: UX-Darstellung");
  await state(page, question.id, "awaiting_input");
  await page.reload();
  await expect(
    page.locator(".ui-badge-danger").getByText("Fehler", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".ui-badge-warning")
      .getByText("Wartet auf Input", { exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `private/ui-consistency/overview-${info.project.name}.png`,
  });
  await closed
    .getByRole("button", { name: "Auftrag ansehen", exact: true })
    .click();
  await expect(detail.locator(".ai-job-result-card")).toHaveCount(2);
  await expect(detail.getByText(prompt, { exact: true })).toHaveCount(1);
  await noOverflow(page);
  expect(errors).toEqual([]);
});
