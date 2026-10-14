import { createServer } from "node:http";
import { taskFixture as fixture } from "./tasks";
if (
  process.env.HELIOS_ENV !== "test" ||
  !new URL(process.env.DATABASE_URL ?? "").pathname.endsWith("_test")
)
  throw new Error("Fixture server is test only");
const origin = new URL(
  process.env.TODOIST_TEST_ORIGIN ?? "http://127.0.0.1:3102/api/v1/",
);
if (origin.hostname !== "127.0.0.1") throw new Error("Loopback required");
const f = fixture();
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/assertions") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          reads: f.calls.filter((c) => c.method === "GET").length,
          writes: f.calls.filter((c) => c.method !== "GET").length,
          taskProjectIds: f.calls
            .filter((c) => new URL(c.url).pathname === "/api/v1/tasks")
            .map((c) => new URL(c.url).searchParams.get("project_id")),
        }),
      );
      return;
    }
    if (req.url === "/control" && req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const data = JSON.parse(raw);
      if (
        !["ok", "auth_error", "network", "rate_limit", "unexpected"].includes(
          data.mode,
        )
      )
        throw new Error("Invalid fixture mode");
      f.state.mode = data.mode;
      if (data.scenario === "planning") {
        const template = structuredClone(f.state.tasks[1]!);
        const ids = ["project:private/alpha", "project:work/beta"];
        f.state.tasks = ids.flatMap((project_id, n) =>
          Array.from({ length: n ? 2 : 3 }, (_, i) => ({
            ...template,
            id: "plan-" + n + "-" + i,
            project_id,
            parent_id: null,
            content: "Synthetischer Schritt " + n + "-" + i,
            priority: 4 - i,
            section_id: "section:open",
            due: null,
            deadline: null,
          })),
        );
        const parent = {
          ...template,
          id: "plan-epic",
          project_id: ids[0]!,
          parent_id: null,
          content: "Synthetisches Vorhaben",
          labels: ["epic"],
          section_id: "section:open",
        };
        f.state.tasks.push(parent, {
          ...template,
          id: "plan-child",
          project_id: ids[0]!,
          parent_id: parent.id,
          content: "Synthetische Unteraufgabe",
          section_id: "section:open",
        });
      }
      res.end("{}");
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const response = await f.fetcher(new URL(req.url ?? "/", origin), {
      method: req.method,
      body: body || undefined,
      headers: { Authorization: req.headers.authorization ?? "" },
    });
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(await response.text());
  } catch {
    res.statusCode = 503;
    res.end("{}");
  }
});
server.listen(Number(origin.port), "127.0.0.1", () => process.send?.("ready"));
process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
