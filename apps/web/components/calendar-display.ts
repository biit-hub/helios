import type { CalendarOrientation } from "@helios/contracts";
// Recheck freshness even when the browser cannot obtain a newer server response.
export function calendarDisplay(
  value: CalendarOrientation,
  now: number,
  readFailed: boolean,
): CalendarOrientation {
  if (!value.snapshotId) return value;
  const freshUntil = Date.parse(value.freshUntil ?? ""),
    retrievedAt = Date.parse(value.retrievedAt ?? "");
  if (
    !readFailed &&
    Number.isFinite(freshUntil) &&
    freshUntil > now &&
    Number.isFinite(retrievedAt) &&
    retrievedAt <= now
  )
    return value;
  return {
    ...value,
    state: "stale",
    reliable: false,
    budget: null,
    observedBudget: value.observedBudget ?? value.budget,
    freeCertain: [],
    freePossible: [],
  };
}
