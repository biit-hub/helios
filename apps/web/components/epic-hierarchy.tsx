"use client";
import type { DocumentModel } from "./use-task-document";

export function EpicHierarchy({
  model,
  context,
  taskId,
}: {
  model: DocumentModel;
  context: import("@helios/contracts").ContextView;
  taskId: string;
}) {
  const { detail } = model;
  return (
    <>
      {" "}
      <h3>Native Hierarchie und nachgewiesener Fortschritt</h3>
      <p>
        Keine Fortschrittsquote aus Kinderzahlen. Nicht bekannte Abschlüsse
        bleiben unbekannt.
      </p>
      {detail.inspection.task.parent_id && (
        <p>
          <a
            href={
              "/tasks?context=" +
              context.id +
              "&task=" +
              encodeURIComponent(detail.inspection.task.parent_id)
            }
          >
            Oberaufgabe öffnen
          </a>
        </p>
      )}
      {detail.children.map((t) => (
        <p key={t.id}>
          <a
            href={
              (t.labels.includes("epic") ? "/epics" : "/tasks") +
              "?context=" +
              context.id +
              "&task=" +
              encodeURIComponent(t.id)
            }
          >
            {t.content}
          </a>{" "}
          · {t.checked ? "nativ als abgeschlossen nachgewiesen" : "offen"} ·{" "}
          {t.parent_id === taskId ? "direktes Kind" : "weitere Ebene"}
        </p>
      ))}
      {detail.unknownChildren.map((t) => (
        <p key={t.id}>{t.content}: unbekannt / nicht mehr sicher zugeordnet.</p>
      ))}
      {!detail.children.length && !detail.unknownChildren.length && (
        <p>
          Noch keine bekannten Unteraufgaben. Das beweist keinen Epic-Abschluss.
        </p>
      )}
    </>
  );
}
