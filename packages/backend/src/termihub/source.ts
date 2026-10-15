import type { TermiCalendar, TermiEvent, TermiWork, TermiTravel } from "./wire";
import type { TermiHubReader } from "./reader";
import { dayRange } from "./intervals";
import {
  calendarIdsFor,
  type CalendarContext,
  type CalendarMapping,
  type TermiIntegration,
} from "./store";
export type TermiHubSource = {
  calendars: TermiCalendar[];
  work: TermiWork[];
  events: TermiEvent[];
  travel: TermiTravel[];
  complete: boolean;
  warnings: string[];
};
export async function collectSource(
  reader: TermiHubReader,
  integration: TermiIntegration,
  token: string,
  day: string,
  timezone: string,
  contexts: CalendarContext[],
  mappings: CalendarMapping[],
): Promise<TermiHubSource> {
  if (!integration.baseUrl) throw new Error("TERMIHUB_NOT_CONNECTED");
  const base = integration.baseUrl,
    bounds = dayRange(day, timezone);
  const range = {
    start: new Date(bounds.start).toISOString(),
    end: new Date(bounds.end).toISOString(),
  };
  const calendars = await reader.calendars(base, token);
  const work = await reader.work(base, token, range);
  const travel = await reader.travel(base, token, range);
  const availableIds = new Set(
    calendars.data.filter((c) => c.enabled && c.visible).map((c) => c.id),
  );
  const ids = [
    ...new Set(contexts.flatMap((c) => calendarIdsFor(mappings, c.id))),
  ]
    .filter((id) => availableIds.has(id))
    .sort((a, b) => a.localeCompare(b));
  const events = ids.length
    ? await reader.events(base, token, range, ids)
    : { data: [], meta: calendars.meta };
  const warnings: string[] = [];
  if (
    [work.data.length, travel.data.length, events.data.length].some(
      (size) => size >= 500,
    )
  )
    warnings.push("result_incomplete");
  if (
    [work.meta.timezone, travel.meta.timezone, events.meta.timezone].some(
      (zone) => zone !== calendars.meta.timezone,
    )
  )
    warnings.push("source_timezone_changed");
  return {
    calendars: calendars.data,
    work: work.data,
    travel: travel.data,
    events: events.data,
    complete: !warnings.length,
    warnings,
  };
}
