"use client";
import type { ContextView, WorkSnapshot } from "@helios/contracts";
import {
  useTaskDocument,
  type DocumentController,
  type DocumentModel,
} from "./use-task-document";
import { DocumentFields } from "./document-fields";
import { DocumentLinks } from "./document-links";
import { DocumentPreview } from "./document-preview";
import { EpicHierarchy } from "./epic-hierarchy";
import { EpicEnrichment } from "./epic-enrichment";
export function TaskDocument({
  context,
  taskId,
  snapshot,
}: {
  context: ContextView;
  taskId: string;
  snapshot: WorkSnapshot;
}) {
  const controller = useTaskDocument(context, taskId),
    { detail, error } = controller;
  return (
    <details className="card task-document">
      <summary>Ziel, Checkliste und Dokumentenlinks</summary>
      {error && <p role="alert">{error}</p>}
      {!detail && !error && <p role="status">Details werden geladen …</p>}
      {detail && (
        <DocumentBody
          controller={controller}
          context={context}
          taskId={taskId}
          snapshot={snapshot}
        />
      )}
    </details>
  );
}
function DocumentBody({
  controller,
  context,
  taskId,
  snapshot,
}: {
  controller: DocumentController;
  context: ContextView;
  taskId: string;
  snapshot: WorkSnapshot;
}) {
  const model = { ...controller, detail: controller.detail! } as DocumentModel,
    { detail, pending, setBusy, setError, load } = model;
  return (
    <>
      <p>
        Quelle: Todoist ·{" "}
        {detail.inspection.task.labels.includes("epic") ? "Epic" : "Aufgabe"} ·{" "}
        {detail.inspection.task.checked ? "nativ abgeschlossen" : "offen"}
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setBusy(true);
          void load()
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        Gespeicherte Quelle neu laden (Eingaben ersetzen)
      </button>
      {detail.markdownError && (
        <p role="alert">
          Ziel oder Checkliste ist mehrdeutig. Beschreibung in Todoist prüfen;
          keine automatische Umschreibung.
        </p>
      )}
      <DocumentFields model={model} />
      <DocumentLinks model={model} />
      <DocumentPreview model={model} context={context} taskId={taskId} />
      <EpicHierarchy model={model} context={context} taskId={taskId} />
      <EpicEnrichment
        model={model}
        context={context}
        taskId={taskId}
        snapshot={snapshot}
      />
    </>
  );
}
