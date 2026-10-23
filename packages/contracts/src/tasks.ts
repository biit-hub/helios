import { z } from "zod";
import { externalId, todoistTaskSchema } from "./work";
const date = z.iso.date();
export const taskFields = z.strictObject({
  content: z.string().trim().min(1).max(500),
  description: z.string().max(12000).optional(),
  priority: z.number().int().min(1).max(4).optional(),
  labels: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  due: z
    .union([date, z.iso.datetime({ offset: true })])
    .nullable()
    .optional(),
  deadline: date.nullable().optional(),
  duration: z.number().int().min(1).max(14400).nullable().optional(),
  recurring: z.string().trim().min(1).max(200).optional(),
});
export const taskPatch = taskFields.partial();
export const waitingInput = z.strictObject({
  who: z.string().trim().min(1).max(300),
  subject: z.string().trim().min(1).max(1000),
  followUp: date.nullable(),
});
export const documentChange = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("goal"), value: z.string().max(6000) }),
  z.strictObject({
    kind: z.literal("checklist"),
    items: z
      .array(
        z.strictObject({
          text: z.string().trim().min(1).max(500),
          checked: z.boolean(),
        }),
      )
      .max(100),
  }),
  z.strictObject({
    kind: z.literal("link-add"),
    label: z.string().trim().min(1).max(300),
    url: z.string().min(1).max(2000),
  }),
  z.strictObject({
    kind: z.literal("link-edit"),
    target: z.string().min(1).max(2000),
    label: z.string().trim().min(1).max(300),
    url: z.string().min(1).max(2000),
  }),
]);
export type DocumentChange = z.infer<typeof documentChange>;
export const kanbanSections = [
  "Offen",
  "In Arbeit",
  "Wartet",
  "Abgeschlossen",
] as const;
export type KanbanInspection = {
  projectId: string;
  contextRevision: number;
  present: string[];
  missing: (typeof kanbanSections)[number][];
  ambiguous: string[];
};
export const taskCommand = z.strictObject({
  key: z.uuid(),
  action: z.enum([
    "create",
    "update",
    "move",
    "comment",
    "wait",
    "close",
    "delete",
    "sections",
    "plan-select",
    "document",
  ]),
  contextId: z.uuid().nullable(),
  taskId: externalId.optional(),
  basis: z.string().length(64).optional(),
  projectId: externalId.nullable().optional(),
  sectionSetup: z
    .strictObject({
      projectId: externalId,
      contextRevision: z.number().int().nonnegative(),
      missing: z.array(z.enum(kanbanSections)).min(1).max(4),
    })
    .optional(),
  sectionId: externalId.nullable().optional(),
  parentId: externalId.nullable().optional(),
  fields: taskPatch.optional(),
  document: documentChange.optional(),
  epicClosePolicy: z.literal("detach").optional(),
  comment: z.string().trim().min(1).max(12000).optional(),
  waiting: waitingInput.optional(),
  acknowledgeHierarchy: z.boolean().default(false),
  acknowledgeDestructive: z.boolean().default(false),
  acknowledgeRecurrenceChange: z.boolean().default(false),
});
export type TaskCommand = z.infer<typeof taskCommand>;
export type TaskFields = z.infer<typeof taskFields>;
export type WaitingDetails = z.infer<typeof waitingInput>;
export type TaskInspection = {
  links: { url: string; label: string }[];
  task: z.infer<typeof todoistTaskSchema>;
  basis: string;
  children: { id: string; content: string; parentId?: string | null }[];
  sections: { id: string; name: string; project_id: string }[];
  comments: { id: string; content: string; posted_at: string | null }[];
  waiting: WaitingDetails | null;
};
export type TaskOperationView = {
  input?: TaskCommand;
  id: string;
  status: string;
  code: string | null;
  retryAt: string | null;
  result: Record<string, unknown> | null;
};
