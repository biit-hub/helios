import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
const file = ".env";
let text = readFileSync(file, "utf8");
if (!/^HELIOS_ENV=development$/m.test(text))
  throw new Error("Initialize only local development configuration");
if (!/^INTEGRATION_KEY=/m.test(text)) {
  text =
    text.trimEnd() +
    "\nINTEGRATION_KEY=" +
    randomBytes(32).toString("hex") +
    "\n";
  writeFileSync(file, text, { mode: 0o600 });
  console.log("Local integration encryption key added; value not logged.");
} else console.log("Existing integration key preserved.");
