import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const {
  RELEASE_PR: pr,
  RELEASE_SHA: sha,
  RELEASE_VERSION: version,
  GITHUB_REPOSITORY: repo,
  DOCKERHUB_NAMESPACE: namespace,
} = process.env;
if (
  !/^\d+$/.test(pr ?? "") ||
  !/^[a-f0-9]{40}$/.test(sha ?? "") ||
  !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? "") ||
  !/^[a-z0-9][a-z0-9_-]*$/.test(namespace ?? "")
)
  throw new Error(
    "Invalid approved release inputs or Docker Hub not configured",
  );
const api = (path) =>
  JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8" }));
const p = api("repos/" + repo + "/pulls/" + pr);
if (
  p.state !== "open" ||
  p.draft ||
  p.base.ref !== "main" ||
  p.head.ref !== "develop" ||
  p.head.repo.full_name !== repo ||
  p.head.sha !== sha
)
  throw new Error("Release PR does not match exact approved source");
if (readFileSync("CHANGELOG.md", "utf8").includes("## " + version) === false)
  throw new Error("Changelog release entry missing");
for (const path of [
  "package.json",
  "apps/web/package.json",
  "apps/worker/package.json",
  "packages/backend/package.json",
  "packages/contracts/package.json",
  "packages/ui/package.json",
])
  if (JSON.parse(readFileSync(path, "utf8")).version !== version)
    throw new Error("Workspace version mismatch");
const checks = api(
  "repos/" + repo + "/commits/" + sha + "/check-runs?per_page=100",
).check_runs;
for (const name of ["checks", "docker", "analyze"])
  if (
    !checks.some(
      (c) =>
        c.name === name &&
        c.status === "completed" &&
        c.conclusion === "success" &&
        c.app.slug === "github-actions",
    )
  )
    throw new Error("Required successful check missing: " + name);
try {
  api("repos/" + repo + "/git/ref/tags/v" + version);
  throw new Error("Version already exists");
} catch (error) {
  if (!String(error.message).includes("404")) throw error;
}
console.log("Exact approved release PR, version and checks verified.");
