"use client";
import { useEffect, useState } from "react";
import type {
  ContextView,
  WorkSnapshot,
  EpicListItem,
} from "@helios/contracts";
import { epicRequest as request } from "./epic-http";
import { TaskDocument } from "./task-document";
import { TaskEditor, TaskOperations } from "./tasks";
export function Epics({
  context,
  snapshot,
}: {
  context: ContextView;
  snapshot: WorkSnapshot;
}) {
  const [rows, setRows] = useState<EpicListItem[] | null>(null),
    [selected, setSelected] = useState<string | null>(() =>
      typeof window === "undefined"
        ? null
        : new URL(window.location.href).searchParams.get("task"),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false);
  const path = "/api/epics?contextId=" + context.id;
  useEffect(() => {
    let alive = true;
    void request(path)
      .then((r) => {
        if (alive) setRows(r);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [path]);
  return (
    <section>
      <h2>Epics und Ziele</h2>
      <p>
        Vorhaben aus Todoist mit Label epic. Ziele und Checklisten bleiben in
        der ursprünglichen Beschreibung.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError("");
          void request("/api/work/tasks-refresh", { contextId: context.id })
            .then(() => request(path))
            .then(setRows)
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        Epics aus Todoist aktualisieren
      </button>
      {error && <p role="alert">{error}</p>}
      {(!rows || busy) && <p role="status">Epics werden geladen …</p>}
      {rows?.length === 0 && (
        <p>
          Noch keine Epics in diesem Kontext bekannt. Aufgaben bewusst
          aktualisieren oder einer Aufgabe das Label epic geben.
        </p>
      )}
      <div className="epic-grid">
        {rows?.map((row) => (
          <article className="card" key={row.task.id}>
            <p>
              {row.state === "unknown"
                ? "Status unbekannt"
                : row.task.checked || row.state === "completed"
                  ? "Nativ abgeschlossen"
                  : "Offen"}
            </p>
            <h3>{row.task.content}</h3>
            <p>
              {row.goalConflict
                ? "Zielabschnitt mehrdeutig"
                : row.goal || "Ziel fehlt – SMART-Hilfe verfügbar"}
            </p>
            <button
              type="button"
              onClick={() => {
                setSelected(row.task.id);
                setEditing(false);
              }}
            >
              Epic öffnen
            </button>
          </article>
        ))}
      </div>
      {selected && (
        <section className="card">
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setEditing(false);
            }}
          >
            Epic-Details schliessen
          </button>
          <TaskDocument
            key={selected}
            context={context}
            taskId={selected}
            snapshot={snapshot}
          />
          <button type="button" onClick={() => setEditing(true)}>
            Aufgabenformular und manuelle Aktionen öffnen
          </button>
          {editing && (
            <TaskEditor
              context={context}
              taskId={selected}
              snapshot={snapshot}
              close={() => setEditing(false)}
            />
          )}
        </section>
      )}
      <TaskOperations contextId={context.id} />
    </section>
  );
}
