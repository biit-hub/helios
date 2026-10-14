import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const [recipients, out] = process.argv.slice(2);
if (!recipients || !out?.endsWith(".age"))
  throw new Error("Usage: backup.mjs recipients.txt backup.dump.age");
const dump = spawnSync(
  "docker",
  [
    "compose",
    "exec",
    "-T",
    "postgres",
    "sh",
    "-c",
    'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc',
  ],
  { maxBuffer: 256 * 1024 * 1024 },
);
if (dump.status !== 0) throw new Error("pg_dump failed; no backup created");
const encrypted = spawnSync("age", ["-R", recipients], {
  input: dump.stdout,
  maxBuffer: 256 * 1024 * 1024,
});
dump.stdout.fill(0);
if (encrypted.status !== 0)
  throw new Error("age encryption failed; no backup created");
writeFileSync(out, encrypted.stdout, { flag: "wx", mode: 0o600 });
console.log(
  "Encrypted backup created; external upload and retention are separate.",
);
