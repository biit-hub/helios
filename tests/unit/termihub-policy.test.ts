import { describe, expect, it } from "vitest";
import {
  planCalendarBasis,
  snapshotOrientation,
  SNAPSHOT_FRESH_MS,
  SNAPSHOT_RETENTION_MS,
} from "../../packages/backend/src/termihub/policy";
import { normalizeDay } from "../../packages/backend/src/termihub/intervals";
const now = new Date("2026-10-15T06:00:00Z");
const data = normalizeDay({
  day: "2026-10-15",
  timezone: "Europe/Zurich",
  organizationId: "synthetic-org",
  calendarIds: [],
  work: [
    {
      id: "synthetic-work",
      start: "2026-10-15T08:00:00+02:00",
      end: "2026-10-15T12:00:00+02:00",
      organization: { id: "synthetic-org", name: "Synthetic employer" },
      mode: "homeoffice",
      recurring: false,
      segment: true,
    },
  ],
  events: [],
  travel: [],
  complete: true,
  mappingsComplete: true,
});
const source = {
  id: "synthetic-snapshot",
  revision: 1,
  day: "2026-10-15",
  timezone: "Europe/Zurich",
  sourceHash: "synthetic-basis",
  data,
  retrievedAt: now,
  freshUntil: new Date(now.getTime() + SNAPSHOT_FRESH_MS),
};
describe("snapshot freshness and planning authority", () => {
  it("uses the exact 15-minute freshness boundary", () => {
    const fresh = snapshotOrientation(
      source,
      true,
      false,
      new Date(source.freshUntil.getTime() - 1),
    );
    expect(fresh.reliable).toBe(true);
    expect(fresh.budget?.minimumMinutes).toBe(240);
    const stale = snapshotOrientation(source, true, false, source.freshUntil);
    expect(stale.state).toBe("stale");
    expect(stale.reliable).toBe(false);
    expect(stale.budget).toBeNull();
    expect(stale.observedBudget?.minimumMinutes).toBe(240);
    expect(stale.work).toHaveLength(1);
    expect(stale.freeCertain).toEqual([]);
    expect(stale.freePossible).toEqual([]);
    expect(planCalendarBasis(stale).budget).toBeNull();
  });
  it("keeps a failed refresh visibly stale even before nominal expiry", () => {
    const stale = snapshotOrientation(source, false, false, now);
    expect(stale.state).toBe("stale");
    expect(stale.budget).toBeNull();
    expect(stale.observedBudget?.maximumMinutes).toBe(240);
  });
  it("does not expose expired snapshots while waiting for a cleanup batch", () => {
    const expired = snapshotOrientation(
      source,
      true,
      false,
      new Date(now.getTime() + SNAPSHOT_RETENTION_MS),
    );
    expect(expired.state).toBe("no_data");
    expect(expired.snapshotId).toBeNull();
    expect(expired.observedBudget).toBeNull();
    expect(expired.work).toEqual([]);
  });
  it("distinguishes explicitly no work from missing work data", () => {
    const empty = {
      ...source,
      data: { ...data, work: [], budget: null, workMinutes: null },
    };
    expect(snapshotOrientation(empty, true, false, now).state).toBe("no_data");
    expect(snapshotOrientation(empty, true, true, now).state).toBe(
      "no_work_confirmed",
    );
    const conflict = snapshotOrientation(source, true, true, now);
    expect(conflict.warnings).toContain("no_work_decision_conflict");
    expect(conflict.budget).toBeNull();
  });
  it("never makes incomplete inputs authoritative and stores only aggregate plan evidence", () => {
    const partial = snapshotOrientation(
      { ...source, data: { ...data, complete: false, budget: null } },
      true,
      false,
      now,
    );
    expect(partial.state).toBe("incomplete");
    expect(planCalendarBasis(partial).budget).toBeNull();
    const basis = planCalendarBasis(
      snapshotOrientation(source, true, false, now),
    );
    expect(basis).not.toHaveProperty("work");
    expect(basis).not.toHaveProperty("description");
    expect(basis.snapshotId).toBe(source.id);
  });
});
