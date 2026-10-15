import type { IncomingMessage, ServerResponse } from "node:http";
import { termihubFixture } from "./termihub";
import { localDay } from "../../packages/backend/src/planning/selection";
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
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.end("{}");
      return true;
    }
    if (req.headers.authorization !== "Bearer synthetic-termihub-only") {
      res.statusCode = 401;
      res.end("{}");
      return true;
    }
    if (mode === "permission" || mode === "network") {
      res.statusCode = mode === "permission" ? 403 : 503;
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
    if (
      path === "events" &&
      !url.searchParams.getAll("calendar_ids").includes(fixture.calendarId)
    ) {
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
