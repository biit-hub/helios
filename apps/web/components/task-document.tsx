"use client";
import { useEffect, useRef } from "react";
import { announceTaskChange } from "./task-events";
import { TaskAccordion } from "./task-accordion";
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
export type DocumentUiState = {
  dirty: boolean;
  pending: boolean;
  running?: boolean;
  uncertain?: boolean;
};
export function TaskDocument({
  context,
  taskId,
  snapshot,
  onStateChange,
  onVerified,
  sourceControls = true,
}: Readonly<{
  context: ContextView;
  taskId: string;
  snapshot: WorkSnapshot;
  onStateChange?: (state: DocumentUiState) => void;
  onVerified?: () => void;
  sourceControls?: boolean;
}>) {
  const controller = useTaskDocument(context, taskId),
    { detail, error } = controller;
  const dirty =
    !!detail &&
    (controller.goal !== detail.goal ||
      JSON.stringify(
        controller.items.map(({ text, checked }) => ({ text, checked })),
      ) !== JSON.stringify(detail.checklist) ||
      controller.correction !== detail.correction ||
      !!controller.linkLabel ||
      !!controller.linkUrl ||
      !!controller.newItem);
  useEffect(() => {
    onStateChange?.({
      dirty,
      pending: controller.pending,
      running:
        controller.busy ||
        ["queued", "running"].includes(controller.operation?.status ?? ""),
      uncertain: ["unknown", "partial"].includes(
        controller.operation?.status ?? "",
      ),
    });
  }, [
    dirty,
    controller.pending,
    controller.busy,
    controller.operation?.status,
    onStateChange,
  ]);
  const verifiedRef = useRef(onVerified);
  useEffect(() => {
    verifiedRef.current = onVerified;
  }, [onVerified]);
  const notified = useRef<string | null>(null);
  useEffect(() => {
    if (
      controller.operation?.status === "succeeded" &&
      notified.current !== controller.operation.id
    ) {
      notified.current = controller.operation.id;
      announceTaskChange({ action: "document", contextId: context.id, taskId });
      verifiedRef.current?.();
    }
  }, [
    controller.operation?.id,
    controller.operation?.status,
    context.id,
    taskId,
  ]);
  return (
    <section
      className="task-document"
      aria-label="Ziel, Checkliste und Dokumentenlinks"
    >
      {error && <p role="alert">{error}</p>}
      {!detail && !error && <output>Details werden geladen …</output>}
      {detail && (
        <DocumentBody
          controller={controller}
          context={context}
          taskId={taskId}
          snapshot={snapshot}
          sourceControls={sourceControls}
        />
      )}
    </section>
  );
}
function DocumentBody({
  controller,
  context,
  taskId,
  snapshot,
  sourceControls,
}: Readonly<{
  controller: DocumentController;
  context: ContextView;
  taskId: string;
  snapshot: WorkSnapshot;
  sourceControls: boolean;
}>) {
  const model = { ...controller, detail: controller.detail! } as DocumentModel,
    { detail, pending, setBusy, setError, load } = model;
  return (
    <>
      {sourceControls && (
        <TaskAccordion title="Dokumentquelle">
          <p>
            Quelle: Todoist ·{" "}
            {detail.inspection.task.labels.includes("epic")
              ? "Epic"
              : "Aufgabe"}{" "}
            · {detail.inspection.task.checked ? "nativ abgeschlossen" : "offen"}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (
                !window.confirm(
                  "Dokumenteingaben durch die gespeicherte Quelle ersetzen?",
                )
              )
                return;
              setBusy(true);
              void load()
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Gespeicherte Quelle neu laden (Eingaben ersetzen)
          </button>
        </TaskAccordion>
      )}
      {detail.markdownError && (
        <p role="alert">
          Ziel oder Checkliste ist mehrdeutig. Beschreibung in Todoist prüfen;
          keine automatische Umschreibung.
        </p>
      )}
      <DocumentFields model={model} />
      <DocumentLinks model={model} />
      <DocumentPreview model={model} context={context} taskId={taskId} />
      <TaskAccordion title="Hierarchie und Fortschritt">
        <EpicHierarchy model={model} context={context} taskId={taskId} />
      </TaskAccordion>
      <EpicEnrichment
        model={model}
        context={context}
        taskId={taskId}
        snapshot={snapshot}
      />
    </>
  );
}
