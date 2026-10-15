import { z } from "zod";
import { localDay } from "../planning/selection";
export const aiTimezone = (env: NodeJS.ProcessEnv = process.env) => {
  const tz = env.PLAN_TIMEZONE ?? "Europe/Zurich";
  new Intl.DateTimeFormat("en", { timeZone: tz });
  return tz;
};
export function referenceDay(at: Date, timezone: string) {
  return localDay(at, timezone);
}
export function evidenceDates(text: string, day: string) {
  const values = new Set<string>();
  const add = (date: string) => {
    if (z.iso.date().safeParse(date).success) values.add(date);
  };
  for (const m of text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) add(m[0]);
  for (const m of text.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g))
    add(m[3] + "-" + m[2]!.padStart(2, "0") + "-" + m[1]!.padStart(2, "0"));
  for (const m of text.matchAll(
    /(?<![\p{L}])(übermorgen|morgen|heute)(?![\p{L}])/giu,
  )) {
    const before = text.slice(Math.max(0, m.index! - 20), m.index);
    if (/\b(am|nicht|ohne|kein|keinen)\s+(frühen\s+|späten\s+)?$/i.test(before))
      continue;
    const offset =
      m[0].toLowerCase() === "übermorgen"
        ? 2
        : m[0].toLowerCase() === "morgen"
          ? 1
          : 0;
    const d = new Date(day + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + offset);
    add(d.toISOString().slice(0, 10));
  }
  return values;
}
export function dateIsGrounded(
  kind: "due" | "deadline",
  value: string,
  evidence: string,
  day: string,
) {
  const deadline = /Abgabe|Deadline|Frist|spätestens|fällig/i;
  if (
    kind === "deadline" &&
    (!deadline.test(evidence) || /\b(keine?|ohne|nicht)\b/i.test(evidence))
  )
    return false;
  if (
    kind === "due" &&
    deadline.test(evidence) &&
    !/planen|bearbeiten|vorbereiten|erledigen|beginnen|starten/i.test(evidence)
  )
    return false;
  if (
    kind === "due" &&
    z.iso.datetime({ offset: true }).safeParse(value).success
  )
    return evidence.includes(value);
  if (!z.iso.date().safeParse(value).success) return false;
  if (/\bum\s+\d{1,2}|\d{1,2}:\d{2}/i.test(evidence)) return false;
  return evidenceDates(evidence, day).has(value);
}
