"use client";
import {
  ActionButton,
  FormField,
  Input,
  Textarea,
  Checkbox,
  Button,
  Select,
  Icon,
} from "@helios/ui";

import { useEffect, useRef, useState } from "react";
import type {
  TaskInspection,
  TaskOperationView,
  WorkSnapshot,
} from "@helios/contracts";
import { UiDialog } from "./ui-help";

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
const actionLoadingText: Record<TaskAction, string> = {
  close: "Abschluss wird nachgewiesen …",
  delete: "Löschung wird nachgewiesen …",
  move: "Aufgabe wird verschoben …",
  wait: "Wartestatus wird gespeichert …",
  comment: "Kommentar wird hinzugefügt …",
};
type TaskActionProps = Readonly<{
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
}>;
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
}: TaskActionProps) {
  const [hierarchy, setHierarchy] = useState(false),
    [epicDetach, setEpicDetach] = useState(false),
    [discard, setDiscard] = useState(false);
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
  const valid = actionValid(action, inspection, fields, {
    dirty,
    discard,
    affectsHierarchy,
    hierarchy,
    epicDetach,
  });
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
          <MoveFields
            inspection={inspection}
            snapshot={snapshot}
            fields={fields}
            change={change}
            pending={pending}
          />
        )}
        {action === "wait" && (
          <>
            <FormField>
              <span>Wartet auf</span>
              <Input
                required
                maxLength={300}
                value={fields.who}
                disabled={pending}
                onChange={(e) => change("who", e.target.value)}
              />
            </FormField>
            <FormField>
              <span>Gegenstand</span>
              <Input
                required
                maxLength={1000}
                value={fields.subject}
                disabled={pending}
                onChange={(e) => change("subject", e.target.value)}
              />
            </FormField>
            <FormField>
              <span>Nächste Prüfung</span>
              <Input
                type="date"
                value={fields.followUp}
                disabled={pending}
                onChange={(e) => change("followUp", e.target.value)}
              />
            </FormField>
            <p>
              Die Wartedetails werden im vorhandenen
              Todoist-Beschreibungsabschnitt gespeichert; die Aufgabe wechselt
              nach Wartet. Es wird keine Nachfassaufgabe erzeugt.
            </p>
          </>
        )}
        {action === "comment" && (
          <FormField>
            <span>Kommentar</span>
            <Textarea
              required
              maxLength={12000}
              value={fields.comment}
              disabled={pending}
              onChange={(e) => change("comment", e.target.value)}
            />
          </FormField>
        )}
        {affectsHierarchy && (
          <HierarchyNotice
            action={action}
            inspection={inspection}
            pending={pending}
            hierarchy={hierarchy}
            setHierarchy={setHierarchy}
            epicDetach={epicDetach}
            setEpicDetach={setEpicDetach}
          />
        )}
        {dirty && (
          <FormField className="check-label task-draft-warning">
            <Checkbox
              type="checkbox"
              checked={discard}
              disabled={pending}
              onChange={(e) => setDiscard(e.target.checked)}
            />
            <span>
              Ungespeicherte Änderungen am Aufgabenentwurf werden bei dieser
              Aktion nicht übernommen. Ich möchte trotzdem fortfahren.
            </span>
          </FormField>
        )}
        {error && <p role="alert">{error}</p>}
        {operation && <TaskOperationEvidence operation={operation} />}
        <div className="task-action-buttons">
          <Button
            type="button"
            className="secondary"
            disabled={processing}
            onClick={cancel}
          >
            <Icon name="close" />
            Abbrechen
          </Button>
          <ActionButton
            busy={processing}
            loadingText={actionLoadingText[action]}
            type="submit"
            className={action === "delete" ? "task-delete" : ""}
            disabled={pending || !valid}
          >
            <Icon name={actionIcons[action]} />
            {processing ? "Wird nachgewiesen …" : confirmationTitles[action]}
          </ActionButton>
        </div>
      </form>
    </UiDialog>
  );
}

export const actionIcons = {
  close: "check",
  delete: "trash",
  move: "move",
  wait: "wait",
  comment: "progress",
} as const;
const confirmationTitles = {
  close: "Abschluss bestätigen",
  delete: "Aufgabe endgültig löschen",
  move: "Verschieben bestätigen",
  wait: "Warten bestätigen",
  comment: "Kommentar absenden",
};
function canClose(inspection: TaskInspection, epicDetach: boolean) {
  if (inspection.task.checked) return false;
  if (!inspection.task.labels.includes("epic")) return true;
  if (inspection.task.due?.is_recurring) return false;
  return !inspection.children.length || epicDetach;
}
function actionValid(
  action: TaskAction,
  inspection: TaskInspection,
  fields: ActionFields,
  ack: {
    dirty: boolean;
    discard: boolean;
    affectsHierarchy: boolean;
    hierarchy: boolean;
    epicDetach: boolean;
  },
) {
  if (ack.dirty && !ack.discard) return false;
  if (ack.affectsHierarchy && !ack.hierarchy) return false;
  switch (action) {
    case "close":
      return canClose(inspection, ack.epicDetach);
    case "comment":
      return !!fields.comment.trim();
    case "wait":
      return !!fields.who.trim() && !!fields.subject.trim();
    case "move":
      return !!(fields.project || fields.section || fields.parent);
    default:
      return true;
  }
}
function MoveFields({
  inspection,
  snapshot,
  fields,
  change,
  pending,
}: Pick<
  TaskActionProps,
  "inspection" | "snapshot" | "fields" | "change" | "pending"
>) {
  const [parents, setParents] = useState<{ id: string; content: string }[]>([]),
    [targetsError, setTargetsError] = useState("");
  const [targetKind, setTargetKind] = useState("section");
  const children = inspection.children;
  useEffect(() => {
    const abort = new AbortController();
    void fetch(
      "/api/tasks?projectId=" + encodeURIComponent(inspection.task.project_id),
      { cache: "no-store", signal: abort.signal },
    )
      .then(async (r) => {
        const value = await r.json();
        if (!r.ok)
          throw new Error(
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
  }, [inspection.task.project_id, inspection.task.id, children]);
  const names = optionNames(snapshot.projects, "Projekt");
  return (
    <>
      <p>
        Genau ein Ziel wählen. Ein Abschnitts-/Projektwechsel trennt eine
        Unteraufgabe von ihrer Oberaufgabe. Kinder einer Oberaufgabe werden
        mitverschoben.
      </p>
      <FormField>
        <span>Zielart</span>
        <Select
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
        </Select>
      </FormField>
      {targetKind === "project" && (
        <FormField>
          <span>Zielprojekt</span>
          <Select
            required
            value={fields.project}
            disabled={pending}
            onChange={(e) => change("project", e.target.value)}
          >
            <option value="">Projekt auswählen</option>
            {snapshot.projects
              .filter((p) => allowedProject(p, inspection, snapshot))
              .map((p) => (
                <option value={p.id} key={p.id}>
                  {names.get(p.id)}
                </option>
              ))}
          </Select>
        </FormField>
      )}
      {targetKind === "section" && (
        <FormField>
          <span>Zielabschnitt</span>
          <Select
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
          </Select>
        </FormField>
      )}
      {targetKind === "parent" && (
        <FormField>
          <span>Neue Oberaufgabe</span>
          <Select
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
          </Select>
        </FormField>
      )}
      {targetsError && <p role="alert">{targetsError}</p>}
    </>
  );
}

function hierarchyEffect(action: TaskAction, epic: boolean) {
  if (action === "delete") return "angezeigte Kinder mitlöschen.";
  if (action !== "close")
    return "bei Abschnitts-/Projektwechsel Unteraufgabe abtrennen beziehungsweise alle angezeigten Kinder mitverschieben.";
  return epic
    ? "offene Teilbäume vor dem Epic-Abschluss trennen."
    : "angezeigte Kinder mitabschliessen.";
}
function childEffect(
  parentId: string | null | undefined,
  taskId: string,
  epicClose: boolean,
) {
  if (!epicClose) return "";
  return parentId === taskId
    ? " · direktes Kind wird eigenständig"
    : " · bleibt im getrennten Teilbaum";
}
function HierarchyNotice({
  action,
  inspection,
  pending,
  hierarchy,
  setHierarchy,
  epicDetach,
  setEpicDetach,
}: Pick<TaskActionProps, "action" | "inspection" | "pending"> & {
  hierarchy: boolean;
  setHierarchy: (value: boolean) => void;
  epicDetach: boolean;
  setEpicDetach: (value: boolean) => void;
}) {
  const epic = inspection.task.labels.includes("epic"),
    children = inspection.children;
  return (
    <section className="task-hierarchy-notice">
      <h3>
        {epic && action === "close"
          ? "Epic manuell abschliessen"
          : "Betroffene Hierarchie"}
      </h3>
      {inspection.task.parent_id && <p>Diese Aufgabe ist eine Unteraufgabe.</p>}
      {children.length > 0 && (
        <ul>
          {children.map((c) => (
            <li key={c.id}>
              {c.content}
              {childEffect(
                c.parentId,
                inspection.task.id,
                epic && action === "close",
              )}
            </li>
          ))}
        </ul>
      )}
      {epic && action === "close" && children.length > 0 && (
        <>
          <p>
            Offene Teilbäume werden vor dem Epic-Abschluss bewusst getrennt.
            Direkte Kinder werden im gleichen Projekt eigenständige
            Hauptaufgaben ohne Abschnitt; tiefere Kinder bleiben angehängt.
            Inhalte, Kommentare, IDs und historische Referenzen bleiben
            erhalten. Erst nach vollständigem Nachweis darf das Epic
            abgeschlossen werden. Teilerfolge oder unbekannte Ergebnisse stoppen
            den Abschluss.
          </p>
          <FormField className="check-label">
            <Checkbox
              type="checkbox"
              checked={epicDetach}
              disabled={pending}
              onChange={(e) => setEpicDetach(e.target.checked)}
            />
            <span>
              Alle angezeigten offenen Teilbäume bewusst trennen und
              anschliessend Epic abschliessen
            </span>
          </FormField>
        </>
      )}
      <FormField className="check-label">
        <Checkbox
          type="checkbox"
          checked={hierarchy}
          disabled={pending}
          onChange={(e) => setHierarchy(e.target.checked)}
        />
        <span>
          Ich bestätige die angezeigte Hierarchiewirkung:{" "}
          {hierarchyEffect(action, epic)}
        </span>
      </FormField>
    </section>
  );
}

function allowedProject(
  project: WorkSnapshot["projects"][number],
  inspection: TaskInspection,
  snapshot: WorkSnapshot,
) {
  if (!project.available) return false;
  if (
    inspection.task.labels.includes("fun") &&
    !snapshot.contexts.some(
      (c) => c.active && c.kind === "private" && c.projectId === project.id,
    )
  )
    return false;
  return (
    project.id !== inspection.task.project_id || !!inspection.task.parent_id
  );
}
