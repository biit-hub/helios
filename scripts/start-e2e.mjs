import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
const source = "apps/web/.next/static";
const server = "apps/web/.next/standalone/apps/web/server.js";
if (!existsSync(server)) throw new Error("Run pnpm build before browser tests");
cpSync(source, "apps/web/.next/standalone/apps/web/.next/static", {
  recursive: true,
});
const origin = new URL(process.env.AUTH_ORIGIN ?? "http://127.0.0.1:3101");
if (
  process.env.HELIOS_ENV !== "test" ||
  !new URL(process.env.DATABASE_URL ?? "").pathname.endsWith("_test")
)
  throw new Error("E2E must use isolated tests");
const fixture = spawn(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "tests/fixtures/todoist-server.ts"],
  { stdio: ["ignore", "inherit", "inherit", "ipc"], env: process.env },
);
await new Promise((resolve, reject) => {
  fixture.once("message", resolve);
  fixture.once("error", reject);
  fixture.once("exit", (code) => reject(new Error("Fixture exited " + code)));
});
const child = spawn(process.execPath, [server], {
  stdio: "inherit",
  env: { ...process.env, PORT: origin.port || "3101", HOSTNAME: "127.0.0.1" },
});
process.on("SIGTERM", () => {
  child.kill("SIGTERM");
  fixture.kill("SIGTERM");
});
process.on("SIGINT", () => {
  child.kill("SIGINT");
  fixture.kill("SIGTERM");
});
child.on("exit", (code) => {
  fixture.kill("SIGTERM");
  process.exit(code ?? 1);
});
