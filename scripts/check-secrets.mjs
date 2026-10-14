import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const rules = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{50,}/,
  /AKIA[A-Z0-9]{16}/,
  /C:[\\/]Users[\\/]/i,
];
let failed = false;
for (const file of files) {
  if (
    (/^(?:.*\/)?\.env(?:\..*)?$/.test(file) &&
      !file.endsWith(".env.example")) ||
    /\.(?:dump|pem|key|pfx|p12)$/.test(file)
  ) {
    console.error("Forbidden private file: " + file);
    failed = true;
    continue;
  }
  const content = readFileSync(file, "utf8");
  if (rules.some((rule) => rule.test(content))) {
    console.error("Potential secret or private path: " + file);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("Tracked-file secret and private-path checks passed.");
