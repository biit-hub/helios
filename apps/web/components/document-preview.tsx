"use client";
import type { DocumentModel } from "./use-task-document";
import { epicRequest as request } from "./epic-http";
export function DocumentPreview({
  model,
  context,
  taskId,
}: Readonly<{
  model: DocumentModel;
  context: import("@helios/contracts").ContextView;
  taskId: string;
}>) {
  const { setError, setBusy, preview, operation, setOperation, key, pending } =
    model;
  return (
    <>
      {" "}
      {preview && (
        <section className="card">
          <h3>Änderungsvorschau</h3>
          <p>
            Quellfassung {preview.basis.slice(0, 12)} · Bei Änderungen in
            Todoist wird das Speichern abgewiesen.
          </p>
          <details>
            <summary>Vorher</summary>
            <pre>{preview.before}</pre>
          </details>
          <h4>Nachher</h4>
          <pre>{preview.after}</pre>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setBusy(true);
              void request("/api/tasks/submit", {
                key: key.current,
                action: "document",
                contextId: context.id,
                taskId,
                basis: preview.basis,
                document: preview.change,
              })
                .then((r) =>
                  setOperation({
                    id: r.operationId,
                    status: "queued",
                    code: null,
                    result: null,
                    retryAt: null,
                  }),
                )
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Änderung bewusst bestätigen
          </button>
        </section>
      )}
      {operation && (
        <output>
          Operationsstand: {operation.status}
          {operation.code ? " · " + operation.code : ""}.{" "}
          {operation.status === "succeeded"
            ? "In Todoist nachgewiesen."
            : "Erst der externe Nachweis bestätigt die Speicherung; Journal unten prüfen."}
        </output>
      )}
    </>
  );
}
