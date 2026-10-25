import type { TaskOperationView } from "@helios/contracts";
import { Accordion } from "@helios/ui";
const labels: Record<string, string> = {
  due_date: "Geplantes Datum",
  due_datetime: "Datum und Uhrzeit",
  due_string: "Datum / Wiederholung",
  duration: "Dauer",
  deadline_date: "Deadline",
  content: "Titel",
  description: "Beschreibung",
  priority: "Priorität",
  labels: "Labels",
  project_id: "Projekt",
  section_id: "Abschnitt",
  parent_id: "Übergeordnete Aufgabe",
};
export function TaskOperationEvidence({
  operation,
}: {
  readonly operation: TaskOperationView;
}) {
  const verification = operation.result?.verification as
    | {
        matched?: string[];
        unmatched?: string[];
        checkedAt?: string;
        acknowledged?: boolean;
      }
    | undefined;
  const failure = operation.result?.failure as
    | { kind?: string; httpStatus?: number }
    | undefined;
  const failureLabels: Record<string, string> = {
    timeout: "Zeitüberschreitung; externe Wirkung offen",
    network: "Verbindungsfehler; externe Wirkung offen",
    server: "Todoist-Serverfehler; externe Wirkung offen",
    response: "Antwort nicht sicher auswertbar; externe Wirkung offen",
  };
  const pending = operation.result?.pending as
    | {
        requestId?: string;
        kind?: string;
        acknowledged?: boolean;
        body?: Record<string, unknown>;
      }
    | undefined;
  return (
    <section className="operation-evidence" aria-label="Operationsnachweise">
      {failure?.kind && (
        <p>
          Ursprüngliche Antwort:{" "}
          {failureLabels[failure.kind] ?? "Übertragung ungeklärt"}
          {failure.httpStatus ? " (HTTP " + failure.httpStatus + ")" : ""}. Kein
          automatischer Schreibversuch.
        </p>
      )}
      {verification && (
        <>
          <p>
            {verification.acknowledged
              ? "Todoist hat die Anfrage beantwortet. Der Feldvergleich ergibt:"
              : "Nachgelesener Stand; die ursprüngliche Antwort fehlt:"}
          </p>
          <ul>
            {verification.matched?.map((field) => (
              <li key={field}>
                {labels[field] ?? "Aufgabenfeld"}: nachgewiesen
              </li>
            ))}
            {verification.unmatched?.map((field) => (
              <li key={field}>
                {labels[field] ?? "Aufgabenfeld"}: nicht nachgewiesen
              </li>
            ))}
          </ul>
          {!!verification.unmatched?.length && (
            <p className="warning">
              Die Gesamtänderung bleibt ungeklärt. Nicht erneut senden. Bei
              eingeschränkten Feldern auch die Kontoberechtigung prüfen.
            </p>
          )}
        </>
      )}
      <Accordion
        className="technical-details"
        title="Technischer Operationsnachweis"
      >
        <dl>
          <dt>Operation</dt>
          <dd>{operation.id}</dd>
          <dt>Status</dt>
          <dd>{operation.status}</dd>
          <dt>Fehlercode</dt>
          <dd>{operation.code ?? "Keiner"}</dd>
          <dt>Kommando</dt>
          <dd>
            {operation.input?.action ?? pending?.kind ?? "Aufgabenänderung"}
          </dd>
          {pending?.requestId && (
            <>
              <dt>Request-ID</dt>
              <dd>{pending.requestId}</dd>
            </>
          )}
          {pending?.body && (
            <>
              <dt>Gesendete Felder</dt>
              <dd>
                <pre>{JSON.stringify(pending.body, null, 2)}</pre>
              </dd>
            </>
          )}
          {verification?.checkedAt && (
            <>
              <dt>Nachgelesen</dt>
              <dd>
                {new Date(verification.checkedAt).toLocaleString("de-CH", {
                  timeZone: "Europe/Zurich",
                })}
              </dd>
            </>
          )}
        </dl>
      </Accordion>
    </section>
  );
}
