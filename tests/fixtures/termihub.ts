import { randomUUID } from "node:crypto";
import type { TermiHubTransport } from "../../packages/backend/src/termihub/transport";
export function termihubFixture(day: string) {
  const calendarId = randomUUID(),
    organizationId = randomUUID();
  const calls: string[] = [];
  let beforeRead: ((path: string) => Promise<void>) | undefined;
  const data: Record<string, unknown[]> = {
    calendars: [
      {
        id: calendarId,
        name: "Synthetic calendar",
        type: "real",
        color: "#123456",
        enabled: true,
        visible: true,
      },
    ],
    "work-locations": [
      {
        id: "work-1",
        start: `${day}T08:00:00+02:00`,
        end: `${day}T17:00:00+02:00`,
        mode: "HOME_OFFICE",
        organization: { id: organizationId, name: "Synthetic organization" },
        recurring: false,
        segment: false,
      },
    ],
    events: [
      {
        id: "event-1",
        start: `${day}T09:00:00+02:00`,
        end: `${day}T10:00:00+02:00`,
        start_date: null,
        end_date: null,
        all_day: false,
        timezone: "Europe/Zurich",
        calendar: { id: calendarId, type: "real" },
        availability: "BUSY",
        status: "confirmed",
        recurring: false,
        series_id: null,
        title: "PRIVATE_EVENT_TITLE",
        description: "PRIVATE_EVENT_DESCRIPTION",
        participants: ["private@example.invalid"],
      },
    ],
    travel: [],
  };
  const transport: TermiHubTransport = async (_base, path, _query, token) => {
    if (token !== "synthetic-termihub-only")
      throw new Error("wrong credential type");
    calls.push(path);
    await beforeRead?.(path);
    const result = data[path];
    if (!result) throw new Error("unexpected external path");
    return structuredClone({
      data: result,
      meta: { count: result.length, timezone: "Europe/Zurich" },
    });
  };
  return {
    calendarId,
    organizationId,
    calls,
    data,
    transport,
    beforeRead(fn?: typeof beforeRead) {
      beforeRead = fn;
    },
  };
}
