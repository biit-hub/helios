import type { IncomingMessage, ServerResponse } from "node:http";
import { termihubFixture } from "./termihub";
import { localDay } from "../../packages/backend/src/planning/selection";
function outsideCalendarScope(path: string, url: URL, id: string) {
  return (
    path === "events" && !url.searchParams.getAll("calendar_ids").includes(id)
  );
}
function fixtureReadStatus(req: IncomingMessage, mode: string) {
  if (req.method !== "GET") return 405;
  if (req.headers.authorization !== "Bearer synthetic-termihub-only")
    return 401;
  if (mode === "permission") return 403;
  if (mode === "network") return 503;
  return 200;
}
export function termihubServerFixture() {
  let mode = "ok",
    fixture = termihubFixture(localDay(new Date(), "Europe/Zurich"));
  return async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/termihub-control" && req.method === "POST") {
      let raw = "";
      for await (const part of req) raw += part;
      const control = JSON.parse(raw);
      if (control.reset)
        fixture = termihubFixture(localDay(new Date(), "Europe/Zurich"));
      if (!["ok", "permission", "network", "busy"].includes(control.mode))
        throw new Error("Invalid synthetic mode");
      mode = control.mode;
      res.end("{}");
      return true;
    }
    if (!url.pathname.startsWith("/api/v1/external/")) return false;
    res.setHeader("Content-Type", "application/json");
    const status = fixtureReadStatus(req, mode);
    if (status !== 200) {
      res.statusCode = status;
      res.end("{}");
      return true;
    }
    const path = url.pathname.slice("/api/v1/external/".length);
    if (mode === "busy") {
      const day = localDay(new Date(), "Europe/Zurich");
      fixture.data.events = fixture.data.events!.map((e) => ({
        ...(e as object),
        start: `${day}T08:00:00+02:00`,
        end: `${day}T17:00:00+02:00`,
      }));
    }
    if (outsideCalendarScope(path, url, fixture.calendarId)) {
      res.statusCode = 400;
      res.end("{}");
      return true;
    }
    const response = await fixture.transport(
      "http://127.0.0.1",
      path,
      url.searchParams,
      "synthetic-termihub-only",
    );
    res.end(JSON.stringify(response));
    return true;
  };
}
