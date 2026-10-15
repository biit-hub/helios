import { z } from "zod";
export const calendarInterval = z.object({
  start: z.iso.datetime(),
  end: z.iso.datetime(),
});
export type CalendarInterval = z.infer<typeof calendarInterval>;
export type CalendarBudget = { minimumMinutes: number; maximumMinutes: number };
export type CalendarDayState =
  | "ready"
  | "no_data"
  | "no_work_confirmed"
  | "unmapped"
  | "unavailable"
  | "incomplete"
  | "stale"
  | "not_connected";
export type CalendarOrientation = {
  snapshotId: string | null;
  revision: number;
  day: string;
  timezone: string;
  retrievedAt: string | null;
  freshUntil: string | null;
  complete: boolean;
  state: CalendarDayState;
  reliable: boolean;
  budget: CalendarBudget | null;
  observedBudget: CalendarBudget | null;
  noWorkConfirmed: boolean;
  decisionRevision: number;
  contextRevision: number;
  work: CalendarInterval[];
  fixed: CalendarInterval[];
  uncertain: CalendarInterval[];
  freeCertain: CalendarInterval[];
  freePossible: CalendarInterval[];
  workMinutes: number | null;
  fixedMinutes: number | null;
  uncertainMinutes: number | null;
  modes: string[];
  warnings: string[];
  basis: string | null;
};
export const calendarMappingInput = z.strictObject({
  revision: z.number().int().nonnegative(),
  calendars: z
    .array(
      z.strictObject({
        calendarId: z.uuid(),
        mode: z.enum(["context", "shared", "excluded"]),
        contextId: z.uuid().nullable(),
      }),
    )
    .max(100),
  contexts: z
    .array(
      z.strictObject({
        contextId: z.uuid(),
        contextRevision: z.number().int().nonnegative(),
        organizationId: z.string().min(1).max(200).nullable(),
      }),
    )
    .max(100),
});
export type CalendarPlanBasis = {
  snapshotId: string | null;
  snapshotRevision: number;
  basis: string | null;
  state: CalendarDayState;
  retrievedAt: string | null;
  budget: CalendarBudget | null;
  workMinutes: number | null;
  fixedMinutes: number | null;
  uncertainMinutes: number | null;
  warnings: string[];
};
export type TermiHubSettings = {
  integrationId: string | null;
  revision: number;
  baseUrl: string;
  enabled: boolean;
  hasToken: boolean;
  keyAvailable: boolean;
  state: string;
  syncing: boolean;
  lastCheckedAt: string | null;
  lastCatalogAt: string | null;
  lastSyncAt: string | null;
  nextAllowedAt: string | null;
  calendars: {
    id: string;
    name: string;
    type: string;
    enabled: boolean;
    available: boolean;
  }[];
  organizations: { id: string; name: string }[];
  mappings: {
    calendarId: string;
    mode: "context" | "shared" | "excluded";
    contextId: string | null;
    verified: boolean;
  }[];
  contexts: {
    id: string;
    name: string;
    revision: number;
    kind: "private" | "employer";
    active: boolean;
    organizationId: string | null;
    instanceMatches: boolean;
  }[];
};

export type CalendarOverview = {
  isToday: boolean;
  day: string;
  timezone: string;
  contexts: {
    contextId: string;
    name: string;
    orientation: CalendarOrientation;
  }[];
};
