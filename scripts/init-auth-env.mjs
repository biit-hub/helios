import { readFileSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
const path = ".env";
const existing = readFileSync(path, "utf8");
if (/^HELIOS_ENV=production$/m.test(existing))
  throw new Error(
    "Configure production secrets and HTTPS origin explicitly; no defaults.",
  );
const additions = [];
if (!/^AUTH_SECRET=/m.test(existing))
  additions.push("AUTH_SECRET=" + randomBytes(32).toString("hex"));
if (!/^AUTH_ORIGIN=/m.test(existing))
  additions.push("AUTH_ORIGIN=http://127.0.0.1:3100");
if (additions.length)
  appendFileSync(path, "\n" + additions.join("\n") + "\n", { mode: 0o600 });
console.log(
  "Private identity configuration prepared; existing values unchanged.",
);
