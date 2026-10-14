import { z } from "zod";
export const smokeJobSchema = z.strictObject({ probeId: z.uuid() });
export type SmokeJob = z.infer<typeof smokeJobSchema>;
export const healthSchema = z.strictObject({
  status: z.enum(["ok", "unavailable"]),
  service: z.enum(["web", "worker"]),
  stage: z.literal("E3"),
});
export type Health = z.infer<typeof healthSchema>;
// Domain contracts grow with verified feature slices; no private data in browser exports.
export const contextIdSchema = z.uuid();

export * from "./work";
export * from "./planning";
