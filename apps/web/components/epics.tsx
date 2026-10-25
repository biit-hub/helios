"use client";
import { ActionButton, Button, Card, Icon } from "@helios/ui";

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
}: Readonly<{
  context: ContextView;
  snapshot: WorkSnapshot;
}>) {
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
      <div className="ux-epic-toolbar">
        <ActionButton
          busy={busy}
          loadingText="Vorgang wird verarbeitet …"
          type="button"
          disabled={busy}
          aria-label="Epics aus Todoist aktualisieren"
          title="Epics aus Todoist aktualisieren"
          className="secondary ux-icon-button"
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
          <Icon name="refresh" />
        </ActionButton>
      </div>
      {error && <p role="alert">{error}</p>}
      {(!rows || busy) && <output>Epics werden geladen …</output>}
      {rows?.length === 0 && (
        <p>
          Noch keine Epics in diesem Kontext bekannt. Aufgaben bewusst
          aktualisieren oder einer Aufgabe das Label epic geben.
        </p>
      )}
      <div className="epic-grid">
        {rows?.map((row) => (
          <Card as="article" className="card" key={row.task.id}>
            <p>{epicStatus(row)}</p>
            <h3>{row.task.content}</h3>
            <p>
              {row.goalConflict
                ? "Zielabschnitt mehrdeutig"
                : row.goal || "Ziel fehlt – SMART-Hilfe verfügbar"}
            </p>
            <Button
              type="button"
              onClick={() => {
                setSelected(row.task.id);
                setEditing(false);
              }}
            >
              Epic öffnen
            </Button>
          </Card>
        ))}
      </div>
      {selected && (
        <Card as="section" className="card">
          <Button
            type="button"
            onClick={() => {
              setSelected(null);
              setEditing(false);
            }}
          >
            Epic-Details schliessen
          </Button>
          <TaskDocument
            key={selected}
            context={context}
            taskId={selected}
            snapshot={snapshot}
          />
          <Button type="button" onClick={() => setEditing(true)}>
            Aufgabenformular und manuelle Aktionen öffnen
          </Button>
          {editing && (
            <TaskEditor
              context={context}
              taskId={selected}
              snapshot={snapshot}
              close={() => setEditing(false)}
            />
          )}
        </Card>
      )}
      <TaskOperations contextId={context.id} />
    </section>
  );
}

function epicStatus(row: EpicListItem) {
  if (row.state === "unknown") return "Status unbekannt";
  if (row.task.checked || row.state === "completed")
    return "Nativ abgeschlossen";
  return "Offen";
}
