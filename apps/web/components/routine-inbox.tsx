"use client";
import { useRoutineResource } from "./routine-resource";
import { useState } from "react";
import type { RoutineView, WorkSnapshot, InboxCard } from "@helios/contracts";
import { routineRequest, type RoutineAction } from "./routine-http";
type Data = {
  card: InboxCard;
  deferred: boolean;
  operations: { id: string; status: string; code: string | null }[];
};
export function RoutineInbox({
  routine,
  snapshot,
  act,
  refresh,
}: {
  routine: RoutineView;
  snapshot: WorkSnapshot;
  act: RoutineAction;
  refresh: () => Promise<void>;
}) {
  const resource = useRoutineResource<Data>(
    "/api/routine?kind=inbox&id=" + routine.id,
    routine.revision,
    4000,
  );
  if (!resource.data)
    return (
      <section className="card">
        <h2>Ein Gedanke nach dem anderen.</h2>
        {resource.error ? (
          <p role="alert">{resource.error}</p>
        ) : (
          <p role="status">Eingang wird gelesen …</p>
        )}
        <button onClick={() => void resource.reload().catch(() => {})}>
          Eingang erneut laden
        </button>
      </section>
    );
  return (
    <InboxView
      key={resource.data.card?.task.id ?? "empty"}
      data={resource.data}
      routine={routine}
      snapshot={snapshot}
      act={act}
      refresh={refresh}
      load={resource.reload}
      readError={resource.error}
    />
  );
}
function InboxView({
  routine,
  snapshot,
  act,
  refresh,
  data,
  load,
  readError,
}: {
  routine: RoutineView;
  snapshot: WorkSnapshot;
  act: RoutineAction;
  refresh: () => Promise<void>;
  data: Data;
  load: () => Promise<Data>;
  readError: string;
}) {
  const [error, setError] = useState(""),
    [project, setProject] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [destructive, setDestructive] = useState(false),
    [hierarchy, setHierarchy] = useState(false),
    [busy, setBusy] = useState(false);
  async function send(action: string, extra: Record<string, unknown> = {}) {
    if (!data?.card) return;
    setBusy(true);
    setError("");
    try {
      await act(action, {
        taskId: data.card.task.id,
        basis: data.card.basis,
        ...extra,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card routine-step">
      <h2>Ein Gedanke nach dem anderen.</h2>
      <p>
        Du entscheidest, wohin die Aufgabe gehört. Es gibt keine KI-Auswertung
        im Eingang.
      </p>
      {routine.inboxSuccesses >= 3 && (
        <p role="status" className="routine-gentle">
          Du hast bereits einige Einträge bewusst bearbeitet. Du kannst jetzt
          weitergehen oder in Ruhe weiter sortieren.
        </p>
      )}
      {(error || readError) && <p role="alert">{error || readError}</p>}
      <button
        className="secondary"
        disabled={busy}
        onClick={() => void load().catch(() => {})}
      >
        Eingang erneut laden
      </button>
      {!data && !error && <p role="status">Eingang wird gelesen …</p>}
      {data && !data.card && (
        <p>
          Im Moment liegt keine weitere Karte bereit. Du kannst weitergehen.
          {data.deferred
            ? " Für später liegengelassene Einträge bleiben in Todoist erhalten."
            : ""}
        </p>
      )}
      {data?.card && (
        <article
          aria-label="Aktuelle Eingangskarte"
          className="routine-inbox-card"
        >
          <h3>{data.card.task.content}</h3>
          {data.card.task.description && (
            <details>
              <summary>Vorhandene Beschreibung</summary>
              <pre>{data.card.task.description}</pre>
            </details>
          )}
          <p>
            Geplant: {data.card.task.due?.date ?? "Nicht gesetzt"} · Deadline:{" "}
            {data.card.task.deadline?.date ?? "Nicht gesetzt"}
          </p>
          <label>
            Projekt bewusst wählen
            <select
              aria-label="Zielprojekt"
              value={project}
              onChange={(e) => {
                setProject(e.target.value);
                setConfirmed(false);
              }}
            >
              <option value="">Bitte selbst wählen</option>
              {snapshot.projects
                .filter((p) => p.available && !p.inbox)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Diese Projektzuordnung ausdrücklich bestätigen
          </label>
          {(data.card.task.parent_id || data.card.children.length > 0) && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={hierarchy}
                onChange={(e) => setHierarchy(e.target.checked)}
              />
              Die Auswirkung auf Ober- und Unteraufgaben bewusst bestätigen
            </label>
          )}
          <div className="routine-actions">
            <button
              disabled={busy || !project || !confirmed}
              onClick={() =>
                void send("inbox-move", {
                  projectId: project,
                  acknowledgeHierarchy: hierarchy,
                })
              }
            >
              Bewusst zuordnen
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void send("inbox-defer")}
            >
              Für später liegen lassen
            </button>
          </div>
          <details>
            <summary>Aufgabe löschen</summary>
            <label className="check-label">
              <input
                type="checkbox"
                checked={destructive}
                onChange={(e) => setDestructive(e.target.checked)}
              />
              Diese Aufgabe bewusst dauerhaft löschen
            </label>
            <button
              disabled={busy || !destructive}
              onClick={() =>
                void send("inbox-delete", {
                  acknowledgeDestructive: true,
                  acknowledgeHierarchy: hierarchy,
                })
              }
            >
              Löschung bestätigen
            </button>
          </details>
        </article>
      )}
      {data?.deferred && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            void act("inbox-reopen")
              .then(load)
              .catch((e) => setError(e.message))
          }
        >
          Liegengelassene Einträge wieder anzeigen
        </button>
      )}
      {data?.operations.length ? (
        <details>
          <summary>Ergebnisse deiner Eingangsaktionen</summary>
          {data.operations.map((op) => (
            <p key={op.id}>
              {op.status === "succeeded"
                ? "Extern nachgewiesen"
                : op.status === "unknown"
                  ? "Ungeklärt – kein Erfolg behauptet"
                  : op.status === "failed"
                    ? "Nicht ausgeführt"
                    : op.status === "partial"
                      ? "Teilerfolg – Prüfung nötig"
                      : "Wird verarbeitet"}{" "}
              {op.code && " · " + op.code}
              {["unknown", "failed", "partial"].includes(op.status) && (
                <button
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void routineRequest("/api/tasks/resume", {
                      operationId: op.id,
                    })
                      .then(refresh)
                      .then(load)
                      .catch((e) => setError(e.message))
                      .finally(() => setBusy(false));
                  }}
                >
                  Externe Wirkung prüfen und bewusst fortsetzen
                </button>
              )}
            </p>
          ))}
        </details>
      ) : null}
    </section>
  );
}
