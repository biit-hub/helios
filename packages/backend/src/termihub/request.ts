import { z } from "zod";
export const syncRequestSchema = z
  .strictObject({
    id: z.uuid(),
    kind: z.enum(["manual", "scheduled"]),
    sessionId: z.string().min(1).nullable(),
    day: z.iso.date(),
    timezone: z.string().min(1).max(100),
    createdAt: z.iso.datetime(),
    attempts: z.number().int().min(0).max(3),
    credentialVersion: z.uuid(),
    integrationRevision: z.number().int().nonnegative(),
  })
  .refine((v) =>
    v.kind === "manual" ? v.sessionId !== null : v.sessionId === null,
  );
export type TermiHubSyncRequest = z.infer<typeof syncRequestSchema>;
