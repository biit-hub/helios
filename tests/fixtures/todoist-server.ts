import { createServer } from "node:http";
import { fixture } from "./todoist";
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
      res.end("{}");
      return;
    }
    const response = await f.fetcher(new URL(req.url ?? "/", origin), {
      method: req.method,
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
