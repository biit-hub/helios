import { z } from "zod";
export const themes = {
  copper: "Kupfer",
  blue: "Meerblau",
  green: "Waldgrün",
  plum: "Pflaume",
  clay: "Terrakotta",
  gold: "Gold",
} as const;
export const themeSchema = z.enum([
  "copper",
  "blue",
  "green",
  "plum",
  "clay",
  "gold",
]);
export const externalId = z.string().min(1).max(200);
export const contextInput = z.strictObject({
  id: z.uuid().optional(),
  revision: z.number().int().nonnegative(),
  name: z.string().trim().min(1).max(100),
  theme: themeSchema,
  active: z.boolean(),
  projectId: externalId.nullable(),
  termihubEmployerId: z.string().trim().max(120).nullable(),
  termihubInstanceRef: z.string().trim().max(200).nullable(),
});
export type ContextInput = z.infer<typeof contextInput>;
export const todoistTaskSchema = z.object({
  id: externalId,
  project_id: externalId,
  parent_id: externalId.nullable(),
  section_id: externalId.nullable(),
  content: z.string().max(20000),
  description: z.string().max(100000),
  priority: z.number().int().min(1).max(4),
  checked: z.boolean(),
  is_deleted: z.boolean(),
  labels: z.array(z.string()).max(1000),
  due: z
    .object({
      date: z.string(),
      datetime: z.string().nullable().optional(),
      timezone: z.string().nullable().optional(),
      is_recurring: z.boolean().optional(),
      string: z.string().optional(),
      lang: z.string().optional(),
    })
    .nullable(),
  deadline: z.object({ date: z.string() }).nullable(),
  duration: z
    .object({ amount: z.number(), unit: z.string() })
    .nullable()
    .optional(),
  updated_at: z.string().nullable().optional(),
  added_at: z.string().max(100).nullable().optional(),
});
export type TodoistTask = z.infer<typeof todoistTaskSchema>;
export const problemMessages = {
  worker_unavailable:
    "Der zuletzt bekannte Worker meldet sich nicht mehr. Offene Operationen und Workerbetrieb prüfen.",
  auth_recovery:
    "Ein Wiederherstellungsverfahren wurde benutzt. Sicherheitsstatus und Wiederherstellungscodes bewusst prüfen.",
  ai_failed:
    "Eine lokale KI-Analyse ist fehlgeschlagen. Originaleingabe und Entwurf bleiben erhalten; Entwurfsstatus prüfen.",
  task_operation_failed:
    "Eine Aufgabenänderung ist fehlgeschlagen oder ungeklärt. Den Operationsstand in der Aufgabenverwaltung prüfen.",
  plan_operation_failed:
    "Eine Tagesplanbestätigung ist teilweise oder ungeklärt. Den Operationsstand im Tagesplan prüfen.",
  task_unavailable:
    "Die Aufgabe ist nicht mehr zugänglich. Ihr externer Zustand ist unbekannt.",
  key_unavailable:
    "Der Integrationsschlüssel fehlt oder passt nicht zum gespeicherten Token.",
  auth_error: "Todoist hat den API-Token abgewiesen.",
  network: "Todoist ist momentan nicht erreichbar.",
  timeout: "Todoist hat nicht rechtzeitig geantwortet.",
  rate_limit: "Todoist begrenzt die Abrufe. Bitte die Wartezeit beachten.",
  unexpected: "Todoist hat eine unerwartete Antwort geliefert.",
  project_missing: "Das zugeordnete Projekt ist nicht mehr zugänglich.",
  invalid_mapping: "Die Projektzuordnung muss geprüft werden.",
  sync_failed: "Die Aktualisierung ist fehlgeschlagen.",
  stale_cache: "Der gespeicherte Aufgabenstand ist veraltet.",
  not_connected: "Todoist ist nicht verbunden.",
} as const;
export type ProblemCode = keyof typeof problemMessages;
export type ContextView = {
  id: string;
  name: string;
  kind: "private" | "employer";
  theme: keyof typeof themes;
  active: boolean;
  projectId: string | null;
  revision: number;
  termihubEmployerId: string | null;
  termihubInstanceRef: string | null;
  configured: boolean;
  lastSyncAt: string | null;
};
export type WorkSnapshot = {
  contexts: ContextView[];
  integration: {
    revision: number;
    enabled: boolean;
    hasToken: boolean;
    keyAvailable: boolean;
    state: string;
    lastCheckedAt: string | null;
    lastCatalogAt: string | null;
    nextAllowedAt: string | null;
  };
  projects: {
    id: string;
    name: string;
    inbox: boolean;
    available: boolean;
    assignedTo: string | null;
  }[];
  problems: {
    id: string;
    code: ProblemCode;
    contextId: string | null;
    status: "open" | "checked" | "resolved";
    occurrences: number;
    lastSeenAt: string;
    revision: number;
  }[];
};
export type TaskView = {
  waiting?: { who: string; subject: string; followUp: string | null } | null;
  data: TodoistTask;
  state: "active" | "completed" | "deleted" | "unknown";
  sectionName: string | null;
  retrievedAt: string;
};
export type TaskList = {
  tasks: TaskView[];
  lastSyncAt: string | null;
  stale: boolean;
  configured: boolean;
  connected: boolean;
};
export type CommentView = {
  id: string;
  content: string;
  posted_at: string | null;
};
