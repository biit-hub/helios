import { test, expect } from "@playwright/test";
test("foundation and mobile layout are usable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/Anmeldung folgt in E1.2/)).toBeVisible();
  await page.getByRole("link", { name: /Mobiles Grundlayout/ }).click();
  await expect(page).toHaveURL(/mobile/);
  await expect(
    page.getByRole("link", { name: /Desktop-Grundlayout/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("liveness exposes no configuration", async ({ request }) => {
  const r = await request.get("/api/health/live");
  expect(r.status()).toBe(200);
  expect(await r.json()).toEqual({
    status: "ok",
    service: "web",
    stage: "E1.1",
  });
  expect(r.headers()["cache-control"]).toBe("no-store");
});
