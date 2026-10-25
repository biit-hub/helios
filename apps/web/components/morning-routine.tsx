"use client";
import { ActionButton, Button, Card, FormField, Checkbox } from "@helios/ui";

import { CalendarContextPanel } from "./calendar-context";
import { useRoutineResource } from "./routine-resource";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  WorkSnapshot,
  RoutineSnapshot,
  RoutineView,
  RoutineStep,
  ContextView,
} from "@helios/contracts";
import { RoutineInbox } from "./routine-inbox";
import { RoutineReview } from "./routine-review";
import { PlanningPanel } from "./planning";
import { TaskEditor } from "./tasks";
import { Problems } from "./problems";
import { routineRequest, type RoutineAction } from "./routine-http";
const names: Record<RoutineStep, string> = {
  inbox: "Eingang",
  contexts: "Kontexte wählen",
  review: "Rückblick",
  enrichment: "Aufgaben klären",
  planning: "Tagesplanung",
  problems: "Probleme prüfen",
};
const states = {
  open: "Offen",
  started: "Begonnen",
  done: "Abgeschlossen",
  skipped_open: "Übersprungen · weiterhin offen",
};
export function MorningRoutine({
  snapshot,
  refreshSnapshot,
}: {
  snapshot: WorkSnapshot;
  refreshSnapshot: () => Promise<WorkSnapshot>;
}) {
  const [data, setData] = useState<RoutineSnapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const known = useRef<RoutineView | null>(null);
  const refresh = useCallback(async () => {
    const next: RoutineSnapshot = await routineRequest("/api/routine");
    if (
      known.current &&
      next.routine?.id === known.current.id &&
      next.routine.revision < known.current.revision
    )
      return;
    known.current = next.routine;
    setData(next);
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    const timer = setInterval(
      () => void refresh().catch((e) => setError(e.message)),
      4000,
    );
    return () => clearInterval(timer);
  }, [refresh]);
  const d = data?.routine;
  const rc = d?.contexts.find(
    (c) => c.contextId === d.cursor.contextId && c.selected,
  );
  const context = snapshot.contexts.find((c) => c.id === rc?.contextId);
  const act: RoutineAction = async (action, body = {}) => {
    setBusy(true);
    setError("");
    try {
      const current = known.current;
      const result = await routineRequest("/api/routine/" + action, {
        key: crypto.randomUUID(),
        ...(current ? { id: current.id, revision: current.revision } : {}),
        ...body,
      });
      await refresh();
      return result;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  async function move(
    action: "skip" | "complete" | "navigate",
    step: RoutineStep,
    contextId: string | null = null,
  ) {
    const r = d?.contexts.find((c) => c.contextId === contextId);
    await act(action, {
      step,
      contextId,
      ...(r ? { contextRevision: r.revision } : {}),
    });
  }
  return (
    <div className="routine" aria-busy={busy}>
      {error && (
        <p role="alert" className="form-error">
          {error}{" "}
          <Button
            className="secondary"
            onClick={() =>
              void refresh()
                .then(() => setError(""))
                .catch((e) => setError(e.message))
            }
          >
            Gespeicherten Stand neu laden
          </Button>
        </p>
      )}
      {!data && !error && (
        <p role="status">Dein gespeicherter Stand wird geladen …</p>
      )}
      {data && !d && (
        <Card as="section" className="card">
          <h2>Du entscheidest, wann du beginnst.</h2>
          <p>Die Routine ist für heute noch nicht gestartet.</p>
          <ActionButton
            busy={busy}
            loadingText="Vorgang wird verarbeitet …"
            disabled={busy}
            onClick={() => void act("start").catch(() => {})}
          >
            Morgenroutine starten
          </ActionButton>
        </Card>
      )}
      {d && (
        <>
          <p className="help">
            {d.day} · {d.timezone} ·{" "}
            {d.complete
              ? "Alle gewählten Schritte sind nachgewiesen abgeschlossen."
              : "Dein Stand ist serverseitig gespeichert. Offene Schritte bleiben wiederaufnehmbar."}
          </p>
          <div className="routine-layout">
            <nav
              className="routine-nav"
              aria-label="Schritte der Morgenroutine"
            >
              {(["inbox", "contexts"] as RoutineStep[]).map((step) => (
                <Button
                  key={step}
                  className="secondary"
                  aria-current={d.cursor.step === step ? "step" : undefined}
                  disabled={busy}
                  onClick={() => void move("navigate", step).catch(() => {})}
                >
                  {names[step]} · {states[d.steps[step as "inbox"]]}
                </Button>
              ))}
              {d.contexts
                .filter((c) => c.selected)
                .map((r) => (
                  <section
                    key={r.id}
                    data-theme={
                      snapshot.contexts.find((c) => c.id === r.contextId)?.theme
                    }
                  >
                    <strong>
                      {snapshot.contexts.find((c) => c.id === r.contextId)
                        ?.name ?? "Gespeicherter Kontext"}
                    </strong>
                    {(["review", "enrichment", "planning"] as const).map(
                      (step) => (
                        <Button
                          key={step}
                          className="secondary"
                          disabled={busy}
                          aria-current={
                            d.cursor.step === step &&
                            d.cursor.contextId === r.contextId
                              ? "step"
                              : undefined
                          }
                          onClick={() =>
                            void move("navigate", step, r.contextId).catch(
                              () => {},
                            )
                          }
                        >
                          {names[step]} · {states[r.steps[step]]}
                        </Button>
                      ),
                    )}
                  </section>
                ))}
              <Button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void move("navigate", "problems").catch(() => {})
                }
              >
                {names.problems} · {states[d.steps.problems]}
              </Button>
            </nav>
            <div className="routine-content">
              {d.cursor.step === "inbox" && (
                <RoutineInbox
                  key={d.id}
                  routine={d}
                  snapshot={snapshot}
                  act={act}
                  refresh={refresh}
                />
              )}{" "}
              {d.cursor.step === "contexts" && (
                <RoutineContexts routine={d} snapshot={snapshot} act={act} />
              )}{" "}
              {rc && context && (
                <div data-theme={context.theme}>
                  {!context.active && (
                    <p role="alert">
                      Dieser Kontext ist derzeit inaktiv. Sein gespeicherter
                      Stand bleibt erhalten; andere Schritte kannst du weiter
                      bearbeiten.
                    </p>
                  )}
                  {d.cursor.step === "review" && (
                    <RoutineReview
                      key={rc.id}
                      routine={d}
                      context={context}
                      state={rc}
                      snapshot={snapshot}
                      act={act}
                      refresh={refresh}
                    />
                  )}{" "}
                  {d.cursor.step === "enrichment" && (
                    <RoutineEnrichment
                      key={rc.id}
                      routine={d}
                      context={context}
                      snapshot={snapshot}
                      refresh={refresh}
                    />
                  )}{" "}
                  {d.cursor.step === "planning" && (
                    <RoutinePlanning context={context} />
                  )}
                </div>
              )}
              {d.cursor.step === "problems" && (
                <>
                  <p>
                    Diese Prüfung ist freiwillig. «Geprüft» bedeutet weiterhin
                    nicht «behoben».
                  </p>
                  <Problems
                    snapshot={snapshot}
                    busy={busy}
                    action={async (name, body) => {
                      const result = await routineRequest(
                        "/api/work/" + name,
                        body,
                      );
                      await refreshSnapshot();
                      return result;
                    }}
                  />
                </>
              )}
              <div className="routine-controls">
                <Button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void move("skip", d.cursor.step, d.cursor.contextId).catch(
                      () => {},
                    )
                  }
                >
                  Diesen Schritt überspringen · offen lassen
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void move(
                      "complete",
                      d.cursor.step,
                      d.cursor.contextId,
                    ).catch(() => {})
                  }
                >
                  Diesen Schritt bewusst abschliessen und weiter
                </Button>
                <Link href="/">Für jetzt pausieren</Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
function RoutineContexts({
  routine,
  snapshot,
  act,
}: {
  routine: RoutineView;
  snapshot: WorkSnapshot;
  act: RoutineAction;
}) {
  const [draft, setDraft] = useState<{
      ids: string[];
      revision: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const ids =
    draft?.ids ??
    routine.contexts.filter((c) => c.selected).map((c) => c.contextId);
  const dirty = !!draft;
  return (
    <Card as="section" className="card routine-step">
      <h2>Für welche Kontexte möchtest du planen?</h2>
      <p>
        Privat und Arbeitgeber bleiben frei wählbar. TermiHub ist dafür keine
        Voraussetzung.
      </p>
      {error && <p role="alert">{error}</p>}
      <CalendarContextPanel />
      <div className="routine-contexts">
        {snapshot.contexts.map((c) => (
          <FormField key={c.id} data-theme={c.theme} className="context-pill">
            <Checkbox
              type="checkbox"
              checked={ids.includes(c.id)}
              disabled={!c.active || busy}
              onChange={(e) => {
                setDraft({
                  revision: draft?.revision ?? routine.revision,
                  ids: e.target.checked
                    ? [...ids, c.id]
                    : ids.filter((id) => id !== c.id),
                });
              }}
            />
            {c.name}
            {!c.active ? " · inaktiv" : ""}
          </FormField>
        ))}
      </div>
      <ActionButton
        busy={busy}
        loadingText="Änderungen werden gespeichert …"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void act("select-contexts", {
            revision: draft?.revision ?? routine.revision,
            contextIds: ids,
          })
            .then(() => {
              setDraft(null);
              setError("");
            })
            .catch((e) =>
              setError(
                e.message + " Deine Auswahl bleibt zur Prüfung sichtbar.",
              ),
            )
            .finally(() => setBusy(false));
        }}
      >
        Kontextauswahl speichern
      </ActionButton>
      {dirty && routine.revision !== draft?.revision && (
        <Button
          className="secondary"
          onClick={() => {
            setDraft(null);
            setError("");
          }}
        >
          Gespeicherte Auswahl bewusst laden
        </Button>
      )}
    </Card>
  );
}
function RoutineEnrichment({
  routine,
  context,
  snapshot,
  refresh,
}: {
  routine: RoutineView;
  context: ContextView;
  snapshot: WorkSnapshot;
  refresh: () => Promise<void>;
}) {
  const resource = useRoutineResource<{
    candidates: { taskId: string; title: string; reasons: string[] }[];
  }>(
    "/api/routine?kind=enrichment&id=" +
      routine.id +
      "&contextId=" +
      context.id,
    routine.revision,
  );
  const items = resource.data?.candidates ?? [],
    error = resource.error,
    load = resource.reload;
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Card as="section" className="card routine-step">
      <h2>Was möchtest du noch klären?</h2>
      <p>
        Nur dein aktiver verwalteter Kontext wird berücksichtigt. Es gibt keine
        Pflichtquote.
      </p>
      {error && <p role="alert">{error}</p>}
      <Button className="secondary" onClick={() => void load().catch(() => {})}>
        Klärungsbedarf aktualisieren
      </Button>
      {!items.length && !error && (
        <p>
          Momentan liegt kein bekannter Klärungsbedarf vor. Du kannst
          weitergehen.
        </p>
      )}
      {items.map((item) => (
        <article className="routine-review-card" key={item.taskId}>
          <h3>{item.title}</h3>
          <p>{item.reasons.join(" · ")}</p>
          <Button onClick={() => setEditing(item.taskId)}>
            Aufgabe gemeinsam klären
          </Button>
        </article>
      ))}
      {editing && (
        <TaskEditor
          snapshot={snapshot}
          context={context}
          taskId={editing}
          initialMode="clarification"
          close={() => {
            setEditing(null);
            void refresh()
              .then(load)
              .catch(() => {});
          }}
        />
      )}
    </Card>
  );
}
function RoutinePlanning({ context }: { context: ContextView }) {
  const [version, setVersion] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="routine-step">
      <p>
        Dein bestätigter Plan bleibt bestehen. Die Vorbereitung aktualisiert nur
        einen unbestätigten Vorschlag dieses Kontextes.
      </p>
      {error && <p role="alert">{error}</p>}
      <ActionButton
        busy={busy}
        loadingText="Tagesvorschau wird erstellt …"
        disabled={busy || !context.active}
        onClick={() => {
          setBusy(true);
          setError("");
          void routineRequest("/api/work/tasks-refresh", {
            contextId: context.id,
          })
            .then(() => routineRequest("/api/plans?contextId=" + context.id))
            .then(async (view) => {
              if (view.plan && view.plan.status !== "draft") return;
              await routineRequest("/api/plans/propose", {
                contextId: context.id,
                day: view.day,
                revision: view.plan?.revision ?? 0,
              });
            })
            .then(() => setVersion((v) => v + 1))
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        Aktuelle Tagesvorschau nach dem Review vorbereiten
      </ActionButton>
      <PlanningPanel
        key={context.id + ":" + version}
        context={context}
        mode="plan"
      />
    </section>
  );
}
