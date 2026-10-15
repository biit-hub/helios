import { DateTime } from "luxon";
import type { CalendarInterval, CalendarBudget } from "@helios/contracts";
import type { TermiEvent, TermiWork, TermiTravel } from "./wire";
import { TermiHubFault } from "./transport";
export type Span = { start: number; end: number };
export function dayRange(day: string, timezone: string): Span {
  const start = DateTime.fromISO(day, { zone: timezone }).startOf("day");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !start.isValid ||
    start.toISODate() !== day
  )
    throw new TermiHubFault("TERMIHUB_DAY_INVALID", 400);
  const end = start.plus({ days: 1 }).startOf("day");
  if (!end.isValid || end.toMillis() <= start.toMillis())
    throw new TermiHubFault("TERMIHUB_DAY_INVALID", 400);
  return { start: start.toMillis(), end: end.toMillis() };
}
export const isoSpan = (span: Span): CalendarInterval => ({
  start: new Date(span.start).toISOString(),
  end: new Date(span.end).toISOString(),
});
export function union(spans: Span[]): Span[] {
  const result: Span[] = [];
  for (const span of spans
    .filter(
      (s) =>
        Number.isFinite(s.start) && Number.isFinite(s.end) && s.start < s.end,
    )
    .sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = result.at(-1);
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else result.push({ ...span });
  }
  return result;
}
export function intersect(spans: Span[], windows: Span[]): Span[] {
  const result: Span[] = [];
  for (const a of spans)
    for (const b of windows) {
      const start = Math.max(a.start, b.start),
        end = Math.min(a.end, b.end);
      if (start < end) result.push({ start, end });
    }
  return union(result);
}
export function subtract(windows: Span[], blocks: Span[]): Span[] {
  const result: Span[] = [];
  for (const window of union(windows)) {
    let cursor = window.start;
    for (const block of union(blocks)) {
      if (block.end <= cursor || block.start >= window.end) continue;
      if (block.start > cursor)
        result.push({ start: cursor, end: Math.min(block.start, window.end) });
      cursor = Math.max(cursor, block.end);
      if (cursor >= window.end) break;
    }
    if (cursor < window.end) result.push({ start: cursor, end: window.end });
  }
  return result;
}
export const minutes = (spans: Span[]) =>
  Math.floor(union(spans).reduce((sum, s) => sum + s.end - s.start, 0) / 60000);
function eventSpan(event: TermiEvent): Span {
  if (!event.all_day)
    return { start: Date.parse(event.start!), end: Date.parse(event.end!) };
  // TermiHub preserves the provider's exclusive end boundary as a local date.
  return {
    start: dayRange(event.start_date!, event.timezone).start,
    end: dayRange(event.end_date!, event.timezone).start,
  };
}
export type NormalizedDay = {
  schemaVersion: 1;
  work: CalendarInterval[];
  fixed: CalendarInterval[];
  uncertain: CalendarInterval[];
  freeCertain: CalendarInterval[];
  freePossible: CalendarInterval[];
  workMinutes: number | null;
  fixedMinutes: number | null;
  uncertainMinutes: number | null;
  budget: CalendarBudget | null;
  complete: boolean;
  warnings: string[];
  modes: string[];
};
function classifyEvent(
  event: TermiEvent,
  fixed: Span[],
  uncertain: Span[],
  warnings: Set<string>,
) {
  const span = eventSpan(event);
  if (["BUSY", "OUT_OF_OFFICE"].includes(event.availability)) fixed.push(span);
  else if (!["FREE", "WORKING_ELSEWHERE"].includes(event.availability)) {
    uncertain.push(span);
    if (!["TENTATIVE", "UNKNOWN"].includes(event.availability))
      warnings.add("availability_unknown");
  }
}
function eventOccupancy(
  events: TermiEvent[],
  calendarIds: string[],
  warnings: Set<string>,
) {
  let complete = true;
  const fixed: Span[] = [],
    uncertain: Span[] = [],
    knownEvents: TermiEvent[] = [];
  const seen = new Map<string, string>();
  for (const event of events) {
    if (!calendarIds.includes(event.calendar.id)) {
      complete = false;
      warnings.add("foreign_calendar");
      continue;
    }
    if (["cancelled", "canceled"].includes(event.status.toLowerCase()))
      continue;
    knownEvents.push(event);
    const span = eventSpan(event);
    const key = JSON.stringify([event.id, event.start ?? event.start_date]);
    const signature = JSON.stringify([
      span,
      event.availability,
      event.calendar.id,
    ]);
    const prior = seen.get(key);
    if (prior && prior !== signature) {
      complete = false;
      warnings.add("conflicting_event_identity");
    }
    if (prior === signature) continue;
    seen.set(key, signature);
    classifyEvent(event, fixed, uncertain, warnings);
  }

  return { fixed, uncertain, knownEvents, complete };
}
function sameOccurrence(
  event: TermiEvent,
  related: NonNullable<TermiTravel["related_event"]>,
) {
  if (event.id !== related.id) return false;
  if (event.all_day) return event.start_date === related.start_date;
  return (
    related.start !== null &&
    Date.parse(event.start!) === Date.parse(related.start)
  );
}
function travelOccupancy(
  travels: TermiTravel[],
  events: TermiEvent[],
  work: Span[],
  boundary: Span,
  warnings: Set<string>,
) {
  const fixed: Span[] = [];
  let complete = true;
  for (const travel of travels) {
    const span = {
      start: Date.parse(travel.start),
      end: Date.parse(travel.end),
    };
    if (!intersect([span], work.length ? work : [boundary]).length) continue;
    if (
      travel.related_event &&
      events.some((event) => sameOccurrence(event, travel.related_event!))
    )
      fixed.push(span);
    else if (work.length) {
      complete = false;
      warnings.add("travel_unassigned");
    }
  }
  return { fixed, complete };
}

export function normalizeDay(input: {
  day: string;
  timezone: string;
  organizationId: string | null;
  calendarIds: string[];
  work: TermiWork[];
  events: TermiEvent[];
  travel: TermiTravel[];
  complete: boolean;
  mappingsComplete: boolean;
  kind?: "private" | "employer";
}): NormalizedDay {
  const boundary = dayRange(input.day, input.timezone);
  const warnings = new Set<string>();
  const work = intersect(
    input.work
      .filter((w) => w.organization.id === input.organizationId)
      .map((w) => ({ start: Date.parse(w.start), end: Date.parse(w.end) })),
    [boundary],
  );
  const modes = [
    ...new Set(
      input.work
        .filter((w) => w.organization.id === input.organizationId)
        .map((w) => w.mode),
    ),
  ].sort((a, b) => a.localeCompare(b));
  let complete =
    input.complete &&
    input.mappingsComplete &&
    (input.kind === "private" || input.organizationId !== null);
  if (!input.complete) warnings.add("result_incomplete");
  if (!input.mappingsComplete) warnings.add("calendar_mapping_incomplete");
  if (input.organizationId === null && input.kind !== "private")
    warnings.add("organization_unmapped");
  const events = eventOccupancy(input.events, input.calendarIds, warnings);
  const travel = travelOccupancy(
    input.travel,
    events.knownEvents,
    work,
    boundary,
    warnings,
  );
  complete = complete && events.complete && travel.complete;
  const fixed = [...events.fixed, ...travel.fixed],
    uncertain = events.uncertain;
  const fixedWithin = intersect(fixed, work.length ? work : [boundary]);
  // Uncertain minutes exclude already fixed occupancy; both bounds use interval union.
  const uncertainWithin = subtract(
    intersect(uncertain, work.length ? work : [boundary]),
    fixedWithin,
  );
  const freePossible = subtract(work, fixedWithin);
  const freeCertain = subtract(work, [...fixedWithin, ...uncertainWithin]);
  if (!work.length) warnings.add("no_work_data");
  const budget =
    complete && work.length
      ? {
          minimumMinutes: minutes(freeCertain),
          maximumMinutes: minutes(freePossible),
        }
      : null;
  return {
    schemaVersion: 1,
    work: work.map(isoSpan),
    fixed: fixedWithin.map(isoSpan),
    uncertain: uncertainWithin.map(isoSpan),
    freeCertain: freeCertain.map(isoSpan),
    freePossible: freePossible.map(isoSpan),
    workMinutes: work.length ? minutes(work) : null,
    fixedMinutes: work.length ? minutes(fixedWithin) : null,
    uncertainMinutes: work.length ? minutes(uncertainWithin) : null,
    budget,
    complete,
    warnings: [...warnings].sort((a, b) => a.localeCompare(b)),
    modes,
  };
}
