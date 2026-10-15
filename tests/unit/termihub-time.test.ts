import { describe, expect, it } from "vitest";
import {
  dayRange,
  normalizeDay,
  union,
} from "../../packages/backend/src/termihub/intervals";
import type {
  TermiEvent,
  TermiWork,
  TermiTravel,
} from "../../packages/backend/src/termihub/wire";
const day = "2026-10-15",
  timezone = "Europe/Zurich";
const at = (hour: number) =>
  `2026-10-15T${String(hour).padStart(2, "0")}:00:00+02:00`;
const work = (
  start = 8,
  end = 17,
  organization = "synthetic-org",
): TermiWork => ({
  id: "synthetic-work",
  start: at(start),
  end: at(end),
  mode: "homeoffice",
  organization: { id: organization, name: "Synthetic employer" },
  recurring: false,
  segment: true,
});
const event = (
  start = 9,
  end = 10,
  availability = "BUSY",
  id = "synthetic-event",
): TermiEvent => ({
  id,
  start: at(start),
  end: at(end),
  start_date: null,
  end_date: null,
  all_day: false,
  timezone,
  calendar: { id: "synthetic-calendar", type: "real" },
  availability,
  status: "confirmed",
  recurring: false,
  series_id: null,
});
function input(extra: Partial<Parameters<typeof normalizeDay>[0]> = {}) {
  return {
    day,
    timezone,
    organizationId: "synthetic-org",
    calendarIds: ["synthetic-calendar"],
    work: [work(8, 12), work(13, 17)],
    events: [],
    travel: [],
    complete: true,
    mappingsComplete: true,
    ...extra,
  };
}
const travel = (
  start: number,
  end: number,
  linked: string | null,
): TermiTravel => ({
  id: "synthetic-travel",
  start: at(start),
  end: at(end),
  duration_seconds: (end - start) * 3600,
  related_event: linked ? { id: linked, start: at(9), start_date: null } : null,
});
describe("TermiHub orientation intervals", () => {
  it("preserves a split shift and merges overlapping work without inventing the lunch hour", () => {
    const result = normalizeDay(
      input({ work: [work(8, 11), work(10, 12), work(13, 17)] }),
    );
    expect(result.work).toHaveLength(2);
    expect(result.workMinutes).toBe(480);
    expect(result.budget).toEqual({ minimumMinutes: 480, maximumMinutes: 480 });
  });
  it("subtracts the union of fixed and uncertain occupancy once for each bound", () => {
    const result = normalizeDay(
      input({
        events: [
          event(9, 11),
          event(10, 12, "OUT_OF_OFFICE", "second"),
          event(11, 14, "TENTATIVE", "third"),
          event(13, 15, "UNKNOWN", "fourth"),
        ],
      }),
    );
    expect(result.fixedMinutes).toBe(180);
    expect(result.uncertainMinutes).toBe(120);
    expect(result.budget).toEqual({ minimumMinutes: 180, maximumMinutes: 300 });
  });
  it.each(["FREE", "WORKING_ELSEWHERE"])(
    "does not automatically block %s",
    (availability) => {
      expect(
        normalizeDay(input({ events: [event(8, 17, availability)] })).budget,
      ).toEqual({ minimumMinutes: 480, maximumMinutes: 480 });
    },
  );
  it("clips calendar events to work windows and ignores cancelled occurrences", () => {
    const result = normalizeDay(
      input({
        events: [
          event(6, 9),
          event(12, 13, "BUSY", "lunch"),
          { ...event(14, 16, "BUSY", "cancelled"), status: "cancelled" },
        ],
      }),
    );
    expect(result.fixedMinutes).toBe(60);
    expect(result.budget?.maximumMinutes).toBe(420);
  });
  it("treats a new availability value as uncertainty instead of guaranteed free time", () => {
    const result = normalizeDay(
      input({ events: [event(8, 12, "PROVIDER_NEW_VALUE")] }),
    );
    expect(result.budget).toEqual({ minimumMinutes: 240, maximumMinutes: 480 });
    expect(result.warnings).toContain("availability_unknown");
  });
  it.each(["BUSY", "FREE", "TENTATIVE"])(
    "keeps all-day date boundaries exclusive with availability %s",
    (availability) => {
      const value = {
        ...event(),
        start: null,
        end: null,
        start_date: "2026-10-14",
        end_date: "2026-10-16",
        all_day: true,
        availability,
      };
      const result = normalizeDay(input({ events: [value] }));
      expect(result.budget).toEqual({
        minimumMinutes: availability === "FREE" ? 480 : 0,
        maximumMinutes: availability === "BUSY" ? 0 : 480,
      });
      expect(
        normalizeDay(
          input({
            day: "2026-10-16",
            work: [
              {
                ...work(),
                start: "2026-10-16T08:00:00+02:00",
                end: "2026-10-16T17:00:00+02:00",
              },
            ],
            events: [value],
          }),
        ).fixedMinutes,
      ).toBe(0);
    },
  );
  it("uses actual 23- and 25-hour local days", () => {
    const spring = dayRange("2026-03-29", timezone),
      autumn = dayRange("2026-10-25", timezone);
    expect((spring.end - spring.start) / 3600000).toBe(23);
    expect((autumn.end - autumn.start) / 3600000).toBe(25);
    expect(() => dayRange("2026-02-31", timezone)).toThrow();
    expect(() => dayRange("2011-12-30", "Pacific/Apia")).toThrow();
  });
  it("interprets all-day dates in the source timezone rather than assuming context midnight", () => {
    const value = {
      ...event(),
      start: null,
      end: null,
      start_date: "2026-10-15",
      end_date: "2026-10-16",
      all_day: true,
      timezone: "America/New_York",
    };
    const result = normalizeDay(input({ events: [value] }));
    expect(result.budget).toEqual({ minimumMinutes: 0, maximumMinutes: 0 });
  });
  it("keeps work modes and organizations separate without a physical-location preference", () => {
    const result = normalizeDay(
      input({
        work: [
          work(8, 12),
          { ...work(13, 17), mode: "physical" },
          work(6, 20, "other-employer"),
        ],
      }),
    );
    expect(result.workMinutes).toBe(480);
    expect(result.modes).toEqual(["homeoffice", "physical"]);
  });
  it.each([
    { complete: false },
    { mappingsComplete: false },
    { organizationId: null },
  ])("does not claim a reliable budget from incomplete source %j", (extra) => {
    const result = normalizeDay(input(extra));
    expect(result.budget).toBeNull();
    expect(result.complete).toBe(false);
  });
  it("shows occupancy for private/no-work orientation without treating the rest of the day as free", () => {
    const result = normalizeDay(
      input({
        kind: "private",
        organizationId: null,
        work: [],
        events: [event()],
      }),
    );
    expect(result.fixed).toHaveLength(1);
    expect(result.workMinutes).toBeNull();
    expect(result.budget).toBeNull();
    expect(result.freePossible).toEqual([]);
  });
  it("does not infer no-work intent from an empty result", () => {
    const result = normalizeDay(input({ work: [] }));
    expect(result.budget).toBeNull();
    expect(result.warnings).toContain("no_work_data");
  });
  it("unions linked travel and calendar occupancy, while unassigned overlapping travel remains unreliable", () => {
    const result = normalizeDay(
      input({
        events: [event(9, 11)],
        travel: [travel(8, 10, "synthetic-event")],
      }),
    );
    expect(result.fixedMinutes).toBe(180);
    expect(result.budget?.maximumMinutes).toBe(300);
    const unknown = normalizeDay(input({ travel: [travel(8, 10, null)] }));
    expect(unknown.budget).toBeNull();
    expect(unknown.warnings).toContain("travel_unassigned");
  });
  it("never includes an unmapped foreign calendar or a contradictory identity as reliable", () => {
    const foreign = normalizeDay(
      input({
        events: [
          { ...event(), calendar: { id: "foreign-calendar", type: "virtual" } },
        ],
      }),
    );
    expect(foreign.fixed).toEqual([]);
    expect(foreign.budget).toBeNull();
    const conflict = normalizeDay(
      input({ events: [event(), event(9, 10, "FREE")] }),
    );
    expect(conflict.budget).toBeNull();
    expect(conflict.warnings).toContain("conflicting_event_identity");
  });
  it("does not mutate callers' source intervals", () => {
    const values = [
      { start: 2, end: 5 },
      { start: 1, end: 3 },
    ];
    expect(union(values)).toEqual([{ start: 1, end: 5 }]);
    expect(values).toEqual([
      { start: 2, end: 5 },
      { start: 1, end: 3 },
    ]);
  });
});
