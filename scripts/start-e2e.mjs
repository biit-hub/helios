import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
const source = "apps/web/.next/static";
const server = "apps/web/.next/standalone/apps/web/server.js";
if (!existsSync(server)) throw new Error("Run pnpm build before browser tests");
cpSync(source, "apps/web/.next/standalone/apps/web/.next/static", {
  recursive: true,
});
const origin = new URL(process.env.AUTH_ORIGIN ?? "http://127.0.0.1:3101");
const child = spawn(process.execPath, [server], {
  stdio: "inherit",
  env: { ...process.env, PORT: origin.port || "3101", HOSTNAME: "127.0.0.1" },
});
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
child.on("exit", (code) => process.exit(code ?? 1));
