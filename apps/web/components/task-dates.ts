import type { TodoistTask } from "@helios/contracts";
const defaultZone = "Europe/Zurich";
function parts(at: Date, zone: string) {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => values.find((p) => p.type === type)!.value;
  return {
    date: get("year") + "-" + get("month") + "-" + get("day"),
    time: get("hour") + ":" + get("minute"),
  };
}
export function headerDate(at = new Date()) {
  const date = parts(at, defaultZone).date;
  return date.slice(8, 10) + "." + date.slice(5, 7) + "." + date.slice(0, 4);
}
export function taskDateInputs(
  due: TodoistTask["due"],
  timezone = defaultZone,
) {
  const source = due?.datetime ?? due?.date ?? "";
  if (!source) return { date: "", time: "" };
  if (/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(source))
    return parts(new Date(source), timezone);
  return {
    date: source.slice(0, 10),
    time: source.includes("T") ? source.slice(11, 16) : "",
  };
}
export function taskDateTime(
  date: string,
  time: string,
  timezone = defaultZone,
) {
  const wall = Date.parse(date + "T" + time + ":00Z");
  if (!Number.isFinite(wall))
    throw new Error("Datum oder Uhrzeit ist ungültig.");
  const candidates = new Set<number>();
  for (const delta of [-86400000, 0, 86400000]) {
    const probe = wall + delta;
    const local = parts(new Date(probe), timezone);
    const offset = Date.parse(local.date + "T" + local.time + ":00Z") - probe;
    candidates.add(wall - offset);
  }
  const matching = [...candidates].filter((value) => {
    const local = parts(new Date(value), timezone);
    return local.date === date && local.time === time;
  });
  if (matching.length !== 1)
    throw new Error(
      matching.length
        ? "Diese Uhrzeit kommt bei der Zeitumstellung zweimal vor. Bitte eine eindeutige Uhrzeit wählen."
        : "Diese Uhrzeit existiert wegen der Zeitumstellung nicht. Bitte eine andere Uhrzeit wählen.",
    );
  return new Date(matching[0]!).toISOString();
}

export function dateLabel(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? day.slice(8, 10) + "." + day.slice(5, 7) + "." + day.slice(0, 4)
    : day;
}
export function taskDateLabel(due: TodoistTask["due"], timezone = defaultZone) {
  const value = taskDateInputs(due, timezone);
  return value.date
    ? dateLabel(value.date) + (value.time ? " · " + value.time : "")
    : "Nicht gesetzt";
}
