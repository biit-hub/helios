"use client";
import {
  ActionButton,
  Accordion,
  Card,
  Button,
  FormField,
  Select,
  Checkbox,
} from "@helios/ui";

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
      <Card as="section" className="card">
        <h2>Ein Gedanke nach dem anderen.</h2>
        {resource.error ? (
          <p role="alert">{resource.error}</p>
        ) : (
          <p role="status">Eingang wird gelesen …</p>
        )}
        <Button onClick={() => void resource.reload().catch(() => {})}>
          Eingang erneut laden
        </Button>
      </Card>
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
    <Card as="section" className="card routine-step">
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
      <ActionButton
        busy={busy}
        loadingText="Stand wird aktualisiert …"
        className="secondary"
        disabled={busy}
        onClick={() => void load().catch(() => {})}
      >
        Eingang erneut laden
      </ActionButton>
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
            <Accordion title="Vorhandene Beschreibung">
              <pre>{data.card.task.description}</pre>
            </Accordion>
          )}
          <p>
            Geplant: {data.card.task.due?.date ?? "Nicht gesetzt"} · Deadline:{" "}
            {data.card.task.deadline?.date ?? "Nicht gesetzt"}
          </p>
          <FormField>
            Projekt bewusst wählen
            <Select
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
            </Select>
          </FormField>
          <FormField className="check-label">
            <Checkbox
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Diese Projektzuordnung ausdrücklich bestätigen
          </FormField>
          {(data.card.task.parent_id || data.card.children.length > 0) && (
            <FormField className="check-label">
              <Checkbox
                type="checkbox"
                checked={hierarchy}
                onChange={(e) => setHierarchy(e.target.checked)}
              />
              Die Auswirkung auf Ober- und Unteraufgaben bewusst bestätigen
            </FormField>
          )}
          <div className="routine-actions">
            <ActionButton
              busy={busy}
              loadingText="Aufgabe wird verschoben …"
              disabled={busy || !project || !confirmed}
              onClick={() =>
                void send("inbox-move", {
                  projectId: project,
                  acknowledgeHierarchy: hierarchy,
                })
              }
            >
              Bewusst zuordnen
            </ActionButton>
            <ActionButton
              busy={busy}
              loadingText="Vorgang wird verarbeitet …"
              className="secondary"
              disabled={busy}
              onClick={() => void send("inbox-defer")}
            >
              Für später liegen lassen
            </ActionButton>
          </div>
          <Accordion title="Aufgabe löschen">
            <FormField className="check-label">
              <Checkbox
                type="checkbox"
                checked={destructive}
                onChange={(e) => setDestructive(e.target.checked)}
              />
              Diese Aufgabe bewusst dauerhaft löschen
            </FormField>
            <ActionButton
              busy={busy}
              loadingText="Änderungen werden gespeichert …"
              disabled={busy || !destructive}
              onClick={() =>
                void send("inbox-delete", {
                  acknowledgeDestructive: true,
                  acknowledgeHierarchy: hierarchy,
                })
              }
            >
              Löschung bestätigen
            </ActionButton>
          </Accordion>
        </article>
      )}
      {data?.deferred && (
        <ActionButton
          busy={busy}
          loadingText="Vorgang wird verarbeitet …"
          className="secondary"
          disabled={busy}
          onClick={() =>
            void act("inbox-reopen")
              .then(load)
              .catch((e) => setError(e.message))
          }
        >
          Liegengelassene Einträge wieder anzeigen
        </ActionButton>
      )}
      {data?.operations.length ? (
        <Accordion title="Ergebnisse deiner Eingangsaktionen">
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
                <ActionButton
                  busy={busy}
                  loadingText="Vorgang wird verarbeitet …"
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
                </ActionButton>
              )}
            </p>
          ))}
        </Accordion>
      ) : null}
    </Card>
  );
}
