"use client";
import { documentDraftChanges } from "./document-save";
import { TaskSaveDialog } from "./task-save-dialog";
import type { DocumentController } from "./use-task-document";
import { useSearchParams } from "next/navigation";
import {
  dateLabel,
  taskDateLabel,
  taskDateInputs,
  taskDateTime,
} from "./task-dates";
import { TaskAccordion } from "./task-accordion";
import { TaskComments } from "./task-comments";
import {
  TaskActionDialog,
  actionIcons,
  actionTitles,
  type TaskAction,
  type ActionAcknowledgement,
  type ActionFields,
} from "./task-action-dialog";
import { type DocumentUiState } from "./task-document";
import { TaskOperationEvidence } from "./task-operation-evidence";
import { nativeTaskOrder } from "./task-list-order";
import { UiDialog, InfoTip } from "./ui-help";
import { Icon } from "@helios/ui";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  taskSavePreview,
  entryKey,
  type ContextView,
  type WorkSnapshot,
  type TaskView,
  type TaskInspection,
  type TaskCommand,
  type TaskSavePreview,
  type DocumentChange,
  type TaskOperationView,
} from "@helios/contracts";
import type { ReactNode } from "react";
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
const cardActionIcons = {
  edit: "edit",
  close: "check",
  delete: "trash",
} as const;
function plannedValue(date: string, time: string, timezone?: string) {
  if (!date) return null;
  return time ? taskDateTime(date, time, timezone) : date;
}
function operationStatus(operation: TaskOperationView) {
  if (operation.status === "succeeded") return "Extern nachgewiesen.";
  if (["queued", "running"].includes(operation.status))
    return "Änderung angenommen. Externer Nachweis steht aus.";
  return taskError[operation.code ?? ""] ?? "Änderung nicht bestätigt.";
}
function commandDestination(
  action: TaskCommand["action"],
  project: string,
  section: string,
  parent: string,
) {
  if (action === "create")
    return {
      projectId: project || null,
      ...(section ? { sectionId: section } : {}),
      ...(parent ? { parentId: parent } : {}),
    };
  if (action === "move") {
    if (project) return { projectId: project };
    if (section) return { sectionId: section };
    if (parent) return { parentId: parent };
  }
  return {};
}
class TaskApiFailure extends Error {
  constructor(
    message: string,
    readonly uncertain = false,
  ) {
    super(message);
  }
}
async function api(path: string, body?: unknown, readOnly = false) {
  const writing = body !== undefined && !readOnly;
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new TaskApiFailure(
      !writing
        ? "Verbindung unterbrochen. Die Daten konnten nicht geladen werden; vorhandene Eingaben bleiben erhalten."
        : "Verbindung unterbrochen. Der Schreibauftrag ist möglicherweise angekommen; zuerst das Journal prüfen und nicht erneut senden.",
      writing,
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new TaskApiFailure(
      !writing
        ? "Antwort nicht sicher lesbar. Quelle erneut laden; vorhandene Eingaben bleiben erhalten."
        : "Antwort nicht sicher lesbar. Den Auftragsnachweis im Journal prüfen.",
      writing,
    );
  }
  if (!response.ok)
    throw new TaskApiFailure(
      data.error?.message ?? "Die Anfrage ist fehlgeschlagen.",
      writing && response.status >= 500,
    );
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
  TASK_SAVE_OVERLAP:
    "Beschreibung und strukturierte Felder ändern denselben Abschnitt. Bitte die überschneidenden Eingaben zuerst abgleichen; alle Eingaben bleiben erhalten.",
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
    [editing, setEditing] = useState<string | null>(null),
    [initialAction, setInitialAction] = useState<TaskAction | null>(null);
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
        setInitialAction(null);
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
              <span className="task-entry-chevron" aria-hidden="true">
                <Icon name="chevron" />
              </span>
            </summary>
            {renderTask(t)}
            <div className="task-card-actions">
              {(["edit", "close", "delete"] as const).map((kind) => (
                <button
                  type="button"
                  key={kind}
                  className={
                    kind === "delete" ? "task-delete secondary" : "secondary"
                  }
                  onClick={() => {
                    setInitialMode("form");
                    setInitialAction(kind === "edit" ? null : kind);
                    setEditing(t.data.id);
                  }}
                >
                  <Icon name={cardActionIcons[kind]} />
                  {kind === "edit" ? "Bearbeiten" : actionTitles[kind]}
                </button>
              ))}
            </div>
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
          <label className="progress-task-search">
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
                    setInitialAction(null);
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
          initialAction={initialAction}
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
  initialAction = null,
  expectedInstanceKey,
}: {
  snapshot: WorkSnapshot;
  context?: ContextView;
  taskId?: string;
  close: () => void;
  initialMode?: "form" | "progress" | "clarification";
  initialAction?: TaskAction | null;
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
    [fun, setFun] = useState(false),
    [recurring, setRecurring] = useState(""),
    [removeRecurrence, setRemoveRecurrence] = useState(false);
  const [actionDialog, setActionDialog] = useState<TaskAction | null>(
    initialAction,
  );
  const [documentState, setDocumentState] = useState<DocumentUiState>({
    dirty: false,
    pending: false,
  });
  const documentRef = useRef<DocumentController | null>(null);
  const [savePreview, setSavePreview] = useState<{
    preview: TaskSavePreview;
    body: Record<string, unknown>;
    documents: DocumentChange[];
  } | null>(null);
  const [documentEpoch, setDocumentEpoch] = useState(0);
  const [requestUncertain, setRequestUncertain] = useState(false);
  const [aiTouched, setAiTouched] = useState(false);
  const [instanceChanged, setInstanceChanged] = useState(false);
  const formId = useId();
  const formValues = {
    title,
    description,
    priority,
    labels,
    date,
    time,
    deadline,
    duration,
    fun,
  };
  const valuesRef = useRef(formValues);
  useEffect(() => {
    valuesRef.current = formValues;
  });
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
  const [baseValues, setBaseValues] = useState<Record<string, unknown>>({});
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
      setDocumentEpoch((value) => value + 1);
      const t = data.task;
      if (
        expectedInstanceKey &&
        entryKey({ taskId: t.id, source: t }) !== expectedInstanceKey
      )
        throw new Error(
          "Die Aufgabeninstanz wurde geändert. Historischen Review erneut prüfen.",
        );
      setInstanceChanged(false);
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
      setBaseValues(values);
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
  const acceptOperation = useCallback(
    (row: TaskOperationView) => {
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
    },
    [taskId],
  );
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
            if (alive && row) acceptOperation(row);
          })
          .catch(() => {}),
      1500,
    );
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [operation?.id, operation?.status, acceptOperation]);
  const pending =
    busy ||
    requestUncertain ||
    instanceChanged ||
    documentState.pending ||
    (!!operation &&
      ["queued", "running", "unknown", "partial"].includes(operation.status));
  const formDirty = taskId
    ? !!inspection &&
      (Object.keys(formValues).some(
        (key) =>
          JSON.stringify(formValues[key as keyof typeof formValues]) !==
          JSON.stringify(baseValues[key]),
      ) ||
        !!recurring ||
        removeRecurrence)
    : !!(
        title ||
        description ||
        project ||
        labels.length ||
        date ||
        deadline ||
        duration ||
        recurring ||
        fun ||
        time ||
        priority !== 1 ||
        section ||
        parent
      );
  const dirty = formDirty || documentState.dirty || aiTouched;
  useNavigationLock(pending || dirty);

  function requestClose() {
    if (
      busy ||
      documentState.running ||
      (operation && ["queued", "running"].includes(operation.status))
    ) {
      setError(
        "Die Änderung wird noch verarbeitet. Eingaben bleiben erhalten; zuerst den externen Nachweis abwarten.",
      );
      return;
    }
    if (
      requestUncertain ||
      documentState.uncertain ||
      (operation && ["unknown", "partial"].includes(operation.status))
    ) {
      if (
        !window.confirm(
          "Das Ergebnis ist ungeklärt. Das Operationsjournal vor weiteren Änderungen prüfen. Dialog schliessen, ohne erneut zu schreiben?",
        )
      )
        return;
    } else if (dirty && !window.confirm("Entwurf verwerfen?")) return;
    close();
  }
  function canSubmit(action: TaskCommand["action"], confirmed: boolean) {
    if (["close", "delete"].includes(action) && !confirmed) return false;
    if (
      (action === "update" || action === "create") &&
      documentState.dirty &&
      !confirmed
    ) {
      setError(
        "Ziel, Checkliste oder Dokumentenlinks enthalten ungespeicherte Eingaben. Bitte deren Vorschau prüfen und ausdrücklich bestätigen, bevor das Grundformular gespeichert wird.",
      );
      return false;
    }
    if (
      ["create", "update"].includes(action) &&
      aiTouched &&
      !window.confirm(
        "Nur die Grundinformationen speichern? Ungespeicherte KI-Eingaben werden dabei verworfen; gespeicherte KI-Entwürfe und nachgewiesene Änderungen bleiben erhalten.",
      )
    )
      return false;
    return true;
  }
  function coreFields(action: TaskCommand["action"]) {
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
    add("description", description, description !== base.current.description);
    add("priority", priority, priority !== base.current.priority);
    add(
      "labels",
      allLabels,
      JSON.stringify(labels) !== JSON.stringify(base.current.labels) ||
        fun !== base.current.fun,
    );
    add(
      "due",
      plannedValue(date, time, snapshot.timezone),
      date !== base.current.date || time !== base.current.time,
    );
    add("deadline", deadline || null, deadline !== base.current.deadline);
    add(
      "duration",
      duration ? Number(duration) : null,
      duration !== base.current.duration,
    );
    if (action === "create") {
      for (const [key, value] of Object.entries({
        due: date,
        deadline,
        duration,
      })) {
        if (!value) delete fields[key];
      }
    }
    validateRecurrence(fields);
    return fields;
  }
  function validateRecurrence(fields: Record<string, unknown>) {
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
  }
  function buildSubmission(
    action: TaskCommand["action"],
    confirmed: boolean,
    acknowledgements?: ActionAcknowledgement,
  ) {
    const body: Record<string, unknown> = {
      action,
      contextId: taskId ? context!.id : (selectedContext?.id ?? null),
      ...(taskId ? { taskId, basis: inspection?.basis } : {}),
      acknowledgeHierarchy: acknowledgements?.hierarchy ?? false,
      acknowledgeDestructive: confirmed && ["close", "delete"].includes(action),
      acknowledgeRecurrenceChange: removeRecurrence,
      ...(action === "close" &&
      inspection?.task.labels.includes("epic") &&
      acknowledgements?.epicDetach
        ? { epicClosePolicy: "detach" as const }
        : {}),
    };
    if (action === "create" || action === "update") {
      body.fields = coreFields(action);
    }
    Object.assign(body, commandDestination(action, project, section, parent));
    if (action === "comment") body.comment = comment;
    if (action === "wait")
      body.waiting = { who, subject, followUp: followUp || null };
    return body;
  }
  async function checkSubmittedJournal() {
    setBusy(true);
    try {
      const rows: TaskOperationView[] = await api("/api/tasks");
      const row = rows.find(
        (r) => !!attempt.current?.key && r.input?.key === attempt.current.key,
      );
      if (row) {
        setRequestUncertain(false);
        acceptOperation(row);
      } else
        setError(
          "Noch kein eindeutig zuordenbarer Journalnachweis verfügbar. Eingaben und Auftrag bleiben ungeklärt; nicht erneut senden.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Journal nicht verfügbar.");
    } finally {
      setBusy(false);
    }
  }
  async function requestSave() {
    if (pending || submitLock.current) return;
    if (!taskId) {
      await submit("create");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const documents = documentDraftChanges(documentRef.current);
      if (
        documents.length &&
        documentRef.current?.detail?.inspection.basis !== inspection?.basis
      )
        throw new Error(
          "Die Dokumententwürfe beruhen auf einer anderen Quellfassung. Bitte Quelle und Eingaben abgleichen; alle Eingaben bleiben erhalten.",
        );
      const body = buildSubmission("update", false);
      if (documents.length) body.documents = documents;
      const fields = body.fields as Record<string, unknown>;
      if (!documents.length && !Object.keys(fields).length) {
        setError("Keine geänderten Aufgabeninformationen vorhanden.");
        return;
      }
      const response = await api(
        "/api/tasks/preview",
        {
          contextId: body.contextId,
          taskId,
          basis: body.basis,
          fields,
          documents,
          acknowledgeRecurrenceChange: removeRecurrence,
        },
        true,
      );
      const parsed = taskSavePreview.safeParse(response);
      if (
        !parsed.success ||
        parsed.data.basis !== body.basis ||
        parsed.data.before.id !== taskId
      )
        throw new Error(
          "Die Änderungsvorschau ist nicht vollständig oder passt nicht zur Aufgabe. Deine Eingaben bleiben erhalten.",
        );
      setSavePreview({ preview: parsed.data, body, documents });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Änderungen konnten nicht geprüft werden.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit(
    action: TaskCommand["action"],
    confirmed = false,
    acknowledgements?: ActionAcknowledgement,
    preparedBody?: Record<string, unknown>,
  ) {
    if (submitLock.current || pending || !canSubmit(action, confirmed)) return;
    submitLock.current = true;
    setError("");
    setBusy(true);
    try {
      const body =
        preparedBody ?? buildSubmission(action, confirmed, acknowledgements);
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
      if (typeof result?.operationId !== "string" || !result.operationId.trim())
        throw new TaskApiFailure(
          "Auftragsantwort nicht sicher auswertbar. Den ursprünglichen Auftrag im Journal prüfen; nicht erneut senden.",
          true,
        );
      setOperation({
        id: result.operationId,
        status: "queued",
        code: null,
        retryAt: null,
        result: null,
      });
    } catch (e) {
      if (e instanceof TaskApiFailure && e.uncertain) setRequestUncertain(true);
      setError(e instanceof Error ? e.message : "Änderung fehlgeschlagen.");
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }
  function changeActionField(key: keyof ActionFields, value: string) {
    const setters = {
      project: setProject,
      section: setSection,
      parent: setParent,
      comment: setComment,
      who: setWho,
      subject: setSubject,
      followUp: setFollowUp,
    };
    setters[key](value);
  }
  async function refreshDocumentSource() {
    if (!taskId || !context) return;
    setBusy(true);
    try {
      const data: TaskInspection = await api(
        "/api/tasks?" + new URLSearchParams({ contextId: context.id, taskId }),
      );
      const t = data.task,
        dates = taskDateInputs(t.due, snapshot.timezone);
      if (
        expectedInstanceKey &&
        entryKey({ taskId: t.id, source: t }) !== expectedInstanceKey
      ) {
        setInstanceChanged(true);
        throw new Error(
          "Die Aufgabeninstanz wurde geändert. Historischen Review erneut prüfen.",
        );
      }
      const next = {
        title: t.content,
        description: t.description,
        priority: t.priority,
        labels: t.labels.filter(
          (x) => context.kind !== "private" || x !== "fun",
        ),
        date: dates.date,
        time: dates.time,
        deadline: t.deadline?.date ?? "",
        duration:
          t.duration?.unit === "minute" ? String(t.duration.amount) : "",
        fun: t.labels.includes("fun"),
      };
      const current = valuesRef.current;
      const keys = Object.keys(next) as (keyof typeof next)[];
      const changed = (a: unknown, b: unknown) =>
        JSON.stringify(a) !== JSON.stringify(b);
      if (
        keys.some(
          (key) =>
            changed(current[key], base.current[key]) &&
            changed(next[key], base.current[key]) &&
            changed(current[key], next[key]),
        )
      ) {
        setError(
          "Die gespeicherte Quelle überschneidet sich mit deinen ungespeicherten Eingaben. Eingaben bleiben erhalten. Quelle und Entwurf vor dem Speichern vergleichen.",
        );
        return;
      }
      function adopt<K extends keyof typeof next>(
        key: K,
        set: (value: (typeof next)[K]) => void,
      ) {
        if (!changed(current[key], base.current[key])) set(next[key]);
      }
      adopt("title", setTitle);
      adopt("description", setDescription);
      adopt("priority", setPriority);
      adopt("labels", setLabels);
      adopt("date", setDate);
      adopt("time", setTime);
      adopt("deadline", setDeadline);
      adopt("duration", setDuration);
      adopt("fun", setFun);
      base.current = next;
      setBaseValues(next);
      setInspection(data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Aktuelle Quelle nicht verfügbar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="task-dialog-backdrop">
      <section
        className="task-dialog card task-editor"
        ref={dialogRoot}
        tabIndex={-1}
        onChangeCapture={(event) => {
          if ((event.target as HTMLElement).closest(".ai-panel"))
            setAiTouched(true);
        }}
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).closest("dialog")) return;
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
        </div>
        <div className="task-editor-scroll">
          <fieldset
            className="ai-mode-switch"
            disabled={pending}
            aria-label="Bearbeitungsmodus"
          >
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
                <button
                  type="button"
                  onClick={() => setAiMode("clarification")}
                >
                  Aufgabenklärung
                </button>
              </>
            )}
          </fieldset>
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
          {error && !savePreview && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {operation && !savePreview && (
            <p>
              <output>{operationStatus(operation)}</output>
            </p>
          )}
          {operation && !savePreview && (
            <TaskOperationEvidence operation={operation} />
          )}
          {requestUncertain && !savePreview && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void checkSubmittedJournal()}
            >
              <Icon name="refresh" />
              Schreibauftrag im Journal prüfen
            </button>
          )}
          {operation &&
            ["unknown", "failed", "partial"].includes(operation.status) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void api("/api/tasks/resume", { operationId: operation.id })
                    .then(() =>
                      setOperation({ ...operation, status: "queued" }),
                    )
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                Originale Änderung prüfen und bewusst fortsetzen
              </button>
            )}
          <fieldset
            hidden={aiMode !== "form"}
            disabled={pending || (!!taskId && !inspection)}
          >
            <form
              id={formId}
              onSubmit={(e) => {
                e.preventDefault();
                void requestSave();
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
                    setLabels(next);
                  }}
                />
              </div>
              {inspection?.task.due?.is_recurring && (
                <p className="help">
                  Aktuelle Wiederholung:{" "}
                  {inspection.task.due.string ??
                    "Von Todoist als wiederholend gemeldet"}
                </p>
              )}
              <section className="task-planning-fields" aria-label="Planung">
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
              </section>
              {selectedContext?.kind === "private" && (
                <label className="task-fun-switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={fun}
                    onChange={(e) => setFun(e.target.checked)}
                  />
                  <span className="task-switch-track" aria-hidden="true" />
                  <span>Freiwillig / Spass</span>
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
            </form>
            {inspection && context && (
              <TaskDocument
                key={taskId + ":" + documentEpoch}
                context={context}
                taskId={inspection.task.id}
                snapshot={snapshot}
                controllerRef={documentRef}
                onRequestSave={() => void requestSave()}
                onStateChange={setDocumentState}
                onVerified={refreshDocumentSource}
                sourceControls={false}
              />
            )}
            {inspection && <TaskComments comments={inspection.comments} />}
            {inspection && (
              <TaskAccordion title="Technische Details">
                <dl>
                  <dt>Todoist-ID</dt>
                  <dd>{inspection.task.id}</dd>
                  <dt>Projekt-ID</dt>
                  <dd>{inspection.task.project_id}</dd>
                  <dt>Quellfassung</dt>
                  <dd>{inspection.basis}</dd>
                </dl>
                {inspection.task.parent_id && (
                  <p>Oberaufgaben-ID: {inspection.task.parent_id}</p>
                )}
                <button
                  type="button"
                  className="secondary"
                  disabled={pending}
                  onClick={() => {
                    if (
                      !dirty ||
                      window.confirm(
                        "Ungespeicherte Eingaben durch die aktuelle Quelle ersetzen?",
                      )
                    ) {
                      void loadSource();
                    }
                  }}
                >
                  Aktuelle Quelle neu laden und Entwurf ersetzen
                </button>
              </TaskAccordion>
            )}
          </fieldset>
        </div>
        <footer className="task-editor-toolbar" aria-label="Aufgabenaktionen">
          <button type="button" className="secondary" onClick={requestClose}>
            <Icon name="close" />
            Abbrechen
          </button>
          {
            <button
              type="submit"
              form={formId}
              disabled={
                aiMode !== "form" || pending || (!!taskId && !inspection)
              }
            >
              <Icon name="save" />
              {taskId ? "Speichern" : "Aufgabe erstellen"}
            </button>
          }
          {taskId &&
            (["close", "delete", "move", "wait", "comment"] as const).map(
              (kind) => (
                <button
                  type="button"
                  key={kind}
                  className={
                    kind === "delete" ? "secondary task-delete" : "secondary"
                  }
                  disabled={
                    aiMode !== "form" ||
                    pending ||
                    !inspection ||
                    (kind === "close" && !!inspection.task.checked)
                  }
                  onClick={() => {
                    if (kind === "move") {
                      setProject("");
                      setSection("");
                      setParent("");
                    }
                    setError("");
                    setActionDialog(kind);
                  }}
                >
                  <Icon name={actionIcons[kind]} />
                  {actionTitles[kind]}
                </button>
              ),
            )}
        </footer>
        {savePreview && (
          <TaskSaveDialog
            preview={savePreview.preview}
            checkJournal={
              requestUncertain ? () => void checkSubmittedJournal() : undefined
            }
            documents={savePreview.documents}
            pending={pending}
            processing={
              busy || ["queued", "running"].includes(operation?.status ?? "")
            }
            error={error}
            operation={operation}
            close={() => setSavePreview(null)}
            confirm={() =>
              void submit("update", true, undefined, savePreview.body)
            }
          />
        )}
        {actionDialog && inspection && (
          <TaskActionDialog
            key={actionDialog}
            action={actionDialog}
            inspection={inspection}
            snapshot={snapshot}
            fields={{
              project,
              section,
              parent,
              comment,
              who,
              subject,
              followUp,
            }}
            change={changeActionField}
            dirty={dirty}
            pending={pending}
            processing={
              busy ||
              (!!operation && ["queued", "running"].includes(operation.status))
            }
            error={error}
            operation={operation}
            close={() => {
              setActionDialog(null);
              if (
                !requestUncertain &&
                (!operation ||
                  !["unknown", "partial"].includes(operation.status))
              ) {
                setComment("");
                setWho(inspection.waiting?.who ?? "");
                setSubject(inspection.waiting?.subject ?? "");
                setFollowUp(inspection.waiting?.followUp ?? "");
                setProject("");
                setSection("");
                setParent("");
              }
            }}
            confirm={(ack) => void submit(actionDialog, true, ack)}
          />
        )}
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
