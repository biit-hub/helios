"use client";
import { useRoutineResource } from "./routine-resource";
import { useState } from "react";
import type {
  RoutineView,
  RoutineContextView,
  ContextView,
  WorkSnapshot,
  ReviewItem,
  AiDraftView,
} from "@helios/contracts";
import { TaskEditor } from "./tasks";
import { routineRequest, type RoutineAction } from "./routine-http";
export function RoutineReview({
  routine,
  context,
  state,
  snapshot,
  act,
  refresh,
}: {
  routine: RoutineView;
  context: ContextView;
  state: RoutineContextView;
  snapshot: WorkSnapshot;
  act: RoutineAction;
  refresh: () => Promise<void>;
}) {
  const outcomes = state.feedback
    .map((f) => [f.id, f.status, f.operationStatus].join(":"))
    .join("|");
  const resource = useRoutineResource<{
    items: ReviewItem[];
    routineRevision: number;
    contextRevision: number;
  }>(
    "/api/routine?kind=review&id=" + routine.id + "&contextId=" + context.id,
    routine.revision + ":" + outcomes,
  );
  const items = resource.data?.items ?? [];
  const load = resource.reload;
  const loaded = !!resource.data;
  const [chosen, setChosen] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [hierarchy, setHierarchy] = useState(false),
    [editing, setEditing] = useState<ReviewItem | null>(null);
  const [selectionBase, setSelectionBase] = useState<{
    revision: number;
    contextRevision: number;
    bases: Record<string, string | null>;
  } | null>(null);
  const conflict =
    !!selectionBase &&
    !!resource.data &&
    (routine.revision !== selectionBase.revision ||
      state.revision !== selectionBase.contextRevision ||
      resource.data.routineRevision !== selectionBase.revision ||
      resource.data.contextRevision !== selectionBase.contextRevision ||
      chosen.some(
        (k) =>
          items.find((i) => i.entryKey === k)?.basis !== selectionBase.bases[k],
      ));
  function choose(item: ReviewItem, checked: boolean) {
    const keys = checked
      ? [...chosen, item.entryKey]
      : chosen.filter((k) => k !== item.entryKey);
    setChosen(keys);
    setConfirm(false);
    setHierarchy(false);
    if (!keys.length) setSelectionBase(null);
    else
      setSelectionBase(
        (old) =>
          old ?? {
            revision: resource.data!.routineRevision,
            contextRevision: resource.data!.contextRevision,
            bases: Object.fromEntries(items.map((i) => [i.entryKey, i.basis])),
          },
      );
  }
  async function report(feedback: "not_started" | "partial", keys = chosen) {
    setBusy(true);
    setError("");
    try {
      let draftId: string | undefined;
      if (feedback === "partial" && keys.length === 1) {
        const item = items.find((i) => i.entryKey === keys[0])!;
        const data = await routineRequest(
          "/api/ai?contextId=" +
            context.id +
            "&taskId=" +
            encodeURIComponent(item.entry.taskId),
        );
        draftId = (data.drafts as AiDraftView[]).find(
          (d) => d.kind === "progress" && d.instanceKey === item.entryKey,
        )?.id;
        if (!draftId)
          throw new Error(
            "Bitte zuerst den Fortschritt im gemeinsamen Dialog in eigenen Worten dokumentieren. Deine Eingabe bleibt dort gespeichert.",
          );
      }
      await act("feedback", {
        contextId: context.id,
        revision:
          keys === chosen && selectionBase
            ? selectionBase.revision
            : (resource.data?.routineRevision ?? routine.revision),
        contextRevision:
          keys === chosen && selectionBase
            ? selectionBase.contextRevision
            : (resource.data?.contextRevision ?? state.revision),
        entryKeys: keys,
        feedback,
        ...(draftId ? { draftId } : {}),
      });
      setChosen([]);
      setSelectionBase(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function complete() {
    setBusy(true);
    setError("");
    try {
      if (conflict)
        throw new Error(
          "Die ausgewählte Reviewquelle wurde geändert. Auswahl erneut prüfen.",
        );
      const selected = items.filter((i) => chosen.includes(i.entryKey));
      if (
        selected.some(
          (i) => !i.basis || !["active", "completed"].includes(i.native),
        )
      )
        throw new Error(
          "Eine ausgewählte Instanz ist ungeklärt oder wurde geändert. Bitte zuerst die Quelle prüfen.",
        );
      await act("review-close", {
        contextId: context.id,
        revision: selectionBase?.revision ?? resource.data?.routineRevision,
        contextRevision:
          selectionBase?.contextRevision ?? resource.data?.contextRevision,
        items: selected.map((i) => ({ entryKey: i.entryKey, basis: i.basis })),
        acknowledgeDestructive: confirm,
        acknowledgeHierarchy: hierarchy,
      });
      setChosen([]);
      setSelectionBase(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card routine-step">
      <h2>Ein ruhiger Rückblick · {context.name}</h2>
      {state.reviewPlan ? (
        <p>
          Letzter relevanter bestätigter Plan: {state.reviewPlan.day}. Ältere
          Reviewlücken bleiben in der Historie.
        </p>
      ) : (
        <p>
          Es gibt noch keinen früheren bestätigten Tagesplan. Hier ist nichts
          nachzuholen.
        </p>
      )}
      <p>Ohne Rückmeldung bleibt der Fortschritt unbekannt.</p>
      {(error || resource.error) && (
        <p role="alert">{error || resource.error}</p>
      )}
      <button
        className="secondary"
        disabled={busy}
        onClick={() => void load().catch(() => {})}
      >
        Reviewquelle aktualisieren
      </button>
      {!loaded && !error && <p role="status">Review wird gelesen …</p>}
      {items.map((item) => (
        <article key={item.entryKey} className="routine-review-card">
          <label className="check-label">
            <input
              aria-label={
                "Für Sammelrückmeldung auswählen: " + item.entry.source.content
              }
              type="checkbox"
              checked={chosen.includes(item.entryKey)}
              disabled={
                busy ||
                item.feedback?.status === "completed" ||
                (!!item.feedback?.operationId &&
                  ["queued", "running", "unknown", "partial"].includes(
                    item.feedback.operationStatus ?? "",
                  ))
              }
              onChange={(e) => choose(item, e.target.checked)}
            />
            <strong>{item.entry.source.content}</strong>
          </label>
          <p>
            {item.feedback?.status === "completed"
              ? "Erledigt – nachgewiesen"
              : item.feedback?.status === "not_started"
                ? "Nicht begonnen – ausdrücklich rückgemeldet"
                : item.feedback?.status === "partial"
                  ? "Teilweise erledigt – ausdrücklich rückgemeldet"
                  : "Fortschritt unbekannt"}
            {item.feedback?.requested === "completed" &&
            item.feedback.status === "unknown"
              ? " · Gewünschter Abschluss ist noch nicht nachgewiesen"
              : ""}
          </p>
          {item.native === "instance_changed" && (
            <p>
              In Todoist liegt eine andere Wiederholungsinstanz vor. Sie wird
              hier nicht abgeschlossen.
            </p>
          )}
          {item.native === "unknown" && (
            <p>
              Aktueller Todoist-Zustand unbekannt; daraus wird kein Abschluss
              abgeleitet.
            </p>
          )}
          {item.native === "completed" &&
            item.feedback?.status !== "completed" && (
              <p>
                Todoist meldet diese Instanz als erledigt. Du kannst den
                Nachweis bewusst übernehmen.
              </p>
            )}
          {item.native === "active" && (
            <div className="routine-actions">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setEditing(item)}
              >
                Fortschritt dokumentieren
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void report("partial", [item.entryKey])}
              >
                Teilweise erledigt bestätigen
              </button>
            </div>
          )}
          {item.feedback?.operationId &&
            ["failed", "partial", "unknown"].includes(
              item.feedback.operationStatus ?? "",
            ) && (
              <button
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void routineRequest("/api/tasks/resume", {
                    operationId: item.feedback!.operationId,
                  })
                    .then(refresh)
                    .then(load)
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                Diesen Abschluss prüfen und bewusst fortsetzen
              </button>
            )}
        </article>
      ))}
      {conflict && (
        <p role="alert">
          Die Reviewquelle oder Rückmeldungen wurden zwischenzeitlich geändert.
          Deine Auswahl bleibt sichtbar.{" "}
          <button
            onClick={() => {
              setChosen([]);
              setSelectionBase(null);
            }}
          >
            Auswahl zurücksetzen und aktuellen Stand prüfen
          </button>
        </p>
      )}
      {chosen.length > 0 && (
        <div className="routine-bulk">
          <button disabled={busy} onClick={() => void report("not_started")}>
            Ausgewählte als nicht begonnen bestätigen
          </button>
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            Ausgewählte Aufgaben bewusst abschliessen
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={hierarchy}
              onChange={(e) => setHierarchy(e.target.checked)}
            />
            Erforderliche Auswirkungen auf die Hierarchie ausdrücklich
            bestätigen
          </label>
          <button
            disabled={busy || !confirm || conflict}
            onClick={() => void complete()}
          >
            Abschlüsse einzeln nachweisen
          </button>
        </div>
      )}
      {routine.pendingReviews
        ?.filter((d) => d.command.contextId === context.id)
        .map((d) => (
          <button
            key={d.key}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void routineRequest("/api/routine/review-close", d.command)
                .then(refresh)
                .then(load)
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Bestätigte Sammelentscheidung fortsetzen
          </button>
        ))}
      {editing && (
        <TaskEditor
          key={editing.entryKey}
          snapshot={snapshot}
          context={context}
          taskId={editing.entry.taskId}
          initialMode="progress"
          expectedInstanceKey={editing.entryKey}
          close={() => {
            setEditing(null);
            void refresh()
              .then(load)
              .catch(() => {});
          }}
        />
      )}
    </section>
  );
}
