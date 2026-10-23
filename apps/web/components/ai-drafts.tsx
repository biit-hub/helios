"use client";
import { useNavigationLock } from "./navigation-lock";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AiDraftView,
  AiPatch,
  DraftPatch,
  WorkSnapshot,
  TaskFields,
} from "@helios/contracts";
async function request(path: string, body?: unknown) {
  const r = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const value = await r.json();
  if (!r.ok)
    throw new Error(
      value.error?.message ??
        "Die Anfrage ist fehlgeschlagen. Eingabe bleibt erhalten.",
    );
  return value;
}
const labels: Record<AiPatch["kind"], string> = {
  goal: "Ziel gezielt ersetzen",
  title: "Titel",
  comment: "Fortschrittskommentar",
  "description-append": "Beschreibung ergänzen",
  "check-add": "Checklistenpunkt ergänzen",
  "check-complete": "Vorhandenen Checklistenpunkt abhaken",
  remaining: "Restaufwand in Minuten (Schätzung)",
  due: "Geplantes Datum",
  deadline: "Ausdrückliche Abgabefrist",
  project: "Projektvorschlag (keine Zuordnung)",
  subtask: "Eigenständig planbare Unteraufgabe",
};
const messages: Record<string, string> = {
  AI_SOURCE_TOO_LARGE:
    "Die KI-Quelle ist zu umfangreich. Ziele und Checklisten bleiben manuell bearbeitbar; bitte die Aufgabe oder einen kleineren Teilbaum gezielt prüfen.",
  AI_PROFILE_CHANGED:
    "Modell oder Prompt wurden geändert. Quelle prüfen und KI bewusst erneut versuchen.",
  AI_LOCAL_MODEL_REQUIRED:
    "Das Modell ist nicht als lokale GGUF-Ausführung nachgewiesen. Es werden keine Aufgabendaten übertragen.",
  AI_UNAVAILABLE:
    "Die lokale KI ist nicht erreichbar oder nicht konfiguriert. Formular bleibt verfügbar.",
  AI_TIMEOUT:
    "Die KI hat nicht rechtzeitig geantwortet. Originaltext bleibt erhalten.",
  AI_MODEL_MISSING:
    "Das konfigurierte Modell ist nicht installiert. Es wird nichts heruntergeladen.",
  AI_INVALID_OUTPUT: "Ungültige KI-Antwort; keine Änderung angewandt.",
  AI_PATCH_INVALID:
    "Ein Vorschlag war nicht belegt oder unzulässig; keine Änderung angewandt.",
  AI_SOURCE_STALE:
    "Die Aufgabenquelle wurde verändert. Bitte Quelle prüfen und einen neuen Entwurf starten.",
  AI_INTERRUPTED:
    "Der KI-Lauf wurde unterbrochen. Nach Prüfung erneut versuchen.",
  CHECKLIST_AMBIGUOUS:
    "Die Checkliste ist mehrdeutig. Bestehende Beschreibung zuerst prüfen.",
};
export function AiDraftPanel({
  kind,
  contextId = null,
  taskId,
  snapshot,
  manualFields = {},
  expectedInstanceKey,
  active = true,
}: {
  kind:
    | "capture"
    | "progress"
    | "clarification"
    | "smart"
    | "epic"
    | "decomposition";
  contextId?: string | null;
  taskId?: string;
  snapshot: WorkSnapshot;
  manualFields?: Partial<TaskFields>;
  expectedInstanceKey?: string;
  active?: boolean;
}) {
  const [input, setInput] = useState(""),
    [draft, setDraft] = useState<AiDraftView | null>(null),
    [rows, setRows] = useState<AiDraftView[]>([]),
    [values, setValues] = useState<DraftPatch[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false),
    [project, setProject] = useState(""),
    [confirmProject, setConfirmProject] = useState(false),
    [available, setAvailable] = useState(true),
    [conflict, setConflict] = useState(false),
    [step, setStep] = useState<1 | 2 | 3>(1),
    [review, setReview] = useState("");
  useNavigationLock(saving || draft?.status === "applying");
  const unsaved = dirty || input !== (draft?.input ?? "") || !!project;
  useEffect(() => {
    if (!active || !unsaved) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [active, unsaved]);
  const state = useRef({ draft, dirty, values, saving });
  useEffect(() => {
    state.current = { draft, dirty, values, saving };
  }, [draft, dirty, values, saving]);
  const applying = useRef(false);
  const approved = useRef(new Map<string, string>());
  const inFlight = useRef<{
    patchId: string;
    operationId: string;
    readyRevision: number;
  } | null>(null);
  const startKey = useRef<{ input: string; key: string } | null>(null);
  const applyKey = useRef<{ revision: number; key: string } | null>(null);
  const applyNext = useCallback(
    async (d: AiDraftView) => {
      if (applying.current) return;
      applying.current = true;
      const chosen = d.patches.find(
        (p) => p.selected && !p.rejected && p.status === "pending",
      );
      try {
        if (applyKey.current?.revision !== d.revision)
          applyKey.current = { revision: d.revision, key: crypto.randomUUID() };
        const result = await request("/api/ai/apply", {
          id: d.id,
          revision: d.revision,
          key: applyKey.current!.key,
          projectId: kind === "capture" ? project || null : null,
          confirmProject: kind === "capture" && confirmProject,
        });
        inFlight.current = chosen
          ? {
              patchId: chosen.id,
              operationId: result.operationId,
              readyRevision:
                result.draft.status === "applying"
                  ? result.draft.revision + 1
                  : result.draft.revision,
            }
          : null;
        setDraft(result.draft);
        setValues(result.draft.patches);
      } catch (e) {
        setSaving(false);
        setError(
          e instanceof Error
            ? e.message
            : "Speichern fehlgeschlagen. Eingabe bleibt erhalten.",
        );
      } finally {
        applying.current = false;
      }
    },
    [kind, project, confirmProject],
  );
  const select = useCallback((d: AiDraftView) => {
    setDraft(d);
    setInput(d.input);
    setValues(d.patches);
    setDirty(false);
    setConflict(false);
    setError("");
    setReview("");
    setStep(
      d.patches.length &&
        !["queued", "running", "failed", "cancelled"].includes(d.status)
        ? 2
        : 1,
    );
  }, []);
  const read = useCallback(async () => {
    const q = new URLSearchParams();
    if (contextId) q.set("contextId", contextId);
    if (taskId) q.set("taskId", taskId);
    const data: { available: boolean; drafts: AiDraftView[] } = await request(
      "/api/ai?" + q,
    );
    setAvailable(data.available);
    const filtered = data.drafts.filter(
      (d) =>
        (!expectedInstanceKey || d.instanceKey === expectedInstanceKey) &&
        (d.kind === kind ||
          (kind === "clarification" && d.kind === "analysis")),
    );
    setRows((previous) =>
      filtered.map((d) => {
        const known = previous.find((p) => p.id === d.id);
        return known && known.revision > d.revision ? known : d;
      }),
    );
    const current = state.current.draft;
    if (!current && kind === "clarification") {
      const latest = filtered[0];
      if (latest) {
        setDraft(latest);
        setValues(latest.patches);
      }
    }
    if (current) {
      const next = filtered.find((d) => d.id === current.id);
      if (next && next.revision < current.revision) return;
      if (next && next.revision > current.revision) {
        if (state.current.dirty) {
          setConflict(true);
          setSaving(false);
          setError(
            "Dieser Entwurf wurde zwischenzeitlich geändert. Deine bearbeiteten Werte bleiben sichtbar. Gespeicherten Stand bewusst laden und vergleichen.",
          );
        } else {
          setDraft(next);
          setValues(next.patches);
          if (
            ["queued", "running"].includes(current.status) &&
            next.status === "ready" &&
            next.patches.length
          )
            setStep(2);
        }
      }
      if (next && next.status === "applied") setError("");
      if (next && state.current.saving && !state.current.dirty) {
        if (applying.current) return;
        if (next.status === "ready") {
          const step = inFlight.current;
          const verified =
            step &&
            next.patches.find(
              (p) =>
                p.id === step.patchId &&
                p.status === "verified" &&
                p.operationId === step.operationId,
            );
          const remaining = next.patches.filter(
            (p) => p.selected && !p.rejected && p.status === "pending",
          );
          if (
            !step ||
            !verified ||
            next.revision !== step.readyRevision ||
            remaining.some(
              (p) =>
                approved.current.get(p.id) !==
                JSON.stringify([p.kind, p.edited, p.target]),
            )
          ) {
            setSaving(false);
            setError(
              "Die Entwurfsentscheidungen wurden während des Speicherns geändert. Offene Änderungen erneut prüfen und bewusst bestätigen.",
            );
            return;
          }
        }
        if (
          next.status === "ready" &&
          !next.operationId &&
          next.patches.some(
            (p) => p.selected && !p.rejected && p.status === "pending",
          )
        )
          void applyNext(next);
        else if (
          ["ready", "applied", "partial", "stale", "failed"].includes(
            next.status,
          )
        )
          setSaving(false);
      }
    }
  }, [contextId, taskId, kind, applyNext, expectedInstanceKey]);
  const polling = active || saving;
  useEffect(() => {
    if (!polling) return;
    let alive = true;
    const refresh = () => {
      if (alive)
        void read().catch((e) => {
          if (alive) setError(e.message);
        });
    };
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [read, polling]);
  async function saveDecisions() {
    if (!draft) throw new Error("Kein Entwurf gewählt");
    const next: AiDraftView = await request("/api/ai/edit", {
      id: draft.id,
      revision: draft.revision,
      patches: values.map((p) => ({
        id: p.id,
        selected: p.selected,
        rejected: p.rejected,
        value: p.edited,
        target: p.target,
      })),
    });
    setDraft(next);
    setValues(next.patches);
    setDirty(false);
    return next;
  }
  function update(id: string, patch: Partial<DraftPatch>) {
    setValues((v) => v.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    setDirty(true);
  }
  function mayDiscard() {
    return (
      !(dirty || input !== (draft?.input ?? "") || project) ||
      window.confirm(
        "Ungespeicherte Eingaben verwerfen? Der gespeicherte Entwurf und bereits nachgewiesene Änderungen bleiben erhalten.",
      )
    );
  }
  async function action(name: string) {
    if (!draft || (name === "cancel" && !mayDiscard())) return;
    setBusy(true);
    setError("");
    try {
      const current = dirty ? await saveDecisions() : draft;
      const next: AiDraftView = await request("/api/ai/" + name, {
        id: current.id,
        revision: current.revision,
      });
      select(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }
  const waiting =
    !!draft && ["queued", "running", "applying"].includes(draft.status);
  const editable =
    !!draft &&
    ["ready", "partial"].includes(draft.status) &&
    !draft.operationId &&
    !conflict;
  const reviewKey = JSON.stringify([
    draft?.id,
    draft?.revision,
    values,
    project,
    confirmProject,
  ]);
  const selected = values.filter(
    (p) => p.selected && !p.rejected && p.status === "pending",
  );
  return (
    <section className="ai-panel" aria-label={kindText[kind].label}>
      <h3>{kindText[kind].title}</h3>
      <p>
        Die KI läuft auf deinem lokalen KI-Server. Vorschläge ändern noch keine
        Aufgabe.
      </p>
      {!available && (
        <p role="status">
          Ollama ist nicht konfiguriert. Der Formularmodus bleibt vollständig
          nutzbar.
        </p>
      )}
      <ol className="ai-steps" aria-label="KI-Arbeitsschritte">
        {["Klären", "Vorschlag bearbeiten", "Änderungen bestätigen"].map(
          (label, i) => (
            <li key={label} aria-current={step === i + 1 ? "step" : undefined}>
              {i + 1} · {label}
            </li>
          ),
        )}
      </ol>
      {step === 1 && (
        <>
          <label>
            <span>{kindText[kind].input}</span>
            <textarea
              maxLength={8000}
              disabled={busy || waiting}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="primary"
            disabled={
              busy ||
              waiting ||
              (["capture", "progress", "clarification"].includes(kind) &&
                !input.trim())
            }
            onClick={() => {
              if (dirty && !mayDiscard()) return;
              setBusy(true);
              setError("");
              const text = JSON.stringify({ input, manualFields });
              if (startKey.current?.input !== text)
                startKey.current = { input: text, key: crypto.randomUUID() };
              void request("/api/ai/start", {
                key: startKey.current!.key,
                kind,
                contextId,
                ...(taskId ? { taskId } : {}),
                input,
                ...(kind === "capture" ? { manualFields } : {}),
                ...(expectedInstanceKey ? { expectedInstanceKey } : {}),
              })
                .then(select)
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Vorschlag erstellen
          </button>
          {!draft && input && (
            <button
              type="button"
              disabled={busy || waiting}
              onClick={() => {
                if (mayDiscard()) setInput("");
              }}
            >
              Eingabe verwerfen
            </button>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {rows.length > 0 && (
        <details>
          <summary>Gespeicherte Entwürfe wieder öffnen</summary>
          {rows.map((d) => (
            <button
              type="button"
              key={d.id}
              disabled={saving || busy}
              onClick={(event) => {
                if (mayDiscard()) {
                  select(d);
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                }
              }}
            >
              {new Date(d.createdAt).toLocaleString("de-CH")} · {d.status} ·{" "}
              {d.input.slice(0, 60) || "Aufgabenanalyse"}
            </button>
          ))}
        </details>
      )}
      {draft && (
        <div className="ai-draft" aria-busy={waiting}>
          <p role="status">
            {draft.status === "queued"
              ? "Wartet auf lokale KI"
              : draft.status === "running"
                ? "Lokale KI analysiert …"
                : draft.status === "applying"
                  ? "Änderung angenommen; externer Nachweis steht aus."
                  : draft.status === "applied"
                    ? "Alle gewählten Änderungen sind extern nachgewiesen."
                    : draft.status === "partial"
                      ? "Teilergebnis: bestätigte Schritte bleiben erhalten. Offene Wirkung zuerst prüfen."
                      : draft.status === "failed"
                        ? "KI-Auswertung fehlgeschlagen."
                        : draft.status === "stale"
                          ? "Quelle verändert; Entwurf bleibt zur Prüfung erhalten."
                          : draft.status === "cancelled"
                            ? "KI-Entwurf abgebrochen."
                            : draft.status === "rejected"
                              ? "Vorschläge abgelehnt."
                              : "Entwurf bereit zur bewussten Prüfung."}
          </p>
          {draft.code && (
            <p role="alert">
              {messages[draft.code] ??
                "Die Änderung ist fehlgeschlagen oder ungeklärt. Den Operationsstand prüfen."}
            </p>
          )}
          {draft.output && (
            <details open={step === 1}>
              <summary>Klärung und Einschätzung</summary>
              <p>
                Klarheit:{" "}
                {draft.confirmedClear
                  ? "Von dir als klar bestätigt"
                  : draft.output.clarity === "clear"
                    ? "Klar"
                    : draft.output.clarity === "needs_context"
                      ? "Klärung nötig"
                      : "Unsicher"}
              </p>
              <p>{draft.output.reason}</p>
              {draft.output.smart?.map((s) => (
                <div key={s.component}>
                  <strong>
                    {s.component} · {s.status}
                  </strong>
                  <p>{s.assessment}</p>
                  {s.evidence && <blockquote>{s.evidence}</blockquote>}
                  {s.question && <p>{s.question}</p>}
                </div>
              ))}
              {draft.output.understanding && (
                <section>
                  <h4>Abgeleitetes Epic-Verständnis</h4>
                  <p>{draft.output.understanding.summary}</p>
                  {draft.output.understanding.contributions.map((c) => (
                    <p key={c.taskId}>
                      Aufgabe {c.taskId}: {c.reason} · Beleg: «{c.evidence}»
                    </p>
                  ))}
                  {draft.output.understanding.dependencies.map((d) => (
                    <p key={d.from + ":" + d.to}>
                      Abhängigkeit {d.from} → {d.to}: «{d.evidence}»
                    </p>
                  ))}
                  {draft.output.understanding.nextSteps.map((n) => (
                    <p key={n.taskId + ":" + n.text}>
                      Nächster Schritt ({n.taskId}): {n.text} · «{n.evidence}»
                    </p>
                  ))}
                </section>
              )}
              {draft.output.validationNotes?.map((note, i) => (
                <p key={i}>{note}</p>
              ))}
              {draft.output.missing.length > 0 && (
                <ul>
                  {draft.output.missing.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              )}
              {draft.staleDate && (
                <p>
                  Das Planungsdatum liegt in der Vergangenheit. Dies ist keine
                  Deadline und allein keine Ausführungsblockade.
                </p>
              )}
              {draft.output.nextStep && (
                <p>Nächster Schritt als Vorschlag: {draft.output.nextStep}</p>
              )}
              {draft.output.estimatedMinutes !== null && (
                <p>
                  KI-Schätzung: etwa {draft.output.estimatedMinutes} Minuten,
                  unsicher.
                </p>
              )}
              <p>Unsicherheit: {draft.output.uncertainty}</p>
            </details>
          )}
          {step === 1 &&
            kind !== "capture" &&
            draft.taskId &&
            !draft.confirmedClear && (
              <button
                type="button"
                disabled={busy || waiting}
                onClick={() => void action("clear")}
              >
                Ist klar
              </button>
            )}
          {step === 2 && (
            <p>
              Prüfe jede Änderung einzeln. Vorhandene Inhalte bleiben erhalten.
            </p>
          )}
          {step === 2 &&
            values.map((p) => (
              <fieldset
                key={p.id}
                className="ai-patch"
                disabled={!editable || p.status !== "pending" || saving || busy}
              >
                <legend>{labels[p.kind]}</legend>
                <details>
                  <summary>Begründung und Quellenbeleg</summary>
                  <p>{p.reason}</p>
                  <blockquote>{p.evidence}</blockquote>
                </details>
                {p.target && <p>Vorhandener Punkt: {p.target}</p>}
                {p.kind === "check-complete" ? (
                  <label>
                    Vorhandenen Punkt wählen
                    <select
                      aria-label="Checklistenpunkt zum Abhaken"
                      value={p.target ?? ""}
                      onChange={(e) =>
                        update(p.id, {
                          target: e.target.value,
                          edited: e.target.value,
                        })
                      }
                    >
                      {draft.checklist
                        .filter((x) => !x.checked)
                        .map((x) => (
                          <option value={x.text} key={x.text}>
                            {x.text}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : (
                  <label>
                    Vorschlag bearbeiten
                    <textarea
                      aria-label={labels[p.kind] + " bearbeiten"}
                      value={p.edited}
                      onChange={(e) => update(p.id, { edited: e.target.value })}
                    />
                  </label>
                )}
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={p.selected}
                    onChange={(e) =>
                      update(p.id, {
                        selected: e.target.checked,
                        rejected: false,
                      })
                    }
                  />
                  Diese Änderung auswählen
                </label>
                <button
                  type="button"
                  onClick={() =>
                    update(p.id, { selected: false, rejected: !p.rejected })
                  }
                >
                  {p.rejected
                    ? "Ablehnung zurücknehmen"
                    : "Diesen Vorschlag ablehnen"}
                </button>
                <p>
                  {p.status === "verified"
                    ? "Extern nachgewiesen"
                    : p.rejected
                      ? "Abgelehnt"
                      : p.status !== "pending"
                        ? "Ausführung: " + p.status
                        : "Noch nicht gespeichert"}
                </p>
              </fieldset>
            ))}
          {step === 3 && (
            <section className="ai-review" aria-label="Auswahl zur Bestätigung">
              <h4>Diese Änderungen übernehmen?</h4>
              {kind === "capture" && (
                <p>
                  Ziel:{" "}
                  {project && confirmProject
                    ? (snapshot.projects.find((p) => p.id === project)?.name ??
                      "Gewähltes Projekt")
                    : "Nativer Todoist-Eingang"}
                </p>
              )}
              {values
                .filter((p) => p.selected && !p.rejected)
                .map((p) => (
                  <div className="ai-review-patch" key={p.id}>
                    <strong>{labels[p.kind]}</strong>
                    <p>{p.edited}</p>
                    <span>
                      {p.status === "verified"
                        ? "Extern nachgewiesen"
                        : p.status === "pending"
                          ? "Zur Bestätigung ausgewählt"
                          : "Ausführung: " + p.status}
                    </span>
                  </div>
                ))}
              {!selected.length && editable && (
                <p>Keine offenen Änderungen ausgewählt.</p>
              )}
              <p>
                Nur deine Auswahl wird gespeichert. Die Quelle wird vorher
                erneut geprüft.
              </p>
            </section>
          )}
          {step === 2 && kind === "capture" && editable && (
            <>
              <label>
                Projekt bewusst wählen
                <select
                  value={project}
                  onChange={(e) => {
                    setProject(e.target.value);
                    setConfirmProject(false);
                  }}
                >
                  <option value="">Keine Projektwahl → nativer Eingang</option>
                  {snapshot.projects
                    .filter((p) => p.available && !p.inbox)
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              {project && (
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={confirmProject}
                    onChange={(e) => setConfirmProject(e.target.checked)}
                  />
                  Dieses Projekt für die neue Aufgabe ausdrücklich bestätigen
                </label>
              )}
              <p>
                Ohne bestätigte Projektwahl wird im nativen Todoist-Eingang
                gespeichert.
              </p>
            </>
          )}
          {editable &&
            values.length === 0 &&
            ["smart", "epic", "decomposition"].includes(kind) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void action("reject")}
              >
                Einschätzung ablehnen
              </button>
            )}
          {editable && (
            <>
              {step === 2 && (
                <button
                  type="button"
                  disabled={busy || saving || !dirty}
                  onClick={() => {
                    setBusy(true);
                    setError("");
                    void saveDecisions()
                      .catch((e) => setError(e.message))
                      .finally(() => setBusy(false));
                  }}
                >
                  Entwurfsentscheidungen speichern
                </button>
              )}
              {step === 2 && (
                <button
                  type="button"
                  className="primary"
                  disabled={busy || saving || !selected.length}
                  onClick={() => {
                    setReview(reviewKey);
                    setStep(3);
                  }}
                >
                  Auswahl prüfen
                </button>
              )}
              {step === 3 && review !== reviewKey && !error && (
                <p role="alert">
                  Die Auswahl oder Quelle wurde geändert. Zurück zum Bearbeiten
                  und die Auswahl erneut prüfen.
                </p>
              )}
              {step === 3 && (
                <button
                  type="button"
                  className="primary"
                  disabled={
                    busy ||
                    saving ||
                    review !== reviewKey ||
                    !values.some(
                      (p) =>
                        p.selected && !p.rejected && p.status === "pending",
                    )
                  }
                  onClick={() => {
                    if (review !== reviewKey || conflict) return;
                    setBusy(true);
                    setError("");
                    void (dirty ? saveDecisions() : Promise.resolve(draft))
                      .then((d) => {
                        approved.current = new Map(
                          d.patches
                            .filter(
                              (p) =>
                                p.selected &&
                                !p.rejected &&
                                p.status === "pending",
                            )
                            .map((p) => [
                              p.id,
                              JSON.stringify([p.kind, p.edited, p.target]),
                            ]),
                        );
                        inFlight.current = null;
                        setSaving(true);
                        return applyNext(d);
                      })
                      .catch((e) => setError(e.message))
                      .finally(() => setBusy(false));
                  }}
                >
                  Ausgewählte Änderungen bewusst speichern
                </button>
              )}
            </>
          )}
          {!waiting && !saving && (
            <div className="ai-step-actions">
              {step !== 1 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setReview("");
                    setStep(step === 3 ? 2 : 1);
                  }}
                >
                  {step === 3 ? "Zurück zum Bearbeiten" : "Zurück zur Klärung"}
                </button>
              )}
              {step === 1 && values.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setStep(2)}
                >
                  Vorhandene Vorschläge bearbeiten
                </button>
              )}
            </div>
          )}
          {draft.operationId &&
            draft.status === "partial" &&
            draft.patches.some(
              (p) =>
                p.operationId === draft.operationId && p.status === "failed",
            ) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void action("reopen")}
              >
                Fehlgeschlagenen Schritt ohne externe Wirkung bearbeiten
              </button>
            )}
          {draft.operationId && draft.status === "partial" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void request("/api/tasks/resume", {
                  operationId: draft.operationId,
                })
                  .then(() => read())
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              Externe Wirkung prüfen und bewusst fortsetzen
            </button>
          )}
          {["failed", "cancelled"].includes(draft.status) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void action("retry")}
            >
              {draft.output
                ? "Entwurf wieder aufnehmen"
                : "KI erneut versuchen"}
            </button>
          )}
          {["queued", "running", "ready", "failed"].includes(draft.status) &&
            !draft.operationId && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void action("cancel")}
              >
                {step === 1 ? "Klärung beenden" : "KI-Entwurf abbrechen"}
              </button>
            )}
          <details>
            <summary>Originaleingabe und Herkunft</summary>
            <pre>{draft.input}</pre>
            <p>
              Modell {draft.model}{" "}
              {draft.output?.modelDigest
                ? "· Gewichte " + draft.output.modelDigest.slice(0, 12)
                : ""}{" "}
              · Zeitzone {draft.timezone} · Prompt {draft.promptVersion} ·
              Schema {draft.schemaVersion}
            </p>
          </details>
          <details>
            <summary>Technische Nachweise</summary>
            <p>
              Entwurfsrevision {draft.revision} · Quellenfingerabdruck{" "}
              {draft.sourceFingerprint}
            </p>
            {draft.operationId && (
              <p>Gespeicherter Auftrag: {draft.operationId}</p>
            )}
            {values.map((p) => (
              <p key={p.id}>
                {labels[p.kind]}: {p.status}
                {p.operationId ? " · Auftrag " + p.operationId : ""}
              </p>
            ))}
          </details>
          {conflict && (
            <button
              type="button"
              onClick={() => {
                const remote = rows.find((d) => d.id === draft.id);
                if (remote && mayDiscard()) select(remote);
              }}
            >
              Gespeicherten Entwurfsstand bewusst laden
            </button>
          )}
        </div>
      )}
    </section>
  );
}

const kindText: Record<
  "capture" | "progress" | "clarification" | "smart" | "epic" | "decomposition",
  { label: string; title: string; input: string }
> = {
  capture: {
    label: "KI-Aufgabenerfassung",
    title: "Aus Gedanken wird ein prüfbarer Entwurf",
    input: "Aufgabe in eigenen Worten",
  },
  progress: {
    label: "Fortschritt dokumentieren",
    title: "Fortschritt dokumentieren",
    input: "Was hast du erledigt?",
  },
  clarification: {
    label: "Aufgabenklärung",
    title: "Aufgabe gemeinsam klären",
    input: "Deine Antwort auf die Klärungsfragen",
  },
  smart: {
    label: "SMART-Ziel prüfen",
    title: "SMART-Ziel prüfen",
    input: "Bekannte Zielinformationen / Antworten auf SMART-Fragen",
  },
  epic: {
    label: "Epic-Verständnis prüfen",
    title: "Epic-Verständnis prüfen",
    input: "Deine Korrektur zum Epic-Verständnis (vorrangig)",
  },
  decomposition: {
    label: "Aufgabe sinnvoll zerlegen",
    title: "Aufgabe sinnvoll zerlegen",
    input: "Welche Arbeitspakete sind bekannt?",
  },
};
