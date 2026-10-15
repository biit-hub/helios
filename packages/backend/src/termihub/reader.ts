import { z } from "zod";
import {
  calendarSchema,
  eventSchema,
  workSchema,
  travelSchema,
  envelope,
} from "./wire";
import { TermiHubFault, type TermiHubTransport } from "./transport";

export type TermiHubRange = { start: string; end: string };
export type TermiHubReader = ReturnType<typeof createTermiHubReader>;
export function createTermiHubReader(transport: TermiHubTransport) {
  async function read<T extends z.ZodType>(
    base: string,
    token: string,
    path: string,
    schema: T,
    query = new URLSearchParams(),
  ) {
    const raw = await transport(base, path, query, token);
    const parsed = envelope(schema).safeParse(raw);
    if (
      !parsed.success ||
      (path !== "calendars" && parsed.data.data.length > 500)
    )
      throw new TermiHubFault("TERMIHUB_CONTRACT");
    return parsed.data;
  }
  function params(range: TermiHubRange) {
    const start = Date.parse(range.start),
      end = Date.parse(range.end);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start >= end ||
      end - start > 2 * 86400000
    )
      throw new TermiHubFault("TERMIHUB_RANGE_INVALID", 400);
    return new URLSearchParams({
      start: range.start,
      end: range.end,
      limit: "500",
    });
  }
  return {
    calendars: (base: string, token: string) =>
      read(base, token, "calendars", calendarSchema),
    async events(
      base: string,
      token: string,
      range: TermiHubRange,
      calendarIds: string[],
    ) {
      if (
        !calendarIds.length ||
        calendarIds.length > 100 ||
        calendarIds.some((id) => !z.uuid().safeParse(id).success)
      )
        throw new TermiHubFault("TERMIHUB_CALENDAR_MAPPING", 400);
      const query = params(range);
      // calendar_ids also filters virtual identities in the published implementation.
      // Setting virtual_calendar_ids as well would intersect, not union, both filters.
      for (const id of [...new Set(calendarIds)].sort((a, b) =>
        a.localeCompare(b),
      ))
        query.append("calendar_ids", id);
      query.set("include_virtual", "true");
      const result = await read(base, token, "events", eventSchema, query);
      if (result.data.some((event) => !calendarIds.includes(event.calendar.id)))
        throw new TermiHubFault("TERMIHUB_SCOPE", 409);
      return result;
    },
    work: (base: string, token: string, range: TermiHubRange) =>
      read(base, token, "work-locations", workSchema, params(range)),
    travel: (base: string, token: string, range: TermiHubRange) =>
      read(base, token, "travel", travelSchema, params(range)),
  };
}
