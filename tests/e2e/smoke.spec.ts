import { test, expect } from "@playwright/test";
test("unauthenticated desktop and mobile shells redirect to real login", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/login/);
  await expect(page.getByLabel("Benutzername")).toBeVisible();
  await page.goto("/mobile");
  await expect(page).toHaveURL(/login\?returnTo=%2Fmobile/);
  const denied = await request.get("/api/protected");
  expect(denied.status()).toBe(401);
  expect(await denied.json()).toEqual({ error: { code: "AUTH_REQUIRED" } });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("liveness reveals no configuration; raw auth routes and CSRF are blocked", async ({
  request,
}) => {
  const r = await request.get("/api/health/live");
  expect(r.status()).toBe(200);
  expect(await r.json()).toEqual({
    status: "ok",
    service: "web",
    stage: "E1.2",
  });
  expect(
    (await request.post("/api/auth/sign-up/email", { data: {} })).status(),
  ).toBe(404);
  expect(
    (
      await request.post("/api/identity/login", {
        headers: { Origin: "https://attacker.invalid" },
        data: { username: "synthetic_user", password: "synthetic" },
      })
    ).status(),
  ).toBe(403);
});
