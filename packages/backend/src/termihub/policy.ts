import type { CalendarOrientation, CalendarPlanBasis } from "@helios/contracts";
import type { NormalizedDay } from "./intervals";
export const SNAPSHOT_FRESH_MS = 15 * 60 * 1000;
export const SNAPSHOT_RETENTION_MS = 30 * 86400 * 1000;
export type SnapshotSource = {
  id: string;
  revision: number;
  day: string;
  timezone: string;
  retrievedAt: Date;
  freshUntil: Date;
  sourceHash: string;
  data: NormalizedDay;
};
export function emptyOrientation(
  day: string,
  timezone: string,
  state: CalendarOrientation["state"],
): CalendarOrientation {
  return {
    snapshotId: null,
    revision: 0,
    day,
    timezone,
    retrievedAt: null,
    freshUntil: null,
    complete: false,
    state,
    reliable: false,
    budget: null,
    observedBudget: null,
    noWorkConfirmed: false,
    decisionRevision: 0,
    contextRevision: 0,
    work: [],
    fixed: [],
    uncertain: [],
    freeCertain: [],
    freePossible: [],
    workMinutes: null,
    fixedMinutes: null,
    uncertainMinutes: null,
    modes: [],
    warnings: [],
    basis: null,
  };
}
function snapshotState(
  data: NormalizedDay,
  stale: boolean,
  noWorkConfirmed: boolean,
  warnings: string[],
): CalendarOrientation["state"] {
  if (stale) return "stale";
  if (
    warnings.includes("organization_unmapped") ||
    warnings.includes("calendar_mapping_incomplete")
  )
    return "unmapped";
  if (!data.complete) return "incomplete";
  if (data.work.length) return "ready";
  return noWorkConfirmed ? "no_work_confirmed" : "no_data";
}
export function snapshotOrientation(
  snapshot: SnapshotSource,
  connectionReady: boolean,
  noWorkConfirmed: boolean,
  now = new Date(),
): CalendarOrientation {
  if (snapshot.retrievedAt.getTime() <= now.getTime() - SNAPSHOT_RETENTION_MS)
    return emptyOrientation(snapshot.day, snapshot.timezone, "no_data");
  const data = snapshot.data;
  if (data.schemaVersion !== 1)
    return {
      ...emptyOrientation(snapshot.day, snapshot.timezone, "unavailable"),
      warnings: ["snapshot_schema_changed"],
    };
  const stale =
    !connectionReady ||
    snapshot.retrievedAt > now ||
    snapshot.freshUntil <= now;
  const warnings = [...data.warnings];
  const conflict = noWorkConfirmed && data.work.length > 0;
  if (conflict) warnings.push("no_work_decision_conflict");
  const reliable = !stale && data.complete && data.budget !== null && !conflict;
  const state = snapshotState(data, stale, noWorkConfirmed, warnings);
  return {
    snapshotId: snapshot.id,
    revision: snapshot.revision,
    day: snapshot.day,
    timezone: snapshot.timezone,
    retrievedAt: snapshot.retrievedAt.toISOString(),
    freshUntil: snapshot.freshUntil.toISOString(),
    complete: data.complete,
    state,
    reliable,
    budget: reliable ? data.budget : null,
    observedBudget: stale ? data.budget : null,
    noWorkConfirmed,
    decisionRevision: 0,
    contextRevision: 0,
    work: data.work,
    fixed: data.fixed,
    uncertain: data.uncertain,
    freeCertain: reliable ? data.freeCertain : [],
    freePossible: reliable ? data.freePossible : [],
    workMinutes: data.workMinutes,
    fixedMinutes: data.fixedMinutes,
    uncertainMinutes: data.uncertainMinutes,
    modes: data.modes,
    warnings,
    basis: snapshot.sourceHash,
  };
}
export function planCalendarBasis(
  view: CalendarOrientation,
): CalendarPlanBasis {
  return {
    snapshotId: view.snapshotId,
    snapshotRevision: view.revision,
    basis: view.basis,
    state: view.state,
    retrievedAt: view.retrievedAt,
    budget: view.reliable ? view.budget : null,
    workMinutes: view.workMinutes,
    fixedMinutes: view.fixedMinutes,
    uncertainMinutes: view.uncertainMinutes,
    warnings: view.warnings,
  };
}
