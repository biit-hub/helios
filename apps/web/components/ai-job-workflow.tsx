"use client";
import { useEffect, useState } from "react";
import type { AiJobDetail } from "@helios/contracts";
import { jobRequest, AiJobRequestError } from "./ai-job-client";
type Pending = {
  action: string;
  body: {
    key: string;
    id: string;
    revision: number;
    text?: string;
    questionId?: string;
  };
};
export function AiJobWorkflow({
  job,
  updated,
  deleted,
  dirty,
}: Readonly<{
  job: AiJobDetail;
  updated: (job: AiJobDetail) => void;
  deleted: () => void;
  dirty: (value: boolean) => void;
}>) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"close" | "delete" | "retry" | null>(
    null,
  );
  useEffect(() => {
    dirty(!!text || busy || !!pending);
    return () => dirty(false);
  }, [text, busy, pending, dirty]);
  const question = job.turns.filter((t) => t.kind === "question").at(-1);
  const incompleteClose =
    job.status === "closed" &&
    job.reference?.state === "closing" &&
    !job.reference.closeOperationId;
  function accepted(value: AiJobDetail, request: Pending) {
    updated(value);
    const event = value.events.find((e) => e.key === request.body.key);
    if (
      event &&
      !(
        request.action === "close" &&
        value.reference &&
        !value.reference.closeOperationId
      )
    ) {
      setPending(null);
      setText("");
      setConfirm(null);
    }
    return !!event;
  }
  async function reconcile() {
    setBusy(true);
    setError("");
    try {
      const value = await jobRequest<AiJobDetail>("/api/ai-jobs?id=" + job.id);
      if (pending) accepted(value, pending);
      else updated(value);
    } catch (e) {
      if (
        pending?.action === "delete" &&
        e instanceof AiJobRequestError &&
        e.status === 404
      ) {
        deleted();
        return;
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(action: string, repeat?: Pending) {
    const request = repeat ?? {
      action,
      body: {
        key: crypto.randomUUID(),
        id: job.id,
        revision: job.revision,
        ...(action === "answer" ? { text, questionId: question?.id } : {}),
        ...(action === "refine" ? { text } : {}),
      },
    };
    setBusy(true);
    setPending(request);
    setError("");
    try {
      const value = await jobRequest<AiJobDetail>(
        "/api/ai-jobs/" + request.action,
        request.body,
      );
      if (request.action === "delete") {
        deleted();
        return;
      }
      accepted(value, request);
    } catch (e) {
      setError((e as Error).message);
      if (
        e instanceof AiJobRequestError &&
        e.status < 500 &&
        ![401, 403, 408].includes(e.status)
      )
        setPending(null);
      try {
        updated(await jobRequest<AiJobDetail>("/api/ai-jobs?id=" + job.id));
      } catch {
        /* Keep inputs and the original admission key. */
      }
    } finally {
      setBusy(false);
    }
  }
  function finishClose() {
    const event = job.events.find((e) => e.kind === "closed");
    if (!event?.key) return;
    void submit("close", {
      action: "close",
      body: { key: event.key, id: job.id, revision: event.revision - 1 },
    });
  }
  return (
    <div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {pending ? (
        <fieldset aria-label="Ungeklärte Rückmeldung">
          <p>
            Die Rückmeldung ist noch nicht vollständig bestätigt. Deine Eingabe
            und derselbe Auftragsschlüssel bleiben erhalten.
          </p>
          <div className="actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => void reconcile()}
            >
              Gespeicherten Stand prüfen
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void submit(pending.action, pending)}
            >
              Dieselbe Anfrage abgleichen
            </button>
          </div>
        </fieldset>
      ) : (
        <>
          {(job.status === "awaiting_input" || job.status === "ready") && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit(
                  job.status === "awaiting_input" ? "answer" : "refine",
                );
              }}
            >
              {job.status === "awaiting_input" && (
                <p className="ai-job-text">
                  <strong>Rückfrage:</strong> {question?.text}
                </p>
              )}
              <label>
                <span>
                  {job.status === "awaiting_input"
                    ? "Deine Antwort"
                    : "Nachbearbeitung anfordern"}
                </span>
                <textarea
                  rows={3}
                  maxLength={12000}
                  required
                  value={text}
                  disabled={busy}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <div className="actions">
                <button
                  type="submit"
                  disabled={
                    busy ||
                    !text.trim() ||
                    (job.status === "awaiting_input" && !question)
                  }
                >
                  {job.status === "awaiting_input"
                    ? "Antwort speichern & fortsetzen"
                    : "Nachbearbeitung einreihen"}
                </button>
              </div>
            </form>
          )}
          <div className="actions">
            {job.status === "ready" && (
              <button
                type="button"
                disabled={busy || !!text}
                onClick={() => setConfirm("close")}
              >
                Auftrag abschliessen
              </button>
            )}
            {job.status === "error" &&
              (!job.reference || job.reference.state === "verified") && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirm("retry")}
                >
                  Bewusst erneut bearbeiten
                </button>
              )}
            {incompleteClose && (
              <button type="button" disabled={busy} onClick={finishClose}>
                Todoist-Abschluss vorbereiten
              </button>
            )}
            {!["queued", "running", "linking"].includes(job.status) && (
              <button
                type="button"
                className="secondary"
                disabled={busy || !!text}
                onClick={() => setConfirm("delete")}
              >
                Auftrag löschen
              </button>
            )}
          </div>
          {confirm && (
            <fieldset aria-label="Auftragsaktion bestätigen">
              <p>
                {confirm === "close"
                  ? "Diesen Auftrag bewusst abschliessen? Eine verknüpfte KI-Unteraufgabe wird über das Operationsjournal abgeschlossen. Die Hauptaufgabe bleibt unverändert."
                  : confirm === "retry"
                    ? "Einen neuen Bearbeitungsversuch mit demselben gespeicherten Modell starten? Der bisherige Verlauf bleibt erhalten."
                    : "Diesen lokalen Auftrag mit Gespräch, Ergebnissen und Dateien endgültig löschen? Todoist-Aufgaben und das Operationsjournal bleiben erhalten. Bestehende verschlüsselte Backups werden dadurch nicht rückwirkend verändert."}
              </p>
              <div className="actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submit(confirm)}
                >
                  Bestätigen
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setConfirm(null)}
                >
                  Abbrechen
                </button>
              </div>
            </fieldset>
          )}
        </>
      )}
    </div>
  );
}
