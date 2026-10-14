import { spawnSync } from "node:child_process";
const prefix = [
  "compose",
  "-f",
  "infra/compose.test.yaml",
  "exec",
  "-T",
  "postgres",
];
function run(args, input) {
  const r = spawnSync("docker", [...prefix, ...args], {
    input,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error("Isolated backup/restore command failed");
  return r.stdout;
}
const before = run([
  "psql",
  "-U",
  "helios",
  "-d",
  "helios_test",
  "-At",
  "-c",
  "SELECT id FROM technical_probes ORDER BY id",
]);
const dump = run(["pg_dump", "-U", "helios", "-d", "helios_test", "-Fc"]);
run(["createdb", "-U", "helios", "helios_restore_test"]);
run(
  [
    "pg_restore",
    "-U",
    "helios",
    "-d",
    "helios_restore_test",
    "--exit-on-error",
    "--no-owner",
  ],
  dump,
);
const after = run([
  "psql",
  "-U",
  "helios",
  "-d",
  "helios_restore_test",
  "-At",
  "-c",
  "SELECT id FROM technical_probes ORDER BY id",
]);
if (!before.equals(after) || !before.length)
  throw new Error("Restored data differs or source empty");
console.log(
  "Isolated pg_dump/pg_restore probe passed; synthetic rows: " +
    before.toString().trim().split("\n").length,
);
