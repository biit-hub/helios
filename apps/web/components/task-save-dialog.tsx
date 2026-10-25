"use client";
import { ActionButton, Button, Icon } from "@helios/ui";

import type {
  DocumentChange,
  TaskOperationView,
  TaskSavePreview,
} from "@helios/contracts";
import { UiDialog } from "./ui-help";
import { TaskAccordion } from "./task-accordion";
import { TaskOperationEvidence } from "./task-operation-evidence";

const fieldNames: Record<string, string> = {
  content: "Titel",
  description: "Beschreibung",
  priority: "Priorität",
  labels: "Labels",
  due: "Geplantes Datum / Uhrzeit",
  deadline: "Deadline",
  duration: "Dauer",
  recurring: "Wiederholung",
};
function display(value: unknown): string {
  if (value === null || value === undefined || value === "")
    return "Nicht gesetzt";
  if (Array.isArray(value)) return value.map(display).join(", ") || "Keine";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return String(value);
  return "Unbekannter Wert";
}
function fieldValue(key: string, value: unknown) {
  if (key === "description") return "Text geändert";
  if (key === "priority") return "P" + (5 - Number(value));
  if (key === "duration" && typeof value === "number")
    return value + " Minuten";
  return display(value);
}
function documentLabel(change: DocumentChange) {
  if (change.kind === "goal") return "Ziel";
  if (change.kind === "checklist")
    return "Checkliste (" + change.items.length + ")";
  return "Dokumentenlink: " + change.label;
}
export function TaskSaveDialog({
  preview,
  documents,
  pending,
  processing,
  error,
  operation,
  close,
  confirm,
  checkJournal,
}: Readonly<{
  preview: TaskSavePreview;
  documents: DocumentChange[];
  pending: boolean;
  processing: boolean;
  error: string;
  operation: TaskOperationView | null;
  close: () => void;
  confirm: () => void;
  checkJournal?: () => void;
}>) {
  return (
    <UiDialog
      title="Änderungen speichern"
      busy={processing}
      close={close}
      showCloseButton={false}
    >
      <p>Diese Änderungen werden gemeinsam in Todoist gespeichert.</p>
      <ul className="task-save-changes">
        {Object.entries(preview.fields).map(([key, value]) => (
          <li key={key}>
            <strong>{fieldNames[key] ?? key}:</strong> {fieldValue(key, value)}
          </li>
        ))}
        {documents.map((change) => (
          <li key={change.kind + ":" + ("url" in change ? change.url : "")}>
            <strong>{documentLabel(change)}</strong>
          </li>
        ))}
      </ul>
      <TaskAccordion title="Vorher / Nachher ansehen">
        <h3>Vorher</h3>
        <pre>{preview.before.description || "Keine Beschreibung"}</pre>
        <h3>Nachher</h3>
        <pre>{preview.fields.description ?? preview.before.description}</pre>
        <p className="help">
          Bei geänderter Quelle wird das Speichern abgewiesen. Erfolg gilt erst
          nach dem externen Nachweis aller Felder.
        </p>
      </TaskAccordion>
      {error && <p role="alert">{error}</p>}
      {operation && <TaskOperationEvidence operation={operation} />}
      {checkJournal && (
        <ActionButton
          busy={processing}
          loadingText="Vorgang wird verarbeitet …"
          type="button"
          className="secondary"
          disabled={processing}
          onClick={checkJournal}
        >
          Schreibauftrag im Journal prüfen
        </ActionButton>
      )}
      <div className="task-action-buttons">
        <Button
          type="button"
          className="secondary"
          disabled={processing}
          onClick={close}
        >
          <Icon name="close" />
          Zurück zur Aufgabe
        </Button>
        <ActionButton
          busy={processing}
          loadingText="Änderungen werden gespeichert …"
          type="button"
          disabled={pending}
          onClick={confirm}
        >
          <Icon name="save" />
          {processing ? "Wird nachgewiesen …" : "Änderungen speichern"}
        </ActionButton>
      </div>
    </UiDialog>
  );
}
