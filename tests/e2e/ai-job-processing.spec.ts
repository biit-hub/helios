import { test, expect, type Page } from "@playwright/test";
import { bootstrapWorkSettings } from "../fixtures/browser-work";
import type { AiJobDetail } from "@helios/contracts";
async function setting(page: Page, name: "Text" | "Datei" | "Recherche") {
  const form = page
    .locator(".ai-job-setting")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await form.getByRole("switch", { name: "Ausgabe aktivieren" }).check();
  await form
    .getByRole("combobox", { name: "Lokales Modell für " + name })
    .selectOption("synthetic-local");
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/ai-jobs/settings") &&
      r.request().method() === "POST",
  );
  await form
    .getByRole("button", { name: "Einstellungen speichern", exact: true })
    .click();
  expect((await saved).status()).toBe(200);
}
async function create(
  page: Page,
  prompt: string,
  output = "text",
  format: string | null = null,
) {
  const response = await page.request.post("/api/ai-jobs/create", {
    headers: { Origin: process.env.AUTH_ORIGIN! },
    data: { key: crypto.randomUUID(), prompt, output, format, origin: null },
  });
  expect(response.status()).toBe(202);
  return response.json() as Promise<AiJobDetail>;
}
test("F-001.2 questions, automatic continuation, immutable refinement, conscious completion, real file download and global failures", async ({
  page,
  baseURL,
  playwright,
}, info) => {
  const anonymous = await playwright.request.newContext({ baseURL });
  expect(
    (
      await anonymous.get("/api/ai-jobs/artifact?job=invalid&id=invalid")
    ).status(),
  ).toBe(401);
  await anonymous.dispose();
  const { errors } = await bootstrapWorkSettings(page, baseURL);
  await page
    .getByRole("button", { name: "KI-Delegation", exact: true })
    .click();
  await setting(page, "Text");
  await setting(page, "Datei");
  await setting(page, "Recherche");
  const job = await create(
    page,
    "Synthetische Rückfrage: einen kurzen lokalen Text erstellen",
  );
  await page.goto("/ai-jobs?job=" + job.id);
  const detail = page.getByRole("dialog", { name: "KI-Auftrag", exact: true });
  await expect(
    detail.getByRole("textbox", { name: "Deine Antwort" }),
  ).toBeVisible({ timeout: 45000 });
  await detail
    .getByRole("textbox", { name: "Deine Antwort" })
    .fill("Synthetische Zielgruppe");
  await detail.getByRole("button", { name: "Schliessen", exact: true }).click();
  await detail
    .getByRole("button", { name: "Weiterbearbeiten", exact: true })
    .click();
  await expect(
    detail.getByRole("textbox", { name: "Deine Antwort" }),
  ).toHaveValue("Synthetische Zielgruppe");
  let posted = 0;
  await page.route("**/api/ai-jobs/answer", async (route) => {
    posted++;
    const response = await route.fetch();
    await route.abort("failed");
    expect(response.status()).toBe(200);
  });
  await detail
    .getByRole("button", {
      name: "Antwort speichern & fortsetzen",
      exact: true,
    })
    .click();
  await expect(
    detail.getByRole("button", {
      name: "Gespeicherten Stand prüfen",
      exact: true,
    }),
  ).toBeVisible();
  await detail
    .getByRole("button", { name: "Gespeicherten Stand prüfen", exact: true })
    .click();
  expect(posted).toBe(1);
  await expect(
    detail.getByRole("textbox", { name: "Nachbearbeitung anfordern" }),
  ).toBeVisible({ timeout: 45000 });
  await detail
    .getByRole("textbox", { name: "Nachbearbeitung anfordern" })
    .fill("Bitte synthetisch nachbearbeiten");
  await detail
    .getByRole("button", { name: "Nachbearbeitung einreichen", exact: true })
    .click();
  await expect(
    detail.getByText("Synthetisch nachbearbeitetes Ergebnis", { exact: true }),
  ).toBeVisible({ timeout: 45000 });
  const history = (await page.request
    .get("/api/ai-jobs?id=" + job.id)
    .then((r) => r.json())) as AiJobDetail;
  expect(history.results.map((r) => r.version)).toEqual([1, 2]);
  expect(history.status).toBe("ready");
  await detail
    .getByRole("button", { name: "Auftrag abschliessen", exact: true })
    .click();
  await detail.getByRole("button", { name: "Bestätigen", exact: true }).click();
  await expect(
    detail.getByText("Abgeschlossen", { exact: true }),
  ).toBeVisible();
  await detail.getByRole("button", { name: "Schliessen", exact: true }).click();
  const file = await create(
    page,
    "Synthetische Word-Datei erstellen",
    "file",
    "docx",
  );
  await page.goto("/ai-jobs?job=" + file.id);
  const download = detail.getByRole("link", { name: /Datei herunterladen/ });
  await expect(download).toBeVisible({ timeout: 45000 });
  const response = await page.request.get(
    (await download.getAttribute("href"))!,
  );
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toContain("attachment;");
  expect((await response.body()).subarray(0, 2).toString()).toBe("PK");
  await page.screenshot({
    path: "private/f001-2-" + info.project.name + "-result-synthetic.png",
    fullPage: true,
  });
  await detail.getByRole("button", { name: "Schliessen", exact: true }).click();
  const failed = await create(
    page,
    "Synthetischer Modellfehler: ungültige Ausgabe",
  );
  await expect
    .poll(
      async () =>
        (
          await page.request
            .get("/api/ai-jobs?id=" + failed.id)
            .then((r) => r.json())
        ).status,
      { timeout: 45000 },
    )
    .toBe("error");
  await page.getByRole("link", { name: "Probleme", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /KI-Aufträge · 1 offen/ }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "KI-Auftrag ansehen", exact: true })
    .click();
  await expect(
    detail.getByRole("button", {
      name: "Bewusst erneut bearbeiten",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
