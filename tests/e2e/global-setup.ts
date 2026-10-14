import { execFileSync } from "node:child_process";
export default function setup() {
  execFileSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "tests/e2e/fixture-bootstrap.ts"],
    { stdio: "pipe" },
  );
}
