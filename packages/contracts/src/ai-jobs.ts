import { z } from "zod";
import { externalId } from "./work";

export const aiJobOutputs = ["text", "research", "file"] as const;
export const aiJobFormats = ["docx", "xlsx", "csv", "pdf", "md"] as const;
export const aiJobStatuses = [
  "linking",
  "queued",
  "running",
  "awaiting_input",
  "ready",
  "closed",
  "stopped",
  "error",
] as const;
export const aiJobStatusNames: Record<AiJobStatus, string> = {
  linking: "Todoist-Verknüpfung vorbereiten",
  queued: "In Warteschlange",
  running: "In Arbeit",
  awaiting_input: "Wartet auf Input",
  ready: "Erledigt",
  closed: "Abgeschlossen",
  stopped: "Gestoppt",
  error: "Fehler",
};
export const aiJobOutputNames = {
  text: "Text",
  research: "Recherche",
  file: "Datei",
} as const;
export const aiJobFormatNames = {
  docx: "Word (.docx)",
  xlsx: "Excel (.xlsx)",
  csv: "CSV (.csv)",
  pdf: "PDF (.pdf)",
  md: "Markdown (.md)",
} as const;
export type AiJobOutput = (typeof aiJobOutputs)[number];
export type AiJobFormat = (typeof aiJobFormats)[number];
export type AiJobStatus = (typeof aiJobStatuses)[number];
export const aiJobOriginInput = z.strictObject({
  contextId: z.uuid(),
  taskId: externalId,
  basis: z.string().length(64),
});
export const aiJobCreate = z
  .strictObject({
    key: z.uuid(),
    prompt: z
      .string()
      .min(1)
      .max(12000)
      .refine((value) => value.trim().length > 0),
    output: z.enum(aiJobOutputs),
    format: z.enum(aiJobFormats).nullable().default(null),
    origin: aiJobOriginInput.nullable().default(null),
  })
  .refine(
    (v) => (v.output === "file" ? v.format !== null : v.format === null),
    { message: "Genau ein Dateiformat ausschliesslich für Datei wählen." },
  );
export const aiJobSettingSave = z
  .strictObject({
    key: z.uuid(),
    output: z.enum(aiJobOutputs),
    revision: z.number().int().nonnegative(),
    enabled: z.boolean(),
    model: z.string().min(1).max(151).nullable(),
  })
  .refine((v) => !v.enabled || v.model !== null, {
    message: "Eine aktive Ausgabe benötigt ein Modell.",
  });
export const aiJobQueueCommand = z.strictObject({
  key: z.uuid(),
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
});
export type AiJobCreate = z.infer<typeof aiJobCreate>;
export type AiJobSettingSave = z.infer<typeof aiJobSettingSave>;
export type AiJobQueueCommand = z.infer<typeof aiJobQueueCommand>;

export type AiJobModel = {
  name: string;
  digest: string;
  size: number;
  local: boolean;
  available: boolean;
  reason: string | null;
};
export type AiJobSetting = {
  output: AiJobOutput;
  enabled: boolean;
  model: string | null;
  revision: number;
  available: boolean;
  reason: string | null;
};
export type AiJobSettings = {
  models: AiJobModel[];
  outputs: AiJobSetting[];
  connected: boolean;
  code: string | null;
};
export type AiJobReference = {
  contextId: string;
  taskId: string;
  title: string;
  childId: string | null;
  state: "pending" | "verified" | "unknown" | "error" | "closing" | "closed";
  operationId: string;
  closeOperationId: string | null;
};
export type AiJobTurn = {
  id: string;
  kind: "prompt" | "question" | "answer" | "refinement";
  text: string;
  questionId: string | null;
  createdAt: string;
};
export type AiJobArtifact = {
  id: string;
  format: AiJobFormat;
  filename: string;
  mime: string;
  size: number;
  sha256: string;
};
export type AiJobResult = {
  id: string;
  version: number;
  text: string;
  createdAt: string;
  artifact: AiJobArtifact | null;
  sources: { title: string; url: string; retrievedAt: string }[];
  uncertainties: string[];
};
export type AiJobEvent = {
  key?: string;
  id: string;
  kind: string;
  revision: number;
  createdAt: string;
  data: Record<string, unknown>;
};
export type AiJobAttempt = {
  id: string;
  number: number;
  status: string;
  model: string;
  digest: string;
  startedAt: string;
  finishedAt: string | null;
  code: string | null;
  parameters: Record<string, unknown>;
};
export type AiJobListItem = {
  id: string;
  prompt: string;
  result: string;
  status: AiJobStatus;
  revision: number;
  output: AiJobOutput;
  format: AiJobFormat | null;
  model: string;
  createdAt: string;
  updatedAt: string;
  queuePosition: number | null;
  prioritized: boolean;
  code: string | null;
  reference: AiJobReference | null;
};
export type AiJobDetail = AiJobListItem & {
  originalPrompt: string;
  digest: string;
  turns: AiJobTurn[];
  results: AiJobResult[];
  events: AiJobEvent[];
  attempts: AiJobAttempt[];
};
export type AiJobList = {
  jobs: AiJobListItem[];
  total: number;
  page: number;
  pageSize: number;
};
export const aiJobErrorMessages: Record<string, string> = {
  AI_JOB_INVALID_OUTPUT:
    "Die lokale KI-Antwort entspricht nicht dem erlaubten Ausgabeformat. Kein Ergebnis wurde übernommen.",
  AI_JOB_INPUT_LIMIT:
    "Der Auftrag oder sein Verlauf überschreitet die sichere Verarbeitungsgrenze. Bitte einen kleineren Folgeauftrag erstellen.",
  AI_JOB_INTERRUPTED:
    "Der Modelllauf wurde unterbrochen oder nicht rechtzeitig bestätigt. Ein neuer Versuch benötigt deine bewusste Entscheidung.",
  AI_JOB_RESEARCH_UNAVAILABLE:
    "Der kontrollierte Suchdienst oder ausreichende lesbare Internetquellen sind nicht verfügbar. Es wurde keine aktuelle Recherche behauptet.",
  AI_JOB_RESEARCH_BLOCKED:
    "Diese Webadresse ist für den kontrollierten Recherchezugriff nicht zugelassen.",
  AI_JOB_RESEARCH_LIMIT:
    "Die Recherchequelle überschreitet die zulässige Datenmenge.",
  AI_JOB_FILE_LIMIT:
    "Die erzeugte Datei überschreitet die zulässige Grösse oder Seitenzahl.",
  AI_JOB_FILE_CHARACTERS:
    "Die PDF-Schrift unterstützt einzelne Zeichen nicht. Bitte die Ausgabe mit passenden Zeichen nachbearbeiten lassen oder ein anderes Format als neuen Auftrag wählen.",
  AI_JOB_CLOSE_UNCONFIRMED:
    "Der Auftrag ist lokal abgeschlossen. Der Abschluss seiner Todoist-Unteraufgabe ist noch nicht bestätigt. Operationsjournal prüfen.",
  AI_JOB_DELETE_BLOCKED:
    "Ein laufender oder wartender Auftrag beziehungsweise eine aktive Todoist-Operation kann noch nicht gelöscht werden. Wartende Aufträge zuerst stoppen; ungeklärte Vorgänge prüfen.",
  AI_JOB_UNAVAILABLE:
    "Die lokale KI-Auftragsverwaltung ist vorübergehend nicht erreichbar.",
  AI_JOB_MODEL_UNAVAILABLE:
    "Das gewählte lokale Modell ist nicht verfügbar. Modellliste und Ollama-Verbindung prüfen.",
  AI_JOB_LOCAL_MODEL_REQUIRED:
    "Das Modell konnte nicht als installiertes lokales Textmodell nachgewiesen werden. Cloud- und reine Einbettungsmodelle sind nicht zugelassen.",
  AI_JOB_TYPE_DISABLED:
    "Diese Ausgabe-Art ist deaktiviert oder hat kein gültiges lokales Modell. Einstellungen → KI-Delegation prüfen.",
  AI_JOB_CONFIG_CHANGED:
    "Die Modellkonfiguration wurde geändert. Bitte aktuelle Einstellungen laden; Eingaben bleiben erhalten.",
  AI_JOB_CONFLICT:
    "Der Auftrag wurde inzwischen geändert. Aktuellen Stand laden; deine Eingaben bleiben erhalten.",
  AI_JOB_NOT_FOUND: "Der KI-Auftrag ist nicht verfügbar.",
  AI_JOB_NOT_QUEUED:
    "Nur noch wartende Aufträge können priorisiert oder gestoppt werden. Laufende Arbeit wird nicht unterbrochen.",
  AI_JOB_REFERENCE_ONLY:
    "Diese Todoist-Unteraufgabe ist bereits eine KI-Auftragsreferenz. Den zugehörigen KI-Auftrag öffnen.",
  AI_JOB_REFERENCE_UNCONFIRMED:
    "Die Todoist-Verknüpfung ist nicht vollständig nachgewiesen. Journal und Quelle prüfen; nicht erneut anlegen.",
  AI_JOB_ORIGIN_CHANGED:
    "Die Ursprungsaufgabe wurde geändert oder ist nicht mehr im berechtigten Kontext. Keine automatische Änderung der Originalaufgabe.",
  AI_JOB_LIMIT:
    "Es warten bereits zu viele KI-Aufträge. Bestehende Aufträge zuerst bearbeiten oder bewusst stoppen.",
};
