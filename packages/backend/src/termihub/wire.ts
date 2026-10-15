import { z } from "zod";

const id = z.string().min(1).max(200);
const instant = z.iso.datetime({ offset: true });
const date = z.iso.date();
const zone = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  });
const interval = { id, start: instant, end: instant };
export const calendarSchema = z.object({
  id,
  name: z.string().max(500),
  type: z.string().max(100),
  color: z.string().max(100),
  enabled: z.boolean(),
  visible: z.boolean(),
});
export const eventSchema = z
  .object({
    id,
    start: instant.nullable(),
    end: instant.nullable(),
    start_date: date.nullable(),
    end_date: date.nullable(),
    all_day: z.boolean(),
    timezone: zone,
    calendar: z.object({ id, type: z.string().max(100) }),
    availability: z.string().max(100),
    status: z.string().max(100),
    recurring: z.boolean(),
    series_id: id.nullable(),
  })
  .refine((v) =>
    v.all_day
      ? v.start === null &&
        v.end === null &&
        v.start_date !== null &&
        v.end_date !== null &&
        v.start_date < v.end_date
      : v.start !== null &&
        v.end !== null &&
        Date.parse(v.start) < Date.parse(v.end),
  );
export const workSchema = z
  .object({
    ...interval,
    mode: z.string().max(100),
    organization: z.object({ id, name: z.string().max(500) }),
    recurring: z.boolean(),
    segment: z.boolean(),
  })
  .refine((v) => Date.parse(v.start) < Date.parse(v.end));
export const travelSchema = z
  .object({
    ...interval,
    duration_seconds: z.number().int().nonnegative(),
    related_event: z
      .object({ id, start: instant.nullable(), start_date: date.nullable() })
      .nullable(),
  })
  .refine(
    (v) =>
      Date.parse(v.start) < Date.parse(v.end) &&
      Math.floor((Date.parse(v.end) - Date.parse(v.start)) / 1000) ===
        v.duration_seconds,
  );
export const metaSchema = z.object({
  count: z.number().int().nonnegative(),
  timezone: zone,
});
export function envelope<T extends z.ZodType>(schema: T) {
  return z
    .object({ data: z.array(schema).max(10000), meta: metaSchema })
    .refine((v) => v.meta.count === v.data.length);
}
export type TermiCalendar = z.infer<typeof calendarSchema>;
export type TermiEvent = z.infer<typeof eventSchema>;
export type TermiWork = z.infer<typeof workSchema>;
export type TermiTravel = z.infer<typeof travelSchema>;
