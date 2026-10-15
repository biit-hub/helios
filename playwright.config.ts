import { defineConfig, devices } from "@playwright/test";
const url = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3101";
// A browser test must never fall back to a development/production database.
if (
  process.env.HELIOS_ENV !== "test" ||
  !process.env.DATABASE_URL ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
)
  throw new Error(
    "E2E requires HELIOS_ENV=test and a dedicated _test database",
  );
process.env.AUTH_SECRET ??= "e".repeat(64);
process.env.AUTH_ORIGIN = url;
process.env.INTEGRATION_KEY ??= "b".repeat(64);
process.env.TODOIST_TEST_ORIGIN ??= "http://127.0.0.1:3102/api/v1/";
process.env.TERMIHUB_TEST_ORIGIN = new URL(
  process.env.TODOIST_TEST_ORIGIN,
).origin;
process.env.OLLAMA_BASE_URL = new URL(process.env.TODOIST_TEST_ORIGIN).origin;
process.env.OLLAMA_MODEL = "synthetic-local";
process.env.OLLAMA_TIMEOUT_SECONDS = "5";
export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: "**/fixture-bootstrap.ts",
  globalSetup: "./tests/e2e/global-setup.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 240000,
  use: {
    baseURL: url,
    trace: "retain-on-failure",
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "node scripts/start-e2e.mjs",
        url: url + "/login",
        reuseExistingServer: false,
        env: {
          HELIOS_ENV: "test",
          DATABASE_URL: process.env.DATABASE_URL,
          AUTH_SECRET: process.env.AUTH_SECRET,
          AUTH_ORIGIN: url,
          INTEGRATION_KEY: process.env.INTEGRATION_KEY,
          TODOIST_TEST_ORIGIN: process.env.TODOIST_TEST_ORIGIN,
          OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
          TERMIHUB_TEST_ORIGIN: process.env.TERMIHUB_TEST_ORIGIN,
          OLLAMA_MODEL: process.env.OLLAMA_MODEL,
          OLLAMA_TIMEOUT_SECONDS: process.env.OLLAMA_TIMEOUT_SECONDS,
        },
      },
});
