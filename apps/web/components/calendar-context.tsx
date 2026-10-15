"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  CalendarOrientation,
  CalendarOverview,
  CalendarBudget,
  CalendarPlanBasis,
} from "@helios/contracts";
import { routineRequest as api } from "./routine-http";
const labels: Record<string, string> = {
  ready: "Aktueller Kalenderstand",
  no_data: "Keine Arbeitszeitdaten",
  no_work_confirmed: "Ohne Arbeitszeit bewusst bestätigt",
  unmapped: "Zuordnung noch offen",
  unavailable: "Kalender aktuell nicht verfügbar",
  incomplete: "Datenstand unvollständig",
  stale: "Veralteter Kalenderstand",
  not_connected: "TermiHub nicht verbunden",
};
const warnings: Record<string, string> = {
  result_incomplete: "Der Abruf ist unvollständig.",
  calendar_mapping_incomplete:
    "Mindestens eine Kalenderquelle ist nicht sicher zugeordnet.",
  organization_unmapped: "Die Arbeitsorganisation ist nicht verifiziert.",
  foreign_calendar: "Ein Ergebnis liegt ausserhalb der angeforderten Quellen.",
  conflicting_event_identity: "Widersprüchliche Terminintervalle.",
  availability_unknown: "Unbekannte Verfügbarkeit wird vorsichtig behandelt.",
  travel_unassigned: "Eine Reisezeit ist nicht sicher einem Termin zugeordnet.",
  no_work_data: "Keine Arbeitszeit im gelesenen Tag vorhanden.",
  source_timezone_changed: "Die Quellzeitzone ist uneinheitlich.",
  snapshot_version_unsupported:
    "Dieser gespeicherte Datenstand muss neu gelesen werden.",
};
const budget = (b: CalendarBudget) =>
  b.minimumMinutes === b.maximumMinutes
    ? `${b.minimumMinutes} Min.`
    : `${b.minimumMinutes}–${b.maximumMinutes} Min.`;
function Summary({ value: v }: Readonly<{ value: CalendarOrientation }>) {
  return (
    <>
      <p>
        <strong>{labels[v.state] ?? "Kalenderstand prüfen"}</strong>
        {v.retrievedAt && (
          <> · Stand {new Date(v.retrievedAt).toLocaleString("de-CH")}</>
        )}
      </p>
      {v.reliable && v.budget ? (
        <p>
          Orientierung für den ganzen Plantag:{" "}
          <strong>{budget(v.budget)}</strong> innerhalb der gemeldeten
          Arbeitszeiten nach festen und möglichen Belegungen. Bereits
          verstrichene Zeit ist darin enthalten.
        </p>
      ) : (
        <p>
          Kein verlässlich berechnetes freies Zeitbudget. Manuell planen bleibt
          jederzeit möglich.
        </p>
      )}
      {v.observedBudget && (
        <p className="help">
          Frühere Orientierung: {budget(v.observedBudget)} · veraltet, keine
          aktuelle Planungsgrundlage.
        </p>
      )}
      {!!v.modes.length && (
        <p className="help">
          Gemeldeter Arbeitsmodus: {v.modes.join(" · ")}. Die Kontextwahl bleibt
          frei.
        </p>
      )}
      {!!v.work.length && (
        <p className="help">
          Gemeldete Arbeitsfenster ({v.timezone}):{" "}
          {v.work
            .map(
              (w) =>
                `${new Date(w.start).toLocaleTimeString("de-CH", { timeZone: v.timezone, hour: "2-digit", minute: "2-digit" })}–${new Date(w.end).toLocaleTimeString("de-CH", { timeZone: v.timezone, hour: "2-digit", minute: "2-digit" })}`,
            )
            .join(" · ")}
          . Arbeitsort schränkt die Kontextwahl nicht ein.
        </p>
      )}
      {v.fixedMinutes !== null && (
        <p className="help">
          Feste Belegung innerhalb der Arbeitsfenster: {v.fixedMinutes} Min.
        </p>
      )}
      {v.uncertainMinutes !== null && v.uncertainMinutes > 0 && (
        <p className="help">
          Unsichere Belegung: {v.uncertainMinutes} Min. Die Spanne
          berücksichtigt deren mögliche Belegung.
        </p>
      )}
      {!!v.warnings.length && (
        <ul className="help">
          {v.warnings.map((w) => (
            <li key={w}>
              {warnings[w] ??
                "Dieser Datenstand ist nur eingeschränkt verwendbar."}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
export function CalendarContextPanel({
  contextId,
  day,
  basis,
}: Readonly<{ contextId?: string; day?: string; basis?: CalendarPlanBasis }>) {
  const [data, setData] = useState<CalendarOverview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({
      ...(contextId ? { contextId } : {}),
      ...(day ? { day } : {}),
    });
    const load = () =>
      api("/api/calendar?" + q)
        .then((v) => {
          if (alive) setData(v);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [contextId, day, version]);
  async function act(action: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api("/api/termihub/" + action, body);
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return error ? (
      <p role="status">
        Kalenderorientierung nicht verfügbar. Manuell weiterplanen ist möglich.
      </p>
    ) : null;
  const shown = data.contexts.filter(
    (c) => c.orientation.state !== "not_connected",
  );
  if (!shown.length)
    return (
      <p className="help">
        TermiHub ist optional.{" "}
        <Link href="/settings/contexts">Kalender verbinden</Link> oder manuell
        weiterplanen.
      </p>
    );
  return (
    <section
      className="card calendar-context"
      aria-label="Kalenderorientierung"
    >
      <h2>Arbeitszeit & Kalender</h2>
      {basis &&
        shown.some(
          (c) =>
            c.orientation.basis !== basis.basis ||
            c.orientation.state !== basis.state,
        ) && (
          <p role="status">
            Der Kalenderstand hat sich seit dieser Vorschau geändert. Bestehende
            Auswahl und bestätigte Pläne bleiben erhalten; eine neue Vorschau
            entsteht nur auf deinen Auftrag.
          </p>
        )}
      {shown.map((c) => (
        <div key={c.contextId}>
          <h3>{c.name}</h3>
          <Summary value={c.orientation} />
          {contextId && data.isToday && !c.orientation.work.length && (
            <label className="check">
              <input
                type="checkbox"
                checked={c.orientation.noWorkConfirmed}
                disabled={busy}
                onChange={(e) =>
                  void act("decision", {
                    contextId: c.contextId,
                    contextRevision: c.orientation.contextRevision,
                    revision: c.orientation.decisionRevision,
                    day: data.day,
                    noWorkConfirmed: e.target.checked,
                  })
                }
              />
              Für diesen Kontext ist heute bewusst keine Arbeitszeit vorgesehen.
            </label>
          )}
        </div>
      ))}
      <button
        disabled={busy}
        onClick={() => void act("refresh", { day: data.day })}
      >
        Kalenderstand aktualisieren
      </button>
      <Link href="/settings/contexts">Zuordnungen prüfen</Link>
      <p className="help">
        Neue Kalenderdaten ändern deine Auswahl und bestätigte Tagespläne nicht
        automatisch.
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
