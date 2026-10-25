"use client";
import { Button } from "@helios/ui";
import { useEffect, useRef, type RefObject } from "react";
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
  controllerRef,
  onRequestSave,
}: Readonly<{
  context: ContextView;
  taskId: string;
  snapshot: WorkSnapshot;
  onStateChange?: (state: DocumentUiState) => void;
  onVerified?: () => void;
  sourceControls?: boolean;
  controllerRef?: RefObject<DocumentController | null>;
  onRequestSave?: () => void;
}>) {
  const controller = useTaskDocument(context, taskId),
    { detail, error } = controller;
  useEffect(() => {
    if (controllerRef) controllerRef.current = controller;
  });
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
      uncertain:
        controller.requestUncertain ||
        ["unknown", "partial"].includes(controller.operation?.status ?? ""),
    });
  }, [
    dirty,
    controller.pending,
    controller.busy,
    controller.operation?.status,
    controller.requestUncertain,
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
          onRequestSave={onRequestSave}
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
  onRequestSave,
}: Readonly<{
  controller: DocumentController;
  context: ContextView;
  taskId: string;
  snapshot: WorkSnapshot;
  sourceControls: boolean;
  onRequestSave?: () => void;
}>) {
  const model = {
      ...controller,
      detail: controller.detail!,
      propose: onRequestSave
        ? () => Promise.resolve(onRequestSave())
        : controller.propose,
    } as DocumentModel,
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
          <Button
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
          </Button>
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
      {!onRequestSave && (
        <DocumentPreview model={model} context={context} taskId={taskId} />
      )}
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
