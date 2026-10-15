"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarContextPanel } from "./calendar-context";
import { ConfirmedAgenda } from "./agenda";
import { agendaEntries } from "@helios/contracts";
import type { PlanningView, PlanEntry, ContextView } from "@helios/contracts";
async function api(path: string, body?: unknown, signal?: AbortSignal) {
  const r = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  const d = await r.json();
  if (!r.ok)
    throw new Error(d.error?.message ?? "Die Anfrage ist fehlgeschlagen.");
  return d;
}
const messages: Record<string, string> = {
  SECTION_MISSING:
    "Der Abschnitt «In Arbeit» fehlt. Bitte in Todoist bewusst einrichten und danach erneut prüfen.",
  SECTION_AMBIGUOUS:
    "Mehrere Abschnitte heissen «In Arbeit». Bitte die Zuordnung in Todoist eindeutig machen.",
  TASK_SOURCE_CONFLICT:
    "Eine Aufgabe wurde in Todoist geändert, verschoben oder abgeschlossen. Der Plan wurde nicht vollständig bestätigt.",
  PLAN_CONFLICT:
    "Kontext, Verbindung oder Plan wurden zwischenzeitlich geändert.",
  AUTH_FAILED:
    "Die freigebende Sitzung ist nicht mehr gültig. Nach erneuter Anmeldung bewusst fortsetzen.",
  INTENT_EXPIRED:
    "Die Bestätigung ist abgelaufen. Bitte den aktuellen Plan prüfen und bewusst fortsetzen.",
  rate_limit:
    "Todoist begrenzt die Abrufe. Bitte die angezeigte Wartezeit abwarten.",
  timeout:
    "Das Ergebnis ist noch unklar. Beim Fortsetzen wird zuerst Todoist nachgelesen.",
  network:
    "Todoist ist nicht erreichbar. Ein möglicher Abschnittswechsel wird vor einer Wiederholung geprüft.",
  OUTCOME_UNKNOWN:
    "Nach einem Neustart ist das Ergebnis unklar. Vor einer neuen Mutation wird Todoist geprüft.",
  MOVE_UNCONFIRMED: "Der Abschnittswechsel ist noch nicht bestätigt.",
  task_unavailable:
    "Eine Aufgabe ist nicht mehr zugänglich. Sie wird nicht automatisch als erledigt gewertet.",
  auth_error: "Todoist hat den Token abgewiesen.",
  HIERARCHY_KEPT:
    "Lokal ausgewählt · Hierarchie und Todoist-Abschnitt erhalten.",
};
const states: Record<string, string> = {
  draft: "Tagesvorschau",
  confirming: "Bestätigung läuft",
  partial: "Teilweise bestätigt · Prüfung nötig",
  confirmed: "Bestätigter Tagesplan",
};
export function PlanningPanel({
  context,
  mode,
}: {
  readonly context: ContextView;
  readonly mode: "focus" | "plan";
}) {
  const [data, setData] = useState<PlanningView | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [chosen, setChosen] = useState<string[]>([]),
    [day, setDay] = useState("");
  const intent = useRef<{ revision: number; key: string } | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    api(
      "/api/plans?contextId=" +
        encodeURIComponent(context.id) +
        (day ? "&day=" + day : ""),
      undefined,
      abort.signal,
    )
      .then((v: PlanningView) => {
        setData(v);
        setChosen(v.plan?.entries.map((e) => e.taskId) ?? []);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [context.id, day, refresh]);
  const pending =
    (data?.operation &&
      ["queued", "running"].includes(data.operation.status)) ||
    data?.agendaOperations?.some((op) =>
      ["queued", "running"].includes(op.status),
    );
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => setRefresh((n) => n + 1), 1500);
    return () => clearInterval(timer);
  }, [pending]);
  async function action(name: string, extra: Record<string, unknown> = {}) {
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/plans/" + name, {
        contextId: context.id,
        day: data.day,
        revision: data.plan?.revision ?? 0,
        ...extra,
      });
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
      setRefresh((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!data?.plan) return;
    if (intent.current?.revision !== data.plan.revision)
      intent.current = {
        revision: data.plan.revision,
        key: crypto.randomUUID(),
      };
    await action("confirm", { key: intent.current.key, taskIds: chosen });
  }
  const plan = data?.plan;
  return (
    <div
      className={
        "planning" +
        (mode === "focus" && plan?.status === "confirmed"
          ? " planning-focus"
          : "")
      }
    >
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!data && <p role="status">Tagesplan wird geladen …</p>}
      {data && (
        <>
          <div className="panel-heading">
            <p className="eyebrow">
              {data.day} · {data.timezone}
            </p>
            <label>
              Plantag ansehen
              <input
                type="date"
                value={day || data.day}
                onChange={(e) => {
                  setError("");
                  setDay(e.target.value);
                }}
              />
            </label>
          </div>
          <CalendarContextPanel
            contextId={context.id}
            day={data.day}
            basis={data.plan?.calendarBasis}
          />
          <p className="help">
            {plan ? states[plan.status] : "Noch kein Tagesplan"} ·{" "}
            {context.name}
          </p>
          {!context.configured && (
            <section className="card">
              <h2>Dein Kontext braucht noch ein Projekt.</h2>
              <Link href="/settings/contexts">Kontext einrichten</Link>
            </section>
          )}
          {context.configured && !plan && (
            <section className="card">
              <h2>Ein ruhiger Start für deinen Tag.</h2>
              <p>
                Aktualisiere zuerst die Aufgaben dieses Kontexts. Danach kannst
                du eine kleine Auswahl prüfen.
              </p>
              <Link href={"/tasks?context=" + context.id}>
                Aufgaben aktualisieren
              </Link>
              <button
                type="button"
                disabled={busy}
                onClick={() => void action("propose")}
              >
                Tagesvorschau erstellen
              </button>
            </section>
          )}
          {plan?.status === "confirmed" && (
            <ConfirmedAgenda
              key={context.id + data.day}
              data={data}
              context={context}
              mode={mode}
              reload={() => setRefresh((n) => n + 1)}
              updatePlan={(updated) =>
                setData((current) =>
                  current ? { ...current, plan: updated } : current,
                )
              }
            />
          )}
          {plan && (
            <>
              {plan.status !== "confirmed" && (
                <section className="card">
                  <div className="panel-heading">
                    <h2>
                      {plan.status === "draft"
                        ? "Deine Tagesvorschau"
                        : "Heute im Blick"}
                    </h2>
                  </div>
                  <p className="help">
                    Quellenstand:{" "}
                    {new Date(plan.sourceAt).toLocaleString("de-CH")} · Revision{" "}
                    {plan.revision}. Die Ansicht enthält den gespeicherten Plan;
                    aktuelle Todoist-Änderungen werden vor Schreiboperationen
                    geprüft.
                  </p>
                  {plan.entries.length === 0 && (
                    <p>
                      Heute ist hier gerade Platz. Es gibt keine geeigneten
                      Aufgaben im zuletzt geladenen Bestand.
                    </p>
                  )}
                  <ol className="today-list">
                    {plan.entries.map((entry) => (
                      <li key={entry.taskId} className="today-entry">
                        <div>
                          {plan.status === "draft" && (
                            <label>
                              <input
                                type="checkbox"
                                checked={chosen.includes(entry.taskId)}
                                onChange={(e) =>
                                  setChosen((ids) =>
                                    e.target.checked
                                      ? [...ids, entry.taskId]
                                      : ids.filter((id) => id !== entry.taskId),
                                  )
                                }
                              />
                              Einplanen
                            </label>
                          )}
                          <h3>{entry.source.content}</h3>
                          {(mode === "plan" || plan.status === "draft") && (
                            <>
                              <Dates entry={entry} />
                              <Reasons entry={entry} />
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                  {plan.status === "draft" && (
                    <>
                      <p>
                        Erst mit deiner Bestätigung darf Helios geeignete
                        eigenständige Aufgaben nach «In Arbeit» verschieben.
                        Unteraufgaben und Oberaufgaben mit aktiven Kindern
                        bleiben zum Schutz der Hierarchie in ihrem
                        Todoist-Abschnitt.
                      </p>
                      <button
                        type="button"
                        disabled={busy || chosen.length === 0}
                        onClick={() => void confirm()}
                      >
                        Auswahl bewusst bestätigen
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => void action("propose")}
                      >
                        Vorschau neu prüfen
                      </button>
                    </>
                  )}
                </section>
              )}
              <Operation
                data={data}
                busy={busy}
                resume={() =>
                  void action("resume", { operationId: data.operation?.id })
                }
              />
              <details className="card">
                <summary>Planrevisionen und Historie</summary>
                <p>
                  Bestätigte Quellenstände bleiben erhalten. Hier erscheinen die
                  letzten 30 Revisionen dieses Tages; andere Tage sind oben
                  auswählbar.
                </p>
                {data.history.map((h) => (
                  <article key={h.revision}>
                    <h3>
                      Revision {h.revision} · {states[h.status]}
                    </h3>
                    <p>
                      {[
                        ...agendaEntries(h, "main"),
                        ...agendaEntries(h, "reserve"),
                      ]
                        .map((e) => e.source.content)
                        .join(" · ") || "Leere Vorschau"}
                    </p>
                    <p className="help">
                      Fokus:{" "}
                      {h.entries.find((e) => e.taskId === h.focusTaskId)?.source
                        .content ?? "Keine Fokuswahl"}
                      {h.confirmedAt
                        ? " · Bestätigt: " +
                          new Date(h.confirmedAt).toLocaleString("de-CH")
                        : ""}
                    </p>
                  </article>
                ))}
              </details>
            </>
          )}
        </>
      )}
    </div>
  );
}
function Dates({ entry }: { readonly entry: PlanEntry }) {
  return (
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
  );
}
function Reasons({ entry }: { readonly entry: PlanEntry }) {
  return (
    <details>
      <summary>Warum diese Aufgabe?</summary>
      <ul>
        {entry.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p className="help">
        Die Reihenfolge berücksichtigt bekannte Deadlines, geplante Daten,
        Priorität, private fun-Kennzeichnung und bekannte Dauer. Kein
        dokumentierter Fortschritt wird erfunden.
      </p>
    </details>
  );
}
function Operation({
  data,
  busy,
  resume,
}: {
  readonly data: PlanningView;
  readonly busy: boolean;
  readonly resume: () => void;
}) {
  const op = data.operation;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!op?.retryAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [op?.retryAt]);
  if (!op) return null;
  return (
    <section className="card operation-panel" aria-label="Bestätigungsstand">
      <h2>Bestätigungsstand</h2>
      {["queued", "running"].includes(op.status) && (
        <p role="status">
          Die bewusste Auswahl wird geprüft. Noch nicht alle externen Schritte
          sind bestätigt.
        </p>
      )}
      {op.status === "confirmed" && (
        <p role="status">
          Tagesplan bestätigt. Alle nötigen Abschnittswechsel sind nachgelesen;
          geschützte Hierarchien bleiben unverändert.
        </p>
      )}
      {op.status === "partial" && (
        <>
          <p role="alert">
            {messages[op.code ?? ""] ??
              "Der Plan ist noch nicht vollständig bestätigt. Die einzelnen Schritte bleiben nachvollziehbar."}
          </p>
          {op.retryAt && (
            <p>
              Frühestens erneut prüfen:{" "}
              {new Date(op.retryAt).toLocaleString("de-CH")}
            </p>
          )}
          <button
            type="button"
            disabled={busy || !!(op.retryAt && Date.parse(op.retryAt) > now)}
            onClick={resume}
          >
            Stand prüfen und bewusst fortsetzen
          </button>
        </>
      )}
      <ul>
        {op.steps.map((s) => (
          <li key={s.taskId}>
            {
              data.plan?.entries.find((e) => e.taskId === s.taskId)?.source
                .content
            }
            :{" "}
            {s.status === "local"
              ? messages.HIERARCHY_KEPT
              : s.status === "verified"
                ? "Abschnitt bestätigt"
                : s.status === "pending"
                  ? "Noch offen"
                  : s.status === "sending"
                    ? "Ergebnis ausstehend"
                    : (messages[s.code ?? ""] ?? "Prüfung erforderlich")}
          </li>
        ))}
      </ul>
    </section>
  );
}
