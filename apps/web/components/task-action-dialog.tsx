"use client";
import { useEffect, useRef, useState } from "react";
import type {
  TaskInspection,
  TaskOperationView,
  WorkSnapshot,
} from "@helios/contracts";
import { UiDialog } from "./ui-help";
import { Icon } from "@helios/ui";
import { TaskOperationEvidence } from "./task-operation-evidence";
import { optionNames } from "./option-names";
export type TaskAction = "close" | "delete" | "move" | "wait" | "comment";
export type ActionFields = {
  project: string;
  section: string;
  parent: string;
  comment: string;
  who: string;
  subject: string;
  followUp: string;
};
export type ActionAcknowledgement = { hierarchy: boolean; epicDetach: boolean };
export const actionTitles = {
  close: "Aufgabe abschliessen",
  delete: "Aufgabe löschen",
  move: "Verschieben",
  wait: "Warten",
  comment: "Kommentar hinzufügen",
};
export function TaskActionDialog({
  action,
  inspection,
  snapshot,
  fields,
  change,
  dirty,
  pending,
  processing,
  error,
  operation,
  close,
  confirm,
}: Readonly<{
  action: TaskAction;
  inspection: TaskInspection;
  snapshot: WorkSnapshot;
  fields: ActionFields;
  change: (key: keyof ActionFields, value: string) => void;
  dirty: boolean;
  pending: boolean;
  processing: boolean;
  error: string;
  operation: TaskOperationView | null;
  close: () => void;
  confirm: (ack: ActionAcknowledgement) => void;
}>) {
  const [hierarchy, setHierarchy] = useState(false),
    [epicDetach, setEpicDetach] = useState(false),
    [discard, setDiscard] = useState(false);
  const [parents, setParents] = useState<{ id: string; content: string }[]>([]),
    [targetsError, setTargetsError] = useState("");
  const [targetKind, setTargetKind] = useState("section");
  const initialFields = useRef(fields);
  function cancel() {
    if (processing) return;
    if (
      !pending &&
      JSON.stringify(fields) !== JSON.stringify(initialFields.current) &&
      !window.confirm(
        "Ungespeicherte Eingaben in diesem Aktionsdialog verwerfen?",
      )
    )
      return;
    close();
  }
  const epic = inspection.task.labels.includes("epic"),
    children = inspection.children;
  const affectsHierarchy =
    action !== "comment" &&
    (!!inspection.task.parent_id || children.length > 0);
  useEffect(() => {
    if (action !== "move") return;
    const abort = new AbortController();
    void fetch(
      "/api/tasks?projectId=" + encodeURIComponent(inspection.task.project_id),
      { cache: "no-store", signal: abort.signal },
    )
      .then(async (r) => {
        const value = await r.json();
        if (!r.ok)
          throw Error(
            value.error?.message ?? "Verschiebeziele nicht verfügbar.",
          );
        return value;
      })
      .then((value) => {
        if (!abort.signal.aborted)
          setParents(
            value.parents.filter(
              (p: { id: string }) =>
                p.id !== inspection.task.id &&
                !children.some((c) => c.id === p.id),
            ),
          );
      })
      .catch((e) => {
        if (!abort.signal.aborted) setTargetsError(e.message);
      });
    return () => abort.abort();
  }, [action, inspection.task.project_id, inspection.task.id, children]);
  const names = optionNames(snapshot.projects, "Projekt");
  const valid =
    (!dirty || discard) &&
    (!affectsHierarchy || hierarchy) &&
    (action !== "close" ||
      (!inspection.task.checked &&
        (!epic ||
          (!inspection.task.due?.is_recurring &&
            (!children.length || epicDetach))))) &&
    (action !== "comment" || !!fields.comment.trim()) &&
    (action !== "wait" || (!!fields.who.trim() && !!fields.subject.trim())) &&
    (action !== "move" ||
      !!(fields.project || fields.section || fields.parent));
  return (
    <UiDialog
      title={actionTitles[action]}
      close={cancel}
      busy={processing}
      showCloseButton={false}
    >
      <form
        className="task-action-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !pending) confirm({ hierarchy, epicDetach });
        }}
      >
        <p>
          <strong>{inspection.task.content}</strong>
        </p>
        {action === "delete" && (
          <p className="task-danger-notice">
            Diese Aufgabe wird endgültig in Todoist gelöscht. Diese Aktion kann
            nicht rückgängig gemacht werden.
            {children.length > 0
              ? " Alle unten aufgeführten Unteraufgaben werden mitgelöscht."
              : ""}
          </p>
        )}
        {action === "close" && (
          <>
            <p>Die Aufgabe wird nativ in Todoist abgeschlossen.</p>
            {inspection.task.due?.is_recurring && (
              <p>
                {epic
                  ? "Ein wiederholendes Epic kann nicht dauerhaft geschlossen werden. Wiederholung zuerst bewusst ändern oder entfernen."
                  : "Todoist erzeugt die nächste Wiederholungsinstanz. Erst nach eindeutigem Nachweis wird diese wieder nach Offen verschoben."}
              </p>
            )}
          </>
        )}
        {action === "move" && (
          <>
            <p>
              Genau ein Ziel wählen. Ein Abschnitts-/Projektwechsel trennt eine
              Unteraufgabe von ihrer Oberaufgabe. Kinder einer Oberaufgabe
              werden mitverschoben.
            </p>
            <label>
              Zielart
              <select
                value={targetKind}
                disabled={pending}
                onChange={(e) => {
                  setTargetKind(e.target.value);
                  change("project", "");
                  change("section", "");
                  change("parent", "");
                }}
              >
                <option value="section">Abschnitt</option>
                <option value="project">Projekt</option>
                <option value="parent">Oberaufgabe</option>
              </select>
            </label>
            {targetKind === "project" && (
              <label>
                Zielprojekt
                <select
                  required
                  value={fields.project}
                  disabled={pending}
                  onChange={(e) => change("project", e.target.value)}
                >
                  <option value="">Projekt auswählen</option>
                  {snapshot.projects
                    .filter(
                      (p) =>
                        p.available &&
                        (!inspection.task.labels.includes("fun") ||
                          snapshot.contexts.some(
                            (c) =>
                              c.active &&
                              c.kind === "private" &&
                              c.projectId === p.id,
                          )) &&
                        (p.id !== inspection.task.project_id ||
                          !!inspection.task.parent_id),
                    )
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {names.get(p.id)}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {targetKind === "section" && (
              <label>
                Zielabschnitt
                <select
                  required
                  value={fields.section}
                  disabled={pending}
                  onChange={(e) => change("section", e.target.value)}
                >
                  <option value="">Abschnitt auswählen</option>
                  {inspection.sections
                    .filter(
                      (s) =>
                        (s.id !== inspection.task.section_id ||
                          !!inspection.task.parent_id) &&
                        s.project_id === inspection.task.project_id,
                    )
                    .map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {targetKind === "parent" && (
              <label>
                Neue Oberaufgabe
                <select
                  required
                  value={fields.parent}
                  disabled={pending}
                  onChange={(e) => change("parent", e.target.value)}
                >
                  <option value="">Oberaufgabe auswählen</option>
                  {parents
                    .filter((p) => p.id !== inspection.task.parent_id)
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.content}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {targetsError && <p role="alert">{targetsError}</p>}
          </>
        )}
        {action === "wait" && (
          <>
            <label>
              Wartet auf
              <input
                required
                maxLength={300}
                value={fields.who}
                disabled={pending}
                onChange={(e) => change("who", e.target.value)}
              />
            </label>
            <label>
              Gegenstand
              <input
                required
                maxLength={1000}
                value={fields.subject}
                disabled={pending}
                onChange={(e) => change("subject", e.target.value)}
              />
            </label>
            <label>
              Nächste Prüfung
              <input
                type="date"
                value={fields.followUp}
                disabled={pending}
                onChange={(e) => change("followUp", e.target.value)}
              />
            </label>
            <p>
              Die Wartedetails werden im vorhandenen
              Todoist-Beschreibungsabschnitt gespeichert; die Aufgabe wechselt
              nach Wartet. Es wird keine Nachfassaufgabe erzeugt.
            </p>
          </>
        )}
        {action === "comment" && (
          <label>
            Kommentar
            <textarea
              required
              maxLength={12000}
              value={fields.comment}
              disabled={pending}
              onChange={(e) => change("comment", e.target.value)}
            />
          </label>
        )}
        {affectsHierarchy && (
          <section className="task-hierarchy-notice">
            <h3>
              {epic && action === "close"
                ? "Epic manuell abschliessen"
                : "Betroffene Hierarchie"}
            </h3>
            {inspection.task.parent_id && (
              <p>Diese Aufgabe ist eine Unteraufgabe.</p>
            )}
            {children.length > 0 && (
              <ul>
                {children.map((c) => (
                  <li key={c.id}>
                    {c.content}
                    {epic && action === "close"
                      ? c.parentId === inspection.task.id
                        ? " · direktes Kind wird eigenständig"
                        : " · bleibt im getrennten Teilbaum"
                      : ""}
                  </li>
                ))}
              </ul>
            )}
            {epic && action === "close" && children.length > 0 && (
              <>
                <p>
                  Offene Teilbäume werden vor dem Epic-Abschluss bewusst
                  getrennt. Direkte Kinder werden im gleichen Projekt
                  eigenständige Hauptaufgaben ohne Abschnitt; tiefere Kinder
                  bleiben angehängt. Inhalte, Kommentare, IDs und historische
                  Referenzen bleiben erhalten. Erst nach vollständigem Nachweis
                  darf das Epic abgeschlossen werden. Teilerfolge oder
                  unbekannte Ergebnisse stoppen den Abschluss.
                </p>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={epicDetach}
                    disabled={pending}
                    onChange={(e) => setEpicDetach(e.target.checked)}
                  />
                  Alle angezeigten offenen Teilbäume bewusst trennen und
                  anschliessend Epic abschliessen
                </label>
              </>
            )}
            <label className="check-label">
              <input
                type="checkbox"
                checked={hierarchy}
                disabled={pending}
                onChange={(e) => setHierarchy(e.target.checked)}
              />
              Ich bestätige die angezeigte Hierarchiewirkung:{" "}
              {action === "delete"
                ? "angezeigte Kinder mitlöschen."
                : action === "close"
                  ? epic
                    ? "offene Teilbäume vor dem Epic-Abschluss trennen."
                    : "angezeigte Kinder mitabschliessen."
                  : "bei Abschnitts-/Projektwechsel Unteraufgabe abtrennen beziehungsweise alle angezeigten Kinder mitverschieben."}
            </label>
          </section>
        )}
        {dirty && (
          <label className="check-label task-draft-warning">
            <input
              type="checkbox"
              checked={discard}
              disabled={pending}
              onChange={(e) => setDiscard(e.target.checked)}
            />
            Ungespeicherte Änderungen am Aufgabenentwurf werden bei dieser
            Aktion nicht übernommen. Ich möchte trotzdem fortfahren.
          </label>
        )}
        {error && <p role="alert">{error}</p>}
        {operation && <TaskOperationEvidence operation={operation} />}
        <div className="task-action-buttons">
          <button
            type="button"
            className="secondary"
            disabled={processing}
            onClick={cancel}
          >
            <Icon name="close" />
            Abbrechen
          </button>
          <button
            type="submit"
            className={action === "delete" ? "task-delete" : ""}
            disabled={pending || !valid}
          >
            <Icon
              name={
                action === "delete"
                  ? "trash"
                  : action === "comment"
                    ? "progress"
                    : "check"
              }
            />
            {processing
              ? "Wird nachgewiesen …"
              : action === "delete"
                ? "Aufgabe endgültig löschen"
                : action === "close"
                  ? "Abschluss bestätigen"
                  : action === "comment"
                    ? "Kommentar absenden"
                    : action === "wait"
                      ? "Warten bestätigen"
                      : "Verschieben bestätigen"}
          </button>
        </div>
      </form>
    </UiDialog>
  );
}
