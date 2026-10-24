"use client";
import { useSearchParams } from "next/navigation";
import {
  dateLabel,
  taskDateLabel,
  taskDateInputs,
  taskDateTime,
} from "./task-dates";
import { TaskOperationEvidence } from "./task-operation-evidence";
import { nativeTaskOrder } from "./task-list-order";
import { UiDialog, InfoTip } from "./ui-help";
import { Icon } from "@helios/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ContextView,
  WorkSnapshot,
  TaskView,
  TaskInspection,
  TaskCommand,
  TaskOperationView,
} from "@helios/contracts";
import type { ReactNode } from "react";
import { entryKey } from "@helios/contracts";
import { LabelPicker } from "./label-picker";
import { useNavigationLock } from "./navigation-lock";
import {
  taskChangedEvent,
  type VerifiedTaskChange,
  announceTaskChange,
} from "./task-events";
import { TaskDocument } from "./task-document";
import { AiDraftPanel } from "./ai-drafts";
import { AddToPlan, TaskPlanProvider } from "./agenda";
async function api(path: string, body?: unknown) {
  const r = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.error?.message ?? "Die Anfrage ist fehlgeschlagen.");
  return data;
}
const taskError: Record<string, string> = {
  LABEL_NOT_AVAILABLE:
    "Ein ausgewähltes Label ist in Todoist nicht mehr verfügbar. Deine Eingaben bleiben erhalten; vorhandene Labels erneut laden.",
  DRAFT_SUPERSEDED:
    "Der definitiv fehlgeschlagene Schritt wurde zur Korrektur aufgehoben. Es wurde keine externe Änderung als Erfolg behauptet.",
  OUTCOME_UNKNOWN:
    "Das Ergebnis ist ungeklärt. Zuerst in Todoist prüfen; es wird nicht blind erneut geschrieben.",
  TODOIST_FIELDS_UNCONFIRMED:
    "Todoist hat die Anfrage beantwortet, aber nicht alle angeforderten Felder gespeichert. Nachweise unten prüfen; es wird nicht automatisch erneut geschrieben. Berechtigungen können einzelne Felder einschränken.",
  TODOIST_REJECTED:
    "Todoist hat die Änderung abgewiesen. Eingaben und Datums-/Dauerwerte prüfen.",
  TASK_SOURCE_CONFLICT:
    "Todoist wurde zwischenzeitlich geändert. Die Eingaben bleiben erhalten. Quelle neu laden und Änderungen erneut prüfen.",
  TODOIST_AUTH:
    "Todoist hat die Verbindung abgewiesen. Den Token in den Einstellungen prüfen. Die Eingaben bleiben erhalten.",
  TODOIST_PERMISSION:
    "Todoist erlaubt diese Änderung mit diesem Konto nicht. Die Eingaben bleiben erhalten.",
  TASK_SCOPE_CONFLICT:
    "Die Projektzuordnung hat sich geändert. Bitte Quelle und Kontext prüfen.",
  SECTION_MISSING:
    "Benötigte Abschnitte fehlen. Diese zuerst bewusst einrichten.",
  HIERARCHY_CONFIRMATION_REQUIRED:
    "Diese Aktion betrifft die Hierarchie. Bitte die Auswirkung ausdrücklich bestätigen.",
  EPIC_CHILDREN_POLICY:
    "Epic-Abschluss benötigt die ausdrückliche Wahl: offene Teilbäume trennen oder abbrechen.",
  INTENT_EXPIRED:
    "Die Bestätigungsfrist ist abgelaufen. Nach Anmeldung bewusst fortsetzen.",
  rate_limit:
    "Todoist begrenzt die Anfragen. Bitte die angezeigte Wartezeit beachten.",
};
export function TaskManager({
  tasks,
  context,
  snapshot,
  renderTask,
}: {
  tasks: TaskView[];
  context: ContextView;
  snapshot: WorkSnapshot;
  renderTask: (t: TaskView) => ReactNode;
}) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [priorityFilter, setPriorityFilter] = useState("all"),
    [labelFilter, setLabelFilter] = useState(""),
    [dateFilter, setDateFilter] = useState("all"),
    [deadlineFilter, setDeadlineFilter] = useState("all"),
    [sort, setSort] = useState("native"),
    [initialMode, setInitialMode] = useState<"form" | "progress">("form"),
    [progressPicking, setProgressPicking] = useState(false),
    [progressSearch, setProgressSearch] = useState(""),
    [editing, setEditing] = useState<string | null>(null);
  const query = useSearchParams();
  useEffect(() => {
    const timer = setTimeout(() => {
      const url = new URL(window.location.href);
      const requestedContext = url.searchParams.get("context");
      if (requestedContext && requestedContext !== context.id) return;
      const pick = url.searchParams.get("progress") === "pick";
      const task = url.searchParams.get("task");
      if (!pick && !task) return;
      if (pick) {
        setProgressSearch("");
        setProgressPicking(true);
      }
      if (task) {
        setInitialMode(
          url.searchParams.get("mode") === "progress" ? "progress" : "form",
        );
        setEditing(task);
      }
      for (const key of ["progress", "task", "mode"])
        url.searchParams.delete(key);
      window.history.replaceState(window.history.state, "", url);
    }, 0);
    return () => clearTimeout(timer);
  }, [query, context.id]);
  useEffect(() => {
    const changed = (event: Event) => {
      const change = (event as CustomEvent<VerifiedTaskChange>).detail;
      if (
        change.contextId === context.id &&
        ["create", "update", "move", "wait"].includes(change.action)
      ) {
        setSearch("");
        setStatus("all");
        setPriorityFilter("all");
        setLabelFilter("");
        setDateFilter("all");
        setDeadlineFilter("all");
      }
    };
    window.addEventListener(taskChangedEvent, changed);
    return () => window.removeEventListener(taskChangedEvent, changed);
  }, [context.id]);
  const visible = nativeTaskOrder(tasks).filter(
    (t) =>
      t.state === "active" &&
      t.data.project_id === context.projectId &&
      !t.data.checked &&
      !t.data.is_deleted &&
      (
        t.data.content +
        " " +
        t.data.description +
        " " +
        t.data.labels.join(" ")
      )
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()) &&
      (status === "all" || t.sectionName === status) &&
      (priorityFilter === "all" ||
        t.data.priority === Number(priorityFilter)) &&
      (!labelFilter || t.data.labels.includes(labelFilter)) &&
      (dateFilter === "all" ||
        (dateFilter === "set" ? !!t.data.due : !t.data.due)) &&
      (deadlineFilter === "all" ||
        (deadlineFilter === "set" ? !!t.data.deadline : !t.data.deadline)),
  );
  const progressTasks = nativeTaskOrder(tasks).filter(
    (t) =>
      t.state === "active" &&
      t.data.project_id === context.projectId &&
      !t.data.checked &&
      !t.data.is_deleted &&
      t.data.content
        .toLocaleLowerCase()
        .includes(progressSearch.toLocaleLowerCase()),
  );
  const compare: Record<string, (a: TaskView, b: TaskView) => number> = {
    native: () => 0,
    priority: (a, b) => b.data.priority - a.data.priority,
    title: (a, b) => a.data.content.localeCompare(b.data.content, "de"),
    due: (a, b) =>
      (a.data.due?.datetime ?? a.data.due?.date ?? "9999").localeCompare(
        b.data.due?.datetime ?? b.data.due?.date ?? "9999",
      ),
    deadline: (a, b) =>
      (a.data.deadline?.date ?? "9999").localeCompare(
        b.data.deadline?.date ?? "9999",
      ),
  };
  const ordered = [...visible].sort(compare[sort] ?? compare.native);

  return (
    <TaskPlanProvider context={context}>
      <div className="task-filters">
        <label>
          Aufgaben suchen
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Alle</option>
            {["Offen", "In Arbeit", "Wartet", "Abgeschlossen"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <details className="ux-filter-options">
        <summary>Weitere Filter & Sortierung</summary>
        <InfoTip label="Sortierung">
          Die native Reihenfolge berücksichtigt gelesene Geschwisterpositionen;
          die Abschnittsfolge bleibt wie geladen. Fehlen Positionsdaten, bleibt
          die geladene Reihenfolge erhalten. Sortieren verändert nur diese
          Ansicht. Todoist und bestätigte Tagespläne bleiben unverändert.
        </InfoTip>
        <div className="task-filters">
          <label>
            <span>Priorität</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="all">Alle Prioritäten</option>
              {[4, 3, 2, 1].map((p) => (
                <option key={p} value={p}>
                  P{5 - p}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Label</span>
            <select
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
            >
              <option value="">Alle Labels</option>
              {[...new Set(tasks.flatMap((t) => t.data.labels))]
                .sort((a, b) => a.localeCompare(b, "de"))
                .map((l) => (
                  <option key={l}>{l}</option>
                ))}
            </select>
          </label>
          <label>
            <span>Planungsdatum</span>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            >
              <option value="all">Alle</option>
              <option value="set">Mit Planungsdatum</option>
              <option value="unset">Ohne Planungsdatum</option>
            </select>
          </label>
          <label>
            <span>Deadline</span>
            <select
              value={deadlineFilter}
              onChange={(e) => setDeadlineFilter(e.target.value)}
            >
              <option value="all">Alle</option>
              <option value="set">Mit Deadline</option>
              <option value="unset">Ohne Deadline</option>
            </select>
          </label>
          <label>
            <span>Sortierung</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="native">Native Todoist-Reihenfolge</option>
              <option value="priority">Priorität</option>
              <option value="title">Titel</option>
              <option value="due">Planungsdatum</option>
              <option value="deadline">Deadline</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setSearch("");
            setStatus("all");
            setPriorityFilter("all");
            setLabelFilter("");
            setDateFilter("all");
            setDeadlineFilter("all");
            setSort("native");
          }}
        >
          Filter zurücksetzen
        </button>
      </details>
      {!visible.length && tasks.length > 0 && (
        <p>Keine Aufgaben für diesen Filter.</p>
      )}
      <div className="task-list">
        {ordered.map((t) => (
          <details className="task-entry task-card" key={t.data.id}>
            <summary>
              <h3>{t.data.content}</h3>
              <span className="help">
                {t.sectionName ?? "Ohne Abschnitt"} · P{5 - t.data.priority}
                {t.data.due
                  ? " · Geplant " + taskDateLabel(t.data.due, snapshot.timezone)
                  : ""}
                {t.data.deadline
                  ? " · Deadline " + dateLabel(t.data.deadline.date)
                  : ""}
              </span>
              <button
                type="button"
                className="secondary task-open"
                aria-label={"Aufgabe öffnen und bearbeiten: " + t.data.content}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setInitialMode("form");
                  setEditing(t.data.id);
                }}
              >
                <Icon name="open" />
              </button>
            </summary>
            {renderTask(t)}
            <AddToPlan
              taskId={t.data.id}
              instanceKey={entryKey({ taskId: t.data.id, source: t.data })}
              context={context}
            />
          </details>
        ))}
      </div>
      {progressPicking && (
        <UiDialog
          title="Fortschritt: Aufgabe auswählen"
          close={() => setProgressPicking(false)}
        >
          <p>Für welche Aufgabe möchtest du Fortschritt notieren?</p>
          <label>
            Aufgabe suchen
            <input
              type="search"
              value={progressSearch}
              onChange={(e) => setProgressSearch(e.target.value)}
              autoComplete="off"
            />
          </label>
          <ul
            className="progress-task-list"
            aria-label="Aufgaben für Fortschritt"
          >
            {progressTasks.map((t) => (
              <li key={t.data.id}>
                <button
                  type="button"
                  key={t.data.id}
                  onClick={() => {
                    setInitialMode("progress");
                    setEditing(t.data.id);
                    setProgressPicking(false);
                  }}
                >
                  <strong>{t.data.content}</strong>
                  <span>{context.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {!progressTasks.length && (
            <p>
              Keine passende aktuelle Aufgabe. Suche oder Aufgabenstand prüfen.
            </p>
          )}
        </UiDialog>
      )}
      {editing && (
        <TaskEditor
          key={editing}
          initialMode={initialMode}
          context={context}
          taskId={editing}
          snapshot={snapshot}
          close={() => setEditing(null)}
        />
      )}
      <TaskOperations contextId={context.id} />
    </TaskPlanProvider>
  );
}
export function TaskCapture({
  snapshot,
  sidebar = false,
  disabled = false,
}: Readonly<{
  snapshot: WorkSnapshot;
  disabled?: boolean;
  sidebar?: boolean;
}>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={sidebar ? "sidebar-capture" : "capture-button"}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Icon name="plus" /> Aufgabe erfassen
      </button>
      {open && <TaskEditor snapshot={snapshot} close={() => setOpen(false)} />}
    </>
  );
}
export function TaskOperations({ contextId }: { contextId?: string }) {
  const [operationError, setOperationError] = useState(""),
    [readError, setReadError] = useState("");
  const [rows, setRows] = useState<
    (TaskOperationView & { contextId: string | null })[]
  >([]);
  useEffect(() => {
    let alive = true;
    const read = () =>
      void api("/api/tasks")
        .then((v) => {
          if (alive) {
            setRows(v);
            setReadError("");
          }
        })
        .catch(() => {
          if (alive)
            setReadError(
              "Operationsstand konnte nicht geladen werden. Ein vorhandener Stand ist möglicherweise veraltet.",
            );
        });
    read();
    const timer = setInterval(read, 2500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const relevant = rows.filter(
    (r) =>
      contextId === undefined ||
      r.contextId === contextId ||
      r.contextId === null,
  );
  return (
    (relevant.length > 0 || readError) && (
      <details className="card operation-list" open={contextId === undefined}>
        <summary>
          Aufgabenänderungen und Einzelergebnisse
          {readError ? " · Abruf fehlgeschlagen" : ""}
        </summary>
        {readError && <p role="alert">{readError}</p>}
        {operationError && <p role="alert">{operationError}</p>}
        {relevant.map((r) => (
          <div key={r.id} id={"operation-" + r.id}>
            <h3>Aufgabenänderung</h3>
            {r.input && (
              <details>
                <summary>Bestätigte Originaleingaben</summary>
                <p>{r.input.fields?.content}</p>
                <pre>
                  {r.input.document
                    ? documentSummary(r.input.document)
                    : (r.input.fields?.description ??
                      r.input.comment ??
                      r.input.waiting?.subject ??
                      "")}
                </pre>
                <p>
                  {r.input.fields?.due !== undefined
                    ? "Geplant: " + (r.input.fields.due ?? "entfernen")
                    : ""}{" "}
                  {r.input.fields?.deadline !== undefined
                    ? "Deadline: " + (r.input.fields.deadline ?? "entfernen")
                    : ""}
                </p>
              </details>
            )}
            <p>
              {r.status === "succeeded"
                ? "Extern nachgewiesen"
                : r.status === "queued" || r.status === "running"
                  ? "Wird verarbeitet"
                  : (taskError[r.code ?? ""] ??
                    "Änderung nicht vollständig bestätigt")}
              {r.retryAt &&
                " · frühestens " + new Date(r.retryAt).toLocaleString("de-CH")}
            </p>
            {r.result !== null && Array.isArray(r.result.effects) && (
              <p>
                {(
                  r.result.effects as {
                    kind: string;
                    status: string;
                    title?: string;
                    requestId?: string;
                  }[]
                ).map((x) => (
                  <span key={x.requestId ?? x.kind + ":" + x.title}>
                    {x.kind === "epic-detach" ? "Teilbaum getrennt" : x.kind}
                    {x.title ? " «" + x.title + "»" : ""}: nachgewiesen ·{" "}
                  </span>
                ))}
              </p>
            )}
            <TaskOperationEvidence operation={r} />
            {["unknown", "failed", "partial"].includes(r.status) && (
              <button
                type="button"
                onClick={() =>
                  void api("/api/tasks/resume", { operationId: r.id }).catch(
                    (e) => setOperationError(e.message),
                  )
                }
              >
                Stand prüfen und bewusst fortsetzen
              </button>
            )}
          </div>
        ))}
      </details>
    )
  );
}
export function TaskEditor({
  snapshot,
  context,
  taskId,
  close,
  initialMode = "form",
  expectedInstanceKey,
}: {
  snapshot: WorkSnapshot;
  context?: ContextView;
  taskId?: string;
  close: () => void;
  initialMode?: "form" | "progress" | "clarification";
  expectedInstanceKey?: string;
}) {
  const submitted = useRef<{
    action: TaskCommand["action"];
    contextId: string | null;
  } | null>(null);
  const submitLock = useRef(false);
  const completed = useRef<string | null>(null);
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  const [aiMode, setAiMode] = useState<
    "form" | "progress" | "clarification" | "capture"
  >(initialMode);
  const [inspection, setInspection] = useState<TaskInspection | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [operation, setOperation] = useState<TaskOperationView | null>(null);
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [priority, setPriority] = useState(1),
    [labels, setLabels] = useState<string[]>([]),
    [date, setDate] = useState(""),
    [time, setTime] = useState(""),
    [deadline, setDeadline] = useState(""),
    [duration, setDuration] = useState(""),
    [project, setProject] = useState(""),
    [section, setSection] = useState(""),
    [parent, setParent] = useState(""),
    [comment, setComment] = useState(""),
    [who, setWho] = useState(""),
    [subject, setSubject] = useState(""),
    [followUp, setFollowUp] = useState(""),
    [hierarchy, setHierarchy] = useState(false),
    [epicDetach, setEpicDetach] = useState(false),
    [destructive, setDestructive] = useState(false),
    [fun, setFun] = useState(false),
    [recurring, setRecurring] = useState(""),
    [removeRecurrence, setRemoveRecurrence] = useState(false);
  const [options, setOptions] = useState<{
    sections: { id: string; name: string }[];
    parents: { id: string; content: string }[];
  }>({ sections: [], parents: [] });
  useEffect(() => {
    if (taskId || !project) return;
    let alive = true;
    void api("/api/tasks?projectId=" + encodeURIComponent(project))
      .then((v) => {
        if (alive) setOptions(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [project, taskId]);
  const dialogRoot = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRoot.current?.focus();
    return () => previous?.focus();
  }, []);
  const base = useRef<Record<string, unknown>>({});
  const attempt = useRef<{ hash: string; key: string } | null>(null);
  const selectedContext = taskId
    ? context
    : snapshot.contexts.find((c) => c.active && c.projectId === project);
  const loadSource = useCallback(async () => {
    if (!taskId || !context) return;
    setBusy(true);
    setError("");
    setOperation(null);
    try {
      const data: TaskInspection = await api(
        "/api/tasks?contextId=" +
          encodeURIComponent(context.id) +
          "&taskId=" +
          encodeURIComponent(taskId),
      );
      setEpicDetach(false);
      const t = data.task;
      if (
        expectedInstanceKey &&
        entryKey({ taskId: t.id, source: t }) !== expectedInstanceKey
      )
        throw new Error(
          "Die Aufgabeninstanz wurde geändert. Historischen Review erneut prüfen.",
        );
      setInspection(data);
      const dates = taskDateInputs(t.due, snapshot.timezone);
      const values = {
        title: t.content,
        description: t.description,
        priority: t.priority,
        labels: t.labels.filter(
          (x) => context?.kind !== "private" || x !== "fun",
        ),
        date: dates.date,
        time: dates.time,
        deadline: t.deadline?.date ?? "",
        duration:
          t.duration?.unit === "minute" ? String(t.duration.amount) : "",
        fun: t.labels.includes("fun"),
      };
      base.current = values;
      setTitle(values.title);
      setDescription(values.description);
      setPriority(values.priority);
      setLabels(values.labels);
      setDate(values.date);
      setTime(values.time);
      setDeadline(values.deadline);
      setDuration(values.duration);
      setFun(values.fun);
      setRecurring("");
      setRemoveRecurrence(false);
      setWho(data.waiting?.who ?? "");
      setSubject(data.waiting?.subject ?? "");
      setFollowUp(data.waiting?.followUp ?? "");
      attempt.current = null;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Quelle konnte nicht geladen werden.",
      );
    } finally {
      setBusy(false);
    }
  }, [taskId, context, expectedInstanceKey, snapshot.timezone]);
  useEffect(() => {
    const timer = setTimeout(() => void loadSource(), 0);
    return () => clearTimeout(timer);
  }, [loadSource]);
  useEffect(() => {
    if (
      !operation?.id ||
      !["queued", "running", "partial", "unknown"].includes(operation.status)
    )
      return;
    let alive = true;
    const timer = setInterval(
      () =>
        void api("/api/tasks")
          .then((rows: TaskOperationView[]) => {
            const row = rows.find((r) => r.id === operation.id);
            if (alive && row) {
              setOperation(row);
              if (
                row.status === "succeeded" &&
                completed.current !== row.id &&
                submitted.current
              ) {
                completed.current = row.id;
                const task = row.result?.task as { id?: string } | undefined;
                announceTaskChange({
                  ...submitted.current,
                  taskId: task?.id ?? taskId,
                });
                closeRef.current();
              }
              if (!["queued", "running", "succeeded"].includes(row.status))
                setError(
                  taskError[row.code ?? ""] ??
                    "Änderung nicht bestätigt. Eingaben bleiben erhalten.",
                );
            }
          })
          .catch(() => {}),
      1500,
    );
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [operation?.id, operation?.status, taskId]);
  const pending =
    busy ||
    (!!operation &&
      ["queued", "running", "unknown", "partial"].includes(operation.status));
  useNavigationLock(pending);
  const touched = useRef(false);
  function requestClose() {
    if (
      busy ||
      (operation && ["queued", "running"].includes(operation.status))
    ) {
      setError(
        "Die Änderung wird noch verarbeitet. Eingaben bleiben erhalten; zuerst den externen Nachweis abwarten.",
      );
      return;
    }
    if (operation && ["unknown", "partial"].includes(operation.status)) {
      if (
        !window.confirm(
          "Das Ergebnis bleibt ungeklärt im Operationsjournal erhalten. Dialog schliessen, ohne erneut zu schreiben?",
        )
      )
        return;
    } else if (touched.current && !window.confirm("Entwurf verwerfen?")) return;
    close();
  }
  async function submit(action: TaskCommand["action"]) {
    if (submitLock.current || pending) return;
    submitLock.current = true;
    setError("");
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        action,
        contextId: taskId ? context!.id : (selectedContext?.id ?? null),
        ...(taskId ? { taskId, basis: inspection?.basis } : {}),
        acknowledgeHierarchy: hierarchy,
        acknowledgeDestructive: destructive,
        acknowledgeRecurrenceChange: removeRecurrence,
        ...(action === "close" &&
        inspection?.task.labels.includes("epic") &&
        epicDetach
          ? { epicClosePolicy: "detach" as const }
          : {}),
      };
      if (action === "create" || action === "update") {
        const allLabels = [
          ...new Set(
            labels.concat(
              fun && selectedContext?.kind === "private" ? ["fun"] : [],
            ),
          ),
        ];
        const fields: Record<string, unknown> = {};
        const add = (name: string, value: unknown, changed: boolean) => {
          if (action === "create" || changed) fields[name] = value;
        };
        add("content", title, title !== base.current.title);
        add(
          "description",
          description,
          description !== base.current.description,
        );
        add("priority", priority, priority !== base.current.priority);
        add(
          "labels",
          allLabels,
          JSON.stringify(labels) !== JSON.stringify(base.current.labels) ||
            fun !== base.current.fun,
        );
        add(
          "due",
          date
            ? time
              ? taskDateTime(date, time, snapshot.timezone)
              : date
            : null,
          date !== base.current.date || time !== base.current.time,
        );
        add("deadline", deadline || null, deadline !== base.current.deadline);
        add(
          "duration",
          duration ? Number(duration) : null,
          duration !== base.current.duration,
        );
        if (action === "create" && !date) {
          delete fields.due;
        }
        if (action === "create" && !deadline) delete fields.deadline;
        if (action === "create" && !duration) delete fields.duration;
        if (recurring) {
          if ("due" in fields)
            throw new Error(
              "Wähle entweder ein Planungsdatum oder einen vollständigen Wiederholungstext mit gewünschtem Startdatum.",
            );
          fields.recurring = recurring;
        }
        if (
          taskId &&
          inspection?.task.due?.is_recurring &&
          "due" in fields &&
          !removeRecurrence
        )
          throw new Error(
            "Todoist würde die Wiederholung entfernen. Dies ausdrücklich bestätigen oder einen vollständigen neuen Wiederholungstext eingeben.",
          );
        body.fields = fields;
        if (action === "create") {
          body.projectId = project || null;
          if (section) body.sectionId = section;
          if (parent) body.parentId = parent;
        }
      }
      if (action === "comment") body.comment = comment;
      if (action === "wait")
        body.waiting = { who, subject, followUp: followUp || null };
      if (action === "move") {
        if (project) body.projectId = project;
        else if (section) body.sectionId = section;
        else if (parent) body.parentId = parent;
      }
      const hash = JSON.stringify(body);
      if (attempt.current?.hash !== hash)
        attempt.current = { hash, key: crypto.randomUUID() };
      submitted.current = {
        action,
        contextId: taskId ? context!.id : (selectedContext?.id ?? null),
      };
      const result = await api("/api/tasks/submit", {
        ...body,
        key: attempt.current!.key,
      });
      setOperation({
        id: result.operationId,
        status: "queued",
        code: null,
        retryAt: null,
        result: null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Änderung fehlgeschlagen.");
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }
  return (
    <div className="task-dialog-backdrop">
      <section
        className="task-dialog card"
        ref={dialogRoot}
        tabIndex={-1}
        onChangeCapture={() => {
          touched.current = true;
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            requestClose();
            return;
          }
          if (e.key !== "Tab") return;
          const elements = [
            ...e.currentTarget.querySelectorAll<HTMLElement>(
              "button,input,textarea,select,a[href]",
            ),
          ].filter(
            (x) => !x.matches(":disabled") && x.getClientRects().length > 0,
          );
          const first = elements[0],
            last = elements.at(-1);
          if (
            e.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === e.currentTarget)
          ) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-label={taskId ? "Aufgabe bearbeiten" : "Aufgabe erfassen"}
      >
        <div className="panel-heading">
          <h2>{taskId ? "Aufgabe bearbeiten" : "Eine neue Aufgabe"}</h2>
          <button type="button" onClick={requestClose}>
            Abbrechen
          </button>
        </div>
        <div className="ai-mode-switch">
          <button
            type="button"
            aria-pressed={aiMode === "form"}
            onClick={() => setAiMode("form")}
          >
            Formular
          </button>
          {!taskId ? (
            <button
              type="button"
              aria-pressed={aiMode === "capture"}
              onClick={() => setAiMode("capture")}
            >
              KI-Modus
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setAiMode("progress")}>
                Fortschritt dokumentieren
              </button>
              <button type="button" onClick={() => setAiMode("clarification")}>
                Aufgabenklärung
              </button>
            </>
          )}
        </div>
        {!taskId && (
          <div hidden={aiMode !== "capture"}>
            <AiDraftPanel
              kind="capture"
              active={aiMode === "capture"}
              snapshot={snapshot}
              manualFields={{
                ...(title ? { content: title } : {}),
                ...(description ? { description } : {}),
                ...(duration ? { duration: Number(duration) } : {}),
                ...(date ? { due: date } : {}),
                ...(deadline ? { deadline } : {}),
                priority,
                ...(labels.length ? { labels } : {}),
              }}
            />
          </div>
        )}
        {taskId && context && (
          <>
            <div hidden={aiMode !== "progress"}>
              <AiDraftPanel
                kind="progress"
                active={aiMode === "progress"}
                expectedInstanceKey={expectedInstanceKey}
                contextId={context.id}
                taskId={taskId}
                snapshot={snapshot}
              />
            </div>
            <div hidden={aiMode !== "clarification"}>
              <AiDraftPanel
                kind="clarification"
                active={aiMode === "clarification"}
                expectedInstanceKey={expectedInstanceKey}
                contextId={context.id}
                taskId={taskId}
                snapshot={snapshot}
              />
            </div>
          </>
        )}
        {taskId && !inspection && (
          <p role="status">Aktuelle Todoist-Quelle wird geladen …</p>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {operation && (
          <p role="status">
            {operation.status === "succeeded"
              ? "Extern nachgewiesen."
              : operation.status === "queued" || operation.status === "running"
                ? "Änderung angenommen. Externer Nachweis steht aus."
                : (taskError[operation.code ?? ""] ??
                  "Änderung nicht bestätigt.")}
          </p>
        )}
        {operation && <TaskOperationEvidence operation={operation} />}
        {operation &&
          ["unknown", "failed", "partial"].includes(operation.status) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void api("/api/tasks/resume", { operationId: operation.id })
                  .then(() => setOperation({ ...operation, status: "queued" }))
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              Originale Änderung prüfen und bewusst fortsetzen
            </button>
          )}
        {inspection && (
          <div className="task-source">
            <p>
              Quelle:{" "}
              {inspection.task.checked
                ? "nativ abgeschlossen"
                : (inspection.sections.find(
                    (s) => s.id === inspection.task.section_id,
                  )?.name ?? "ohne Abschnitt")}{" "}
              · {inspection.task.parent_id ? "Unteraufgabe" : "Hauptaufgabe"}
              {inspection.task.due?.is_recurring ? " · wiederholend" : ""}
            </p>
            {inspection.children.length > 0 && (
              <p>
                Betroffene Unteraufgaben:{" "}
                {inspection.children.map((c) => c.content).join(", ")}
              </p>
            )}
            {inspection.task.due?.is_recurring && (
              <p>
                Aktuelle Wiederholung:{" "}
                {inspection.task.due.string ??
                  "Von Todoist als wiederholend gemeldet"}
              </p>
            )}
            <details>
              <summary>Kommentare und vorhandene Beschreibung</summary>
              <pre>{inspection.task.description}</pre>
              {inspection.links.map((link) => (
                <p key={link.url}>
                  <a href={link.url} target="_blank" rel="noopener noreferrer">
                    {link.label}
                  </a>
                </p>
              ))}
              {inspection.task.parent_id && (
                <a
                  href={
                    "/tasks?context=" +
                    context!.id +
                    "&task=" +
                    encodeURIComponent(inspection.task.parent_id)
                  }
                >
                  Oberaufgabe öffnen
                </a>
              )}
              {inspection.comments.map((c) => (
                <p key={c.id}>{c.content}</p>
              ))}
            </details>
          </div>
        )}
        {inspection && context && (
          <details className="ux-editor-document">
            <summary>Ziel, Checkliste & Links</summary>
            <TaskDocument
              key={inspection.basis}
              context={context}
              taskId={inspection.task.id}
              snapshot={snapshot}
            />
          </details>
        )}
        <fieldset
          hidden={aiMode !== "form"}
          disabled={
            busy ||
            (!!taskId && !inspection) ||
            (!!operation && ["queued", "running"].includes(operation.status))
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit(taskId ? "update" : "create");
            }}
          >
            <label>
              Titel
              <input
                required
                maxLength={500}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Beschreibung
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <div className="task-fields">
              <label>
                <span>Priorität</span>
                <select
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                >
                  {[4, 3, 2, 1].map((v) => (
                    <option key={v} value={v}>
                      P{5 - v}
                    </option>
                  ))}
                </select>
              </label>
              <LabelPicker
                value={labels}
                onChange={(next) => {
                  touched.current = true;
                  setLabels(next);
                }}
              />
            </div>
            <details className="ux-editor-planning">
              <summary>Planung · Datum, Dauer & Deadline</summary>
              <div className="task-fields">
                <label>
                  Geplantes Datum
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label>
                  Geplante Uhrzeit ({snapshot.timezone ?? "Europe/Zurich"})
                  <input
                    type="time"
                    disabled={!date}
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </label>
                {taskId && (
                  <label>
                    Neue Wiederholung (vollständiger Todoist-Text, Englisch)
                    <input
                      value={recurring}
                      placeholder="every week starting 2026-11-01"
                      onChange={(e) => setRecurring(e.target.value)}
                    />
                  </label>
                )}
                {inspection?.task.due?.is_recurring && (
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={removeRecurrence}
                      onChange={(e) => setRemoveRecurrence(e.target.checked)}
                    />
                    Wiederholung entfernen: geändertes oder geleertes
                    Planungsdatum ausdrücklich bestätigen
                  </label>
                )}
                <label>
                  Echte Deadline
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </label>
                <label>
                  Dauer in Minuten
                  <input
                    type="number"
                    min={1}
                    max={14400}
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                </label>
              </div>
            </details>
            {selectedContext?.kind === "private" && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={fun}
                  onChange={(e) => setFun(e.target.checked)}
                />
                Freiwillig / Spass (fun)
              </label>
            )}
            {!taskId && (
              <>
                <label>
                  Todoist-Projekt
                  <select
                    value={project}
                    onChange={(e) => {
                      setProject(e.target.value);
                      setSection("");
                      setParent("");
                      setFun(false);
                    }}
                  >
                    <option value="">
                      Keine Projektwahl → nativer Eingang
                    </option>
                    {snapshot.projects
                      .filter((p) => p.available && !p.inbox)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
                {project && (
                  <>
                    <label>
                      Abschnitt (optional)
                      <select
                        value={section}
                        disabled={!!parent}
                        onChange={(e) => setSection(e.target.value)}
                      >
                        <option value="">Kein Abschnitt gewählt</option>
                        {options.sections.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Oberaufgabe (optional)
                      <select
                        value={parent}
                        onChange={(e) => {
                          setParent(e.target.value);
                          setSection("");
                        }}
                      >
                        <option value="">Eigenständige Aufgabe</option>
                        {options.parents.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.content}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <label>
                  Wiederholung (Todoist-Text, Englisch, optional)
                  <input
                    placeholder="every week"
                    value={recurring}
                    onChange={(e) => setRecurring(e.target.value)}
                  />
                </label>
              </>
            )}
            <button
              type="submit"
              disabled={pending || (!!taskId && !inspection)}
            >
              {taskId ? "Änderungen bewusst bestätigen" : "Aufgabe erstellen"}
            </button>
          </form>
          {taskId && inspection && (
            <details className="ux-editor-actions">
              <summary>Weitere bewusste Aktionen</summary>
              <label>
                Kommentar
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={pending || !comment.trim()}
                onClick={() => void submit("comment")}
              >
                Kommentar hinzufügen
              </button>
              <h3>Verschieben</h3>
              <p>
                Genau ein Ziel wählen. Abschnitts-/Projektwechsel einer
                Unteraufgabe löst sie von ihrer Oberaufgabe; Kinder einer
                Oberaufgabe werden mitverschoben.
              </p>
              <label>
                Zielprojekt
                <select
                  value={project}
                  onChange={(e) => {
                    setProject(e.target.value);
                    setSection("");
                    setParent("");
                  }}
                >
                  <option value="">Kein Projektwechsel</option>
                  {snapshot.projects
                    .filter((p) => p.available)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Zielabschnitt
                <select
                  value={section}
                  onChange={(e) => {
                    setSection(e.target.value);
                    setProject("");
                    setParent("");
                  }}
                >
                  <option value="">Kein Abschnittswechsel</option>
                  {inspection.sections.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Neue Oberaufgabe (Todoist-ID, optional)
                <input
                  value={parent}
                  onChange={(e) => {
                    setParent(e.target.value);
                    setProject("");
                    setSection("");
                  }}
                />
              </label>
              <button
                type="button"
                disabled={pending || !(project || section || parent)}
                onClick={() => void submit("move")}
              >
                Verschieben bestätigen
              </button>
              <h3>Wartedetails</h3>
              <label>
                Wartet auf
                <input value={who} onChange={(e) => setWho(e.target.value)} />
              </label>
              <label>
                Gegenstand
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </label>
              <label>
                Nachfassen am
                <input
                  type="date"
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                />
              </label>
              <p>
                Als Hinweis in der Beschreibung; es wird keine Nachfassaufgabe
                erzeugt.
              </p>
              <button
                type="button"
                disabled={pending || !who.trim() || !subject.trim()}
                onClick={() => void submit("wait")}
              >
                Warten bewusst bestätigen
              </button>
              {(inspection.task.parent_id ||
                inspection.children.length > 0) && (
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={hierarchy}
                    onChange={(e) => setHierarchy(e.target.checked)}
                  />
                  {inspection.task.labels.includes("epic")
                    ? "Ich bestätige die angezeigte Hierarchiewirkung. Für den Epic-Abschluss gilt ausschliesslich die unten ausdrücklich gewählte Trennung; beim Löschen werden Kinder mitgelöscht."
                    : "Ich bestätige die angezeigte Hierarchiewirkung: bei Abschnittswechseln Unteraufgabe abtrennen, bei Oberaufgaben alle angezeigten Kinder mitverschieben beziehungsweise mitabschliessen oder mitlöschen."}
                </label>
              )}
              {inspection.task.labels.includes("epic") && (
                <section className="card">
                  <h3>Epic manuell abschliessen</h3>
                  {inspection.task.due?.is_recurring && (
                    <p>
                      Ein wiederholendes Epic kann nicht dauerhaft geschlossen
                      werden. Wiederholung zuerst bewusst im Formular ändern
                      oder entfernen.
                    </p>
                  )}
                  {inspection.children.length > 0 && (
                    <>
                      <p>
                        Der native Todoist-Abschluss würde offene Kinder
                        mitabschliessen. Helios trennt deshalb die folgenden
                        offenen Teilbäume vor dem Abschluss:
                      </p>
                      <ul>
                        {inspection.children.map((c) => (
                          <li key={c.id}>
                            {c.content} ·{" "}
                            {c.parentId === inspection.task.id
                              ? "direktes Kind wird eigenständig"
                              : "bleibt innerhalb des getrennten Teilbaums"}
                          </li>
                        ))}
                      </ul>
                      <p>
                        Direkte offene Kinder werden im gleichen Projekt
                        eigenständige Hauptaufgaben ohne Abschnitt. Ihre Kinder
                        bleiben angehängt. IDs, Inhalte, Kommentare und
                        historische Planreferenzen bleiben erhalten. Die
                        bestehende Tagesauswahl wird nicht ergänzt. Ein neuer
                        Vorschlag wird später bewusst geprüft. Das Epic wird
                        erst nach vollständigem Nachweis nach Abgeschlossen
                        verschoben und nativ geschlossen. Bei Fehlern bleibt es
                        offen; bereits erfolgte Trennungen stehen im Journal.
                      </p>
                      <label>
                        <input
                          type="checkbox"
                          checked={epicDetach}
                          onChange={(e) => setEpicDetach(e.target.checked)}
                        />
                        Alle angezeigten offenen Teilbäume bewusst trennen und
                        anschliessend Epic abschliessen
                      </label>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setEpicDetach(false);
                          setDestructive(false);
                        }}
                      >
                        Abbrechen – keine neue Änderung ausführen
                      </button>
                    </>
                  )}
                </section>
              )}
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={destructive}
                  onChange={(e) => setDestructive(e.target.checked)}
                />
                Ich bestätige ausdrücklich den Abschluss beziehungsweise die
                endgültige Löschung dieser Aufgabe.
              </label>
              <button
                type="button"
                disabled={
                  pending ||
                  !destructive ||
                  !!inspection.task.checked ||
                  (inspection.task.labels.includes("epic") &&
                    (!!inspection.task.due?.is_recurring ||
                      (inspection.children.length > 0 && !epicDetach)))
                }
                onClick={() => void submit("close")}
              >
                Aufgabe abschliessen
              </button>
              <button
                type="button"
                className="danger"
                disabled={pending || !destructive}
                onClick={() => void submit("delete")}
              >
                Aufgabe endgültig löschen
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void loadSource()}
              >
                Aktuelle Quelle neu laden und Entwurf ersetzen
              </button>
            </details>
          )}
        </fieldset>
      </section>
    </div>
  );
}

function documentSummary(change: import("@helios/contracts").DocumentChange) {
  if (change.kind === "goal") return "Ziel: " + change.value;
  if (change.kind === "checklist")
    return change.items
      .map((p) => (p.checked ? "☑ " : "☐ ") + p.text)
      .join("\n");
  return change.label + " · " + change.url;
}
