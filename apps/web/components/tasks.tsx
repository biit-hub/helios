"use client";
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
  OUTCOME_UNKNOWN:
    "Das Ergebnis ist ungeklärt. Zuerst in Todoist prüfen; es wird nicht blind erneut geschrieben.",
  TASK_SOURCE_CONFLICT:
    "Todoist wurde zwischenzeitlich geändert. Die Eingaben bleiben erhalten. Quelle neu laden und Änderungen erneut prüfen.",
  TODOIST_PERMISSION:
    "Todoist erlaubt diese Änderung mit diesem Konto nicht. Die Eingaben bleiben erhalten.",
  TASK_SCOPE_CONFLICT:
    "Die Projektzuordnung hat sich geändert. Bitte Quelle und Kontext prüfen.",
  SECTION_MISSING:
    "Benötigte Abschnitte fehlen. Diese zuerst bewusst einrichten.",
  HIERARCHY_CONFIRMATION_REQUIRED:
    "Diese Aktion betrifft die Hierarchie. Bitte die Auswirkung ausdrücklich bestätigen.",
  EPIC_CHILDREN_POLICY:
    "Der gesonderte Epic-Abschluss mit offenen Kindern folgt in E8.",
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
    [editing, setEditing] = useState<string | null>(() =>
      typeof window === "undefined"
        ? null
        : new URL(window.location.href).searchParams.get("task"),
    ),
    [error, setError] = useState(""),
    [setup, setSetup] = useState(false);
  const visible = tasks.filter(
    (t) =>
      (
        t.data.content +
        " " +
        t.data.description +
        " " +
        t.data.labels.join(" ")
      )
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()) &&
      (status === "all" ||
        (status === "unknown"
          ? t.state === "unknown"
          : status === "completed"
            ? t.state === "completed" || t.data.checked
            : t.sectionName === status)),
  );
  return (
    <>
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
            <option value="completed">Nativ abgeschlossen</option>
            <option value="unknown">Unbekannt</option>
          </select>
        </label>
        <button type="button" onClick={() => setSetup(!setup)}>
          Kanban-Abschnitte einrichten
        </button>
      </div>
      {setup && (
        <section className="card">
          <p>
            Nur im zugeordneten Projekt «
            {snapshot.projects.find((p) => p.id === context.projectId)?.name}»
            fehlende Abschnitte Offen, In Arbeit, Wartet und Abgeschlossen
            anlegen. Bestehende Aufgaben bleiben unverändert.
          </p>
          <button
            type="button"
            onClick={() =>
              void api("/api/tasks/submit", {
                key: crypto.randomUUID(),
                action: "sections",
                contextId: context.id,
              })
                .then(() =>
                  setError(
                    "Einrichtung angenommen. Den Operationsstand unten prüfen.",
                  ),
                )
                .catch((e) => setError(e.message))
            }
          >
            Fehlende Abschnitte bewusst anlegen
          </button>
        </section>
      )}
      {error && <p role="status">{error}</p>}
      {!visible.length && tasks.length > 0 && (
        <p>Keine Aufgaben für diesen Filter.</p>
      )}
      <div className="task-list">
        {visible.map((t) => (
          <div className="task-entry" key={t.data.id}>
            {renderTask(t)}
            <button
              type="button"
              className="secondary task-open"
              aria-label={"Aufgabe öffnen und bearbeiten: " + t.data.content}
              onClick={() => setEditing(t.data.id)}
            >
              Öffnen & bearbeiten →
            </button>
          </div>
        ))}
      </div>
      {editing && (
        <TaskEditor
          key={editing}
          context={context}
          taskId={editing}
          snapshot={snapshot}
          close={() => setEditing(null)}
        />
      )}
      <TaskOperations contextId={context.id} />
    </>
  );
}
export function TaskCapture({ snapshot }: { snapshot: WorkSnapshot }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="capture-button"
        onClick={() => setOpen(true)}
      >
        ＋ Aufgabe erfassen
      </button>
      {open && <TaskEditor snapshot={snapshot} close={() => setOpen(false)} />}
    </>
  );
}
function TaskOperations({ contextId }: { contextId: string }) {
  const [operationError, setOperationError] = useState("");
  const [rows, setRows] = useState<
    (TaskOperationView & { contextId: string | null })[]
  >([]);
  useEffect(() => {
    let alive = true;
    const read = () =>
      void api("/api/tasks")
        .then((v) => {
          if (alive) setRows(v);
        })
        .catch(() => {});
    read();
    const timer = setInterval(read, 2500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const relevant = rows.filter(
    (r) => r.contextId === contextId || r.contextId === null,
  );
  return (
    relevant.length > 0 && (
      <details className="card operation-list">
        <summary>Aufgabenänderungen und Einzelergebnisse</summary>
        {operationError && <p role="alert">{operationError}</p>}
        {relevant.map((r) => (
          <div key={r.id}>
            {r.input && (
              <details>
                <summary>Bestätigte Originaleingaben</summary>
                <p>{r.input.fields?.content}</p>
                <pre>
                  {r.input.fields?.description ??
                    r.input.comment ??
                    r.input.waiting?.subject ??
                    ""}
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
                {(r.result.effects as { kind: string; status: string }[]).map(
                  (x, i) => (
                    <span key={i}>{x.kind}: nachgewiesen · </span>
                  ),
                )}
              </p>
            )}
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
function TaskEditor({
  snapshot,
  context,
  taskId,
  close,
}: {
  snapshot: WorkSnapshot;
  context?: ContextView;
  taskId?: string;
  close: () => void;
}) {
  const [inspection, setInspection] = useState<TaskInspection | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [operation, setOperation] = useState<TaskOperationView | null>(null);
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [priority, setPriority] = useState(1),
    [labels, setLabels] = useState(""),
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
      setInspection(data);
      const t = data.task;
      const d = t.due?.datetime ?? t.due?.date ?? "";
      const absolute = /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(d);
      const instant = absolute ? new Date(d) : null;
      const pad = (n: number) => String(n).padStart(2, "0");
      const values = {
        title: t.content,
        description: t.description,
        priority: t.priority,
        labels: t.labels
          .filter((x) => context?.kind !== "private" || x !== "fun")
          .join(", "),
        date: instant
          ? instant.getFullYear() +
            "-" +
            pad(instant.getMonth() + 1) +
            "-" +
            pad(instant.getDate())
          : d.slice(0, 10),
        time: instant
          ? pad(instant.getHours()) + ":" + pad(instant.getMinutes())
          : d.includes("T")
            ? d.slice(11, 16)
            : "",
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
  }, [taskId, context]);
  useEffect(() => {
    const timer = setTimeout(() => void loadSource(), 0);
    return () => clearTimeout(timer);
  }, [loadSource]);
  useEffect(() => {
    if (!operation?.id || !["queued", "running"].includes(operation.status))
      return;
    let alive = true;
    const timer = setInterval(
      () =>
        void api("/api/tasks")
          .then((rows: TaskOperationView[]) => {
            const row = rows.find((r) => r.id === operation.id);
            if (alive && row) {
              setOperation(row);
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
  }, [operation?.id, operation?.status]);
  const pending =
    busy ||
    (!!operation &&
      ["queued", "running", "unknown"].includes(operation.status));
  async function submit(action: TaskCommand["action"]) {
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
      };
      if (action === "create" || action === "update") {
        const allLabels = [
          ...new Set(
            labels
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean)
              .concat(
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
          labels !== base.current.labels || fun !== base.current.fun,
        );
        add(
          "due",
          date
            ? time
              ? new Date(date + "T" + time).toISOString()
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
    }
  }
  return (
    <div className="task-dialog-backdrop">
      <section
        className="task-dialog card"
        ref={dialogRoot}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            close();
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
          <button type="button" onClick={close}>
            Dialog schliessen / Entwurf verwerfen
          </button>
        </div>
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
              ? "Extern nachgewiesen. Zum aktuellen Stand Aufgaben aktualisieren."
              : operation.status === "queued" || operation.status === "running"
                ? "Änderung angenommen. Externer Nachweis steht aus."
                : (taskError[operation.code ?? ""] ??
                  "Änderung nicht bestätigt.")}
          </p>
        )}
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
        <fieldset
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
                Priorität
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
              <label>
                Labels (durch Komma getrennt)
                <input
                  value={labels}
                  onChange={(e) => setLabels(e.target.value)}
                />
              </label>
              <label>
                Geplantes Datum
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>
                Geplante Uhrzeit (Ortszeit dieses Browsers)
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
            <>
              <hr />
              <h3>Weitere bewusste Aktionen</h3>
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
                  Ich bestätige die angezeigte Hierarchiewirkung: bei
                  Abschnittswechseln Unteraufgabe abtrennen, bei Oberaufgaben
                  alle angezeigten Kinder mitverschieben beziehungsweise
                  mitabschliessen oder mitlöschen.
                </label>
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
                disabled={pending || !destructive}
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
            </>
          )}
        </fieldset>
      </section>
    </div>
  );
}
