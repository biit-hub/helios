"use client";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
const SortableArea = dynamic(
  () => import("./agenda-sortable").then((module) => module.SortableArea),
  {
    ssr: false,
    loading: () => <p role="status">Tagesordnung wird geladen …</p>,
  },
);

import {
  agendaEntries,
  agendaState,
  entryKey,
  type PlanningView,
  type PlanView,
  type PlanEntry,
  type AgendaArea,
  type ContextView,
  type TaskInspection,
} from "@helios/contracts";
async function api(path: string, body?: unknown) {
  const r = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.error?.message ?? "Speichern fehlgeschlagen.");
  return data;
}
export function ConfirmedAgenda({
  data,
  context,
  mode,
  reload,
  updatePlan,
}: {
  readonly data: PlanningView;
  readonly context: ContextView;
  readonly mode: "focus" | "plan";
  readonly reload: () => void;
  readonly updatePlan: (plan: PlanView) => void;
}) {
  const plan = data.plan!;
  const state = agendaState(plan);
  const [saving, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [reason, setReason] = useState(""),
    [closing, setClosing] = useState<PlanEntry | null>(null);
  const busy = saving || data.editable === false;
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const main = agendaEntries(plan, "main"),
    reserve = agendaEntries(plan, "reserve");
  const available = (entry: PlanEntry) =>
    data.instanceAvailability?.[entryKey(entry)] ??
    data.availability?.[entry.taskId] === true;
  const focus = main.find(
    (entry) => entry.taskId === plan.focusTaskId && available(entry),
  );
  const pendingIds = new Set(state.pending.map((p) => entryKey(p.entry)));
  const current = state.paused
    ? undefined
    : reserve.find(
        (entry) => available(entry) || pendingIds.has(entryKey(entry)),
      );
  async function action(name: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    setNotice("");
    const body = {
      contextId: context.id,
      day: plan.day,
      revision: plan.revision,
      ...extra,
    };
    const hash = JSON.stringify({ name, body });
    if (attempt.current?.body !== hash)
      attempt.current = { body: hash, key: crypto.randomUUID() };
    try {
      const response = await api("/api/plans/" + name, {
        ...body,
        key: attempt.current.key,
      });
      if (response.entries && response.id) updatePlan(response);
      setNotice(
        name === "reserve-close"
          ? "Abschluss angefragt. Die Karte bleibt bis zum externen Nachweis erhalten."
          : "Gespeichert.",
      );
      reload();
      return true;
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "Speichern fehlgeschlagen.") +
          " Aktuellen Plan laden und erneut prüfen.",
      );
      reload();
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function reorder(area: AgendaArea, from: number, to: number) {
    const order = [...state[area]];
    if (from < 0 || to < 0 || to >= order.length || from === to) return false;
    const [key] = order.splice(from, 1);
    order.splice(to, 0, key!);
    return action("reorder", { area, order });
  }
  const link =
    "/tasks?context=" +
    encodeURIComponent(context.id) +
    "&addToPlan=" +
    plan.day +
    "&returnView=" +
    mode;
  return (
    <>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {data.editable === false && (
        <p>Historischer oder nicht mehr zugeordneter Plan · nur lesbar.</p>
      )}
      <button type="button" className="secondary" onClick={reload}>
        Aktuellen Plan laden
      </button>
      {mode === "focus" && focus && (
        <section className="card focus-hero">
          <p className="eyebrow">DEIN NÄCHSTER SCHRITT</p>
          <h2>{focus.source.content}</h2>
          <p>Ein Schritt genügt.</p>
          <EntryDetails entry={focus} />
          <Link
            href={
              "/tasks?context=" +
              context.id +
              "&task=" +
              encodeURIComponent(focus.taskId)
            }
          >
            Aufgabe öffnen
          </Link>
        </section>
      )}
      {!focus && main.length > 0 && (
        <p className="status-notice">
          Die gespeicherte Fokusaufgabe ist aktuell nicht als ausführbar
          nachgewiesen. Aufgabenstand prüfen oder bewusst einen verfügbaren
          Fokus wählen. Die Reihenfolge bleibt erhalten.
        </p>
      )}
      <section className="card" aria-label="Hauptauswahl">
        <div className="panel-heading">
          <h2>Heute im Blick</h2>
          <span className="pill">Bewusst bestätigt</span>
        </div>
        <p className="help">
          Ziehgriff: mit Maus oder Touch ziehen; per Tastatur mit Leertaste
          aufnehmen, Pfeilen verschieben und mit Leertaste ablegen. Alternativ
          die Pfeilaktionen verwenden.
        </p>
        {main.length > 1 && (
          <p className="help">
            Um deine Fokusaufgabe in die Reserve zu verschieben, wähle zuerst
            bewusst eine andere Hauptaufgabe als Fokus.
          </p>
        )}
        {!main.length && (
          <p>
            Hier ist gerade Platz. Du kannst bewusst eine passende Aufgabe
            ergänzen.
          </p>
        )}
        <SortableArea
          area="main"
          entries={main}
          disabled={busy}
          reorder={reorder}
        >
          {(entry, index) => (
            <>
              <h3>{entry.source.content}</h3>
              {!available(entry) && (
                <p className="status-notice">
                  Aktuell nicht ausführbar · gespeicherter Planstand.
                </p>
              )}
              {mode === "plan" && <EntryDetails entry={entry} />}
              <div className="agenda-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={
                    busy ||
                    !available(entry) ||
                    plan.focusTaskId === entry.taskId
                  }
                  aria-pressed={
                    plan.focusTaskId === entry.taskId && available(entry)
                  }
                  onClick={() =>
                    void action("agenda-focus", {
                      taskId: entry.taskId,
                      entryKey: entryKey(entry),
                    })
                  }
                >
                  {plan.focusTaskId === entry.taskId && available(entry)
                    ? "Im Fokus"
                    : "Als Fokus wählen"}
                </button>
                <ArrowButtons
                  title={entry.source.content}
                  index={index}
                  length={main.length}
                  disabled={busy}
                  move={(to) => void reorder("main", index, to)}
                />
                <button
                  type="button"
                  className="secondary"
                  disabled={
                    busy ||
                    pendingIds.has(entryKey(entry)) ||
                    (main.length > 1 && plan.focusTaskId === entry.taskId)
                  }
                  onClick={() =>
                    void action("transfer", {
                      entryKey: entryKey(entry),
                      area: "reserve",
                    })
                  }
                >
                  In die Reserve
                </button>
              </div>
            </>
          )}
        </SortableArea>
        <Link className="button-link" href={link}>
          Weitere Aufgabe bewusst aufnehmen
        </Link>
      </section>
      <section className="card reserve-stack" aria-label="Zyklische Reserve">
        <p className="eyebrow">WENN DU MAGST</p>
        <h2>Deine Reserve</h2>
        {state.paused ? (
          <>
            <p>
              Die Reserve macht Pause. Du kannst sie bewusst wieder aufnehmen.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void action("reserve-pause", { paused: false })}
            >
              Reserve wieder aufnehmen
            </button>
          </>
        ) : current ? (
          <article className="reserve-card">
            <h3>{current.source.content}</h3>
            <EntryDetails entry={current} />
            <label>
              Grund fürs Überspringen (optional)
              <input
                value={reason}
                maxLength={1000}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <div className="agenda-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy || pendingIds.has(entryKey(current))}
                onClick={() =>
                  void action("reserve-skip", {
                    entryKey: entryKey(current),
                    reason,
                  })
                }
              >
                Reservekarte überspringen
              </button>
              <button
                type="button"
                disabled={busy || pendingIds.has(entryKey(current))}
                onClick={() => setClosing(current)}
              >
                Reserveaufgabe abschliessen
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void action("reserve-pause", { paused: true })}
              >
                Reserve pausieren
              </button>
            </div>
          </article>
        ) : reserve.length ? (
          <p>
            Derzeit ist keine gespeicherte Reservekarte als ausführbar
            nachgewiesen. Aufgabenstand prüfen; verschwundene Aufgaben gelten
            nicht automatisch als erledigt.
          </p>
        ) : (
          <p>Für jetzt ist deine Reserve leer. Es muss nichts dazukommen.</p>
        )}
        {mode === "plan" && reserve.length > 0 && (
          <details className="reserve-manage">
            <summary>Reserve bewusst ordnen und verwalten</summary>
            <p className="help">
              Diese Verwaltung ist vom reduzierten Fokusbereich getrennt.
              Verschieben ändert keinen Todoist-Abschnitt.
            </p>
            <SortableArea
              area="reserve"
              entries={reserve}
              disabled={busy}
              reorder={reorder}
            >
              {(entry, index) => (
                <>
                  <h3>{entry.source.content}</h3>
                  {!available(entry) && (
                    <p>Aktuell nicht ausführbar · Quelle prüfen.</p>
                  )}
                  <div className="agenda-actions">
                    <ArrowButtons
                      title={entry.source.content}
                      index={index}
                      length={reserve.length}
                      disabled={busy}
                      move={(to) => void reorder("reserve", index, to)}
                    />
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy || pendingIds.has(entryKey(entry))}
                      onClick={() =>
                        void action("transfer", {
                          entryKey: entryKey(entry),
                          area: "main",
                        })
                      }
                    >
                      In die Hauptauswahl
                    </button>
                  </div>
                </>
              )}
            </SortableArea>
          </details>
        )}
      </section>
      {data.agendaOperations?.map((op) => (
        <section className="card" key={op.id}>
          <h3>Bewusste Planänderung</h3>
          <p>
            {["queued", "running"].includes(op.status)
              ? "Änderung läuft · noch nicht nachgewiesen"
              : op.status === "succeeded"
                ? "Extern nachgewiesen"
                : "Ergebnis fehlgeschlagen oder ungeklärt · Karte und Originaleingaben bleiben erhalten."}
          </p>
          {op.code && <p className="help">{op.code}</p>}
          {["unknown", "failed", "partial"].includes(op.status) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                api("/api/tasks/resume", { operationId: op.id })
                  .then(() => reload())
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              Stand prüfen und bewusst fortsetzen
            </button>
          )}
          <Link href={"/tasks?context=" + context.id}>
            Operationsjournal öffnen
          </Link>
        </section>
      ))}
      {closing && (
        <ReserveClose
          entry={closing}
          context={context}
          busy={busy}
          close={() => setClosing(null)}
          submit={async (inspection, destructive, hierarchy) => {
            const ok = await action("reserve-close", {
              taskId: closing.taskId,
              entryKey: entryKey(closing),
              basis: inspection.basis,
              acknowledgeDestructive: destructive,
              acknowledgeHierarchy: hierarchy,
            });
            if (ok) setClosing(null);
          }}
        />
      )}
    </>
  );
}
function ArrowButtons({
  title,
  index,
  length,
  disabled,
  move,
}: {
  readonly title: string;
  readonly index: number;
  readonly length: number;
  readonly disabled: boolean;
  readonly move: (to: number) => void;
}) {
  return (
    <>
      <button
        type="button"
        className="secondary"
        aria-label={title + " nach oben"}
        disabled={disabled || index === 0}
        onClick={() => move(index - 1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="secondary"
        aria-label={title + " nach unten"}
        disabled={disabled || index === length - 1}
        onClick={() => move(index + 1)}
      >
        ↓
      </button>
    </>
  );
}
function EntryDetails({ entry }: { readonly entry: PlanEntry }) {
  return (
    <>
      <dl className="task-dates">
        <div>
          <dt>Geplantes Datum</dt>
          <dd>
            {entry.source.due?.datetime ??
              entry.source.due?.date ??
              "Nicht festgelegt"}
          </dd>
        </div>
        <div>
          <dt>Deadline</dt>
          <dd>{entry.source.deadline?.date ?? "Nicht festgelegt"}</dd>
        </div>
      </dl>
      <details>
        <summary>Warum diese Aufgabe?</summary>
        <ul>
          {entry.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </details>
    </>
  );
}
function ReserveClose({
  entry,
  context,
  busy,
  close,
  submit,
}: {
  readonly entry: PlanEntry;
  readonly context: ContextView;
  readonly busy: boolean;
  readonly close: () => void;
  readonly submit: (
    inspection: TaskInspection,
    destructive: boolean,
    hierarchy: boolean,
  ) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [inspection, setInspection] = useState<TaskInspection | null>(null),
    [error, setError] = useState(""),
    [destructive, setDestructive] = useState(false),
    [hierarchy, setHierarchy] = useState(false);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    let alive = true;
    api(
      "/api/tasks?contextId=" +
        context.id +
        "&taskId=" +
        encodeURIComponent(entry.taskId),
    )
      .then((value) => {
        if (alive) setInspection(value);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
      opener?.focus();
    };
  }, [context.id, entry.taskId]);
  const affected =
    !!inspection?.task.parent_id || !!inspection?.children.length;
  return (
    <dialog
      ref={ref}
      className="task-dialog"
      aria-labelledby="reserve-close-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="task-dialog-body">
        <h2 id="reserve-close-title">Reserveaufgabe bewusst abschliessen</h2>
        <p>{entry.source.content}</p>
        {error && <p role="alert">{error}</p>}
        {!inspection && <p>Aktueller Todoist-Stand wird geprüft …</p>}
        {inspection && (
          <>
            <p>
              Die Aufgabe wird zuerst nach «Abgeschlossen» verschoben und nativ
              abgeschlossen. Eine eindeutig nachgewiesene Folgeinstanz kehrt
              nach «Offen» zurück.
            </p>
            {affected && (
              <>
                <p>
                  Diese Aktion kann die Unteraufgabe von ihrer Oberaufgabe lösen
                  oder angehängte Kinder mitnehmen:
                </p>
                <ul>
                  {inspection.children.map((child) => (
                    <li key={child.id}>{child.content}</li>
                  ))}
                </ul>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={hierarchy}
                    onChange={(e) => setHierarchy(e.target.checked)}
                  />
                  Ich bestätige die angezeigte Hierarchiewirkung ausdrücklich.
                </label>
              </>
            )}
            <label className="check-label">
              <input
                type="checkbox"
                checked={destructive}
                onChange={(e) => setDestructive(e.target.checked)}
              />
              Ich bestätige den nativen Abschluss dieser Reserveaufgabe
              ausdrücklich.
            </label>
            <button
              type="button"
              disabled={busy || !destructive || (affected && !hierarchy)}
              onClick={() => void submit(inspection, destructive, hierarchy)}
            >
              Abschluss bewusst bestätigen
            </button>
          </>
        )}
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={close}
        >
          Abbrechen
        </button>
      </div>
    </dialog>
  );
}
type AdmissionContextValue = {
  view: PlanningView | null;
  load: () => Promise<PlanningView>;
};
const AdmissionContext = createContext<AdmissionContextValue | null>(null);
export function TaskPlanProvider({
  context,
  children,
}: {
  readonly context: ContextView;
  readonly children: ReactNode;
}) {
  const [view, setView] = useState<PlanningView | null>(null),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    const value = await api("/api/plans?contextId=" + context.id);
    setView(value);
    return value as PlanningView;
  }, [context.id]);
  useEffect(() => {
    let alive = true;
    api("/api/plans?contextId=" + context.id)
      .then((value) => {
        if (alive) setView(value);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [context.id]);
  const pending = view?.agendaOperations?.some((op) =>
    ["queued", "running"].includes(op.status),
  );
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(
      () => void load().catch((e) => setError(e.message)),
      1500,
    );
    return () => clearInterval(timer);
  }, [pending, load]);
  return (
    <AdmissionContext.Provider value={{ view, load }}>
      {error && <p role="alert">{error}</p>}
      {children}
    </AdmissionContext.Provider>
  );
}
export function AddToPlan({
  taskId,
  instanceKey,
  context,
}: {
  readonly taskId: string;
  readonly instanceKey: string;
  readonly context: ContextView;
}) {
  const source = useContext(AdmissionContext);
  const view = source?.view;
  const [area, setArea] = useState<AgendaArea>("main"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [op, setOp] = useState<string | null>(null);
  const intent = useRef<{ body: string; key: string } | null>(null);
  if (!source || view?.plan?.status !== "confirmed") return null;
  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const returnMode = params.get("returnView") === "focus" ? "/" : "/plan";
  const included = [
    ...agendaEntries(view.plan, "main"),
    ...agendaEntries(view.plan, "reserve"),
  ].some((e) => entryKey(e) === instanceKey);
  const pending = agendaState(view.plan).pending.some(
    (item) => item.entry.taskId === taskId,
  );
  const operation = view.agendaOperations?.find((item) => item.id === op);
  return (
    <div className="add-to-plan">
      <label>
        Ziel der bewussten Aufnahme
        <select
          value={area}
          onChange={(e) => setArea(e.target.value as AgendaArea)}
        >
          <option value="main">Hauptauswahl</option>
          <option value="reserve">Reserve</option>
        </select>
      </label>
      <button
        type="button"
        className="secondary"
        disabled={busy || included || pending}
        onClick={async () => {
          setBusy(true);
          setError("");
          const body = {
            contextId: context.id,
            day: view.day,
            revision: view.plan!.revision,
            taskId,
            entryKey: instanceKey,
            area,
          };
          const hash = JSON.stringify(body);
          if (intent.current?.body !== hash)
            intent.current = { body: hash, key: crypto.randomUUID() };
          try {
            const response = await api("/api/plans/admit", {
              ...body,
              key: intent.current.key,
            });
            setOp(response.operationId);
            await source.load();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Aufnahme fehlgeschlagen.",
            );
            await source.load();
          } finally {
            setBusy(false);
          }
        }}
      >
        {included
          ? "Im Tagesplan"
          : pending
            ? "Aufnahme wird nachgewiesen …"
            : "Bewusst in den Tagesplan aufnehmen"}
      </button>
      {error && <p role="alert">{error}</p>}
      {operation &&
        ["failed", "partial", "unknown"].includes(operation.status) && (
          <p>
            Aufnahme fehlgeschlagen oder ungeklärt. Im Operationsjournal prüfen;
            keine weitere Anlage auslösen.
          </p>
        )}
      <Link href={returnMode + "?context=" + context.id}>
        Zurück zur Tagesplanung
      </Link>
    </div>
  );
}
