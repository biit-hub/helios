import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
const password = randomBytes(32).toString("hex");
writeFileSync(
  ".env",
  "HELIOS_ENV=development\nPOSTGRES_DB=helios_dev\nPOSTGRES_USER=helios\nPOSTGRES_PASSWORD=" +
    password +
    "\nDATABASE_URL=postgresql://helios:" +
    password +
    "@postgres:5432/helios_dev\nWEB_PORT=3100\nWORKER_ENABLED=true\nRESTORE_MODE=false\nNEXT_TELEMETRY_DISABLED=1\n",
  { flag: "wx", mode: 0o600 },
);
console.log("Private .env created; existing files are never overwritten.");
