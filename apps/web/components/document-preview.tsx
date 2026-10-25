"use client";
import { ActionButton, Button } from "@helios/ui";

import { useRef } from "react";
import { UiDialog } from "./ui-help";
import { TaskAccordion } from "./task-accordion";
import { TaskOperationEvidence } from "./task-operation-evidence";
import type { DocumentModel } from "./use-task-document";
import type { ContextView, TaskOperationView } from "@helios/contracts";
import { EpicRequestFailure, epicRequest as request } from "./epic-http";

export function DocumentPreview({
  model,
  context,
  taskId,
}: Readonly<{ model: DocumentModel; context: ContextView; taskId: string }>) {
  const { setError, setBusy, preview, operation, setOperation, key, pending } =
    model;
  const submitting = useRef(false);
  async function confirm() {
    if (!preview || pending || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await request("/api/tasks/submit", {
        key: key.current,
        action: "document",
        contextId: context.id,
        taskId,
        basis: preview.basis,
        document: preview.change,
      });
      if (typeof result?.operationId !== "string" || !result.operationId.trim())
        throw new EpicRequestFailure(
          "Auftragsantwort nicht sicher auswertbar. Bitte das Journal prüfen.",
        );
      setOperation({
        id: result.operationId,
        status: "queued",
        code: null,
        result: null,
        retryAt: null,
      });
    } catch (e) {
      if (
        !(
          e instanceof EpicRequestFailure &&
          e.status !== undefined &&
          e.status < 500
        )
      )
        model.setRequestUncertain(true);
      setError(e instanceof Error ? e.message : "Änderung nicht bestätigt.");
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  async function checkJournal() {
    setBusy(true);
    try {
      const rows: TaskOperationView[] = await request("/api/tasks");
      const row = rows.find((r) => r.input?.key === key.current);
      if (!row) {
        setError(
          "Noch kein eindeutig zuordenbarer Journalnachweis. Nicht erneut senden.",
        );
        return;
      }
      if (row.status === "succeeded") await model.load(true);
      setOperation(row);
      model.setRequestUncertain(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Journal nicht verfügbar.");
    } finally {
      setBusy(false);
    }
  }
  const evidence = (
    <>
      {operation && <TaskOperationEvidence operation={operation} />}
      {operation && (
        <output>
          Operationsstand: {operation.status}.{" "}
          {operation.status === "succeeded"
            ? "In Todoist nachgewiesen."
            : "Erst der externe Nachweis bestätigt die Speicherung."}
        </output>
      )}
    </>
  );
  return (
    <>
      {preview && (
        <UiDialog
          title="Änderungen speichern"
          close={() => model.setPreview(null)}
          busy={model.busy}
          showCloseButton={false}
        >
          <p>Ziel, Checkliste oder Dokumentenlink bewusst speichern.</p>
          <TaskAccordion title="Vorher / Nachher ansehen">
            <h4>Vorher</h4>
            <pre>{preview.before}</pre>
            <h4>Nachher</h4>
            <pre>{preview.after}</pre>
          </TaskAccordion>
          {model.error && <p role="alert">{model.error}</p>}
          {evidence}
          {model.requestUncertain && (
            <ActionButton
              busy={model.busy}
              loadingText="Vorgang wird verarbeitet …"
              type="button"
              disabled={model.busy}
              onClick={() => void checkJournal()}
            >
              Dokumentauftrag im Journal prüfen
            </ActionButton>
          )}
          <div className="task-action-buttons">
            <Button
              type="button"
              className="secondary"
              disabled={model.busy}
              onClick={() => model.setPreview(null)}
            >
              Zurück zur Aufgabe
            </Button>
            <ActionButton
              busy={
                model.busy ||
                ["queued", "running"].includes(operation?.status ?? "")
              }
              loadingText="Änderungen werden gespeichert …"
              type="button"
              disabled={pending}
              onClick={() => void confirm()}
            >
              Änderung bewusst bestätigen
            </ActionButton>
          </div>
        </UiDialog>
      )}
      {!preview && model.requestUncertain && (
        <ActionButton
          busy={model.busy}
          loadingText="Vorgang wird verarbeitet …"
          type="button"
          disabled={model.busy}
          onClick={() => void checkJournal()}
        >
          Dokumentauftrag im Journal prüfen
        </ActionButton>
      )}
      {!preview && evidence}
    </>
  );
}
