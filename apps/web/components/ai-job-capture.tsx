"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@helios/ui";
import {
  aiJobOutputs,
  aiJobFormats,
  aiJobOutputNames,
  aiJobFormatNames,
  type AiJobCreate,
  type AiJobSettings,
  type AiJobDetail,
  type TaskInspection,
} from "@helios/contracts";
import { UiDialog, InfoTip } from "./ui-help";
import { useNavigationLock } from "./navigation-lock";
import { jobRequest, AiJobRequestError } from "./ai-job-client";

export function AiJobCapture({
  disabled = false,
  origin,
}: Readonly<{
  disabled?: boolean;
  origin?: { contextId: string; taskId: string };
}>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={origin ? "secondary" : undefined}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Icon name="sparkles" />
        {origin ? "An KI delegieren" : "KI-Auftrag starten"}
      </button>
      {open && <CaptureForm origin={origin} close={() => setOpen(false)} />}
    </>
  );
}
function CaptureForm({
  origin,
  close,
}: Readonly<{
  origin?: { contextId: string; taskId: string };
  close: () => void;
}>) {
  const [capturedOrigin] = useState(origin);
  const [settings, setSettings] = useState<AiJobSettings | null>(null);
  const [source, setSource] = useState<TaskInspection | null>(null);
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState<AiJobCreate["output"]>("text");
  const [format, setFormat] =
    useState<NonNullable<AiJobCreate["format"]>>("docx");
  const [key] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [discard, setDiscard] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [created, setCreated] = useState<AiJobDetail | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const dirty = !!prompt.trim() && !created && !existingId;
  useNavigationLock(dirty || busy || unknown);
  useEffect(() => {
    const abort = new AbortController();
    void Promise.all([
      jobRequest<AiJobSettings>(
        "/api/ai-jobs/settings",
        undefined,
        abort.signal,
      ),
      capturedOrigin
        ? jobRequest<TaskInspection>(
            "/api/tasks?" + new URLSearchParams(capturedOrigin),
            undefined,
            abort.signal,
          )
        : Promise.resolve(null),
      capturedOrigin
        ? jobRequest<{ id: string | null }>(
            "/api/ai-jobs?" +
              new URLSearchParams({
                contextId: capturedOrigin.contextId,
                refTask: capturedOrigin.taskId,
              }),
            undefined,
            abort.signal,
          )
        : Promise.resolve({ id: null }),
    ])
      .then(([s, task, reference]) => {
        setExistingId(reference.id);
        setSettings(s);
        setSource(task);
        const enabled = s.outputs.find((o) => o.available);
        if (enabled) setOutput(enabled.output);
        if (task)
          setPrompt(
            (task.task.content + "\n\n" + task.task.description).slice(
              0,
              12000,
            ),
          );
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [capturedOrigin]);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const value = await jobRequest<AiJobDetail>("/api/ai-jobs/create", {
        key,
        prompt,
        output,
        format: output === "file" ? format : null,
        origin:
          capturedOrigin && source
            ? { ...capturedOrigin, basis: source.basis }
            : null,
      });
      setCreated(value);
      setUnknown(false);
      window.dispatchEvent(new Event("helios:ai-jobs-changed"));
    } catch (e) {
      setError((e as Error).message);
      if (!(e instanceof AiJobRequestError)) setUnknown(true);
    } finally {
      setBusy(false);
    }
  }
  async function reconcile() {
    setBusy(true);
    setError("");
    try {
      const value = await jobRequest<AiJobDetail>("/api/ai-jobs?id=" + key);
      setCreated(value);
      setUnknown(false);
      window.dispatchEvent(new Event("helios:ai-jobs-changed"));
    } catch (e) {
      setError(
        (e as Error).message + " Nicht erneut mit einer neuen ID anlegen.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <UiDialog
      title={origin ? "Aufgabe an KI delegieren" : "Neuer KI-Auftrag"}
      busy={busy}
      close={() => {
        if (dirty && !unknown) setDiscard(true);
        else if (!unknown) close();
      }}
    >
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {existingId ? (
        <div>
          <p>
            Diese Unteraufgabe verweist bereits auf einen lokalen KI-Auftrag.
          </p>
          <Link href={"/ai-jobs?job=" + existingId} onClick={close}>
            Zugehörigen KI-Auftrag öffnen
          </Link>
        </div>
      ) : created ? (
        <div>
          <p role="status">
            Auftrag gespeichert.
            {created.status === "linking"
              ? " Die Todoist-Unteraufgabe wird über das Operationsjournal geprüft."
              : " In Warteschlange."}
          </p>
          <p className="ai-job-id">{created.id}</p>
          <Link href={"/ai-jobs?job=" + created.id} onClick={close}>
            KI-Auftrag öffnen
          </Link>
        </div>
      ) : discard ? (
        <div>
          <p>Ungespeicherten KI-Auftrag verwerfen?</p>
          <div className="actions">
            <button type="button" onClick={() => setDiscard(false)}>
              Weiterbearbeiten
            </button>
            <button type="button" className="secondary" onClick={close}>
              Eingaben verwerfen
            </button>
          </div>
        </div>
      ) : (
        <form
          className="ai-job-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {!settings && !error && (
            <p role="status">Lokale Modelle werden geprüft …</p>
          )}
          {source && (
            <p>
              Ursprung: <strong>{source.task.content}</strong>
            </p>
          )}
          <label>
            Auftrag
            <textarea
              value={prompt}
              maxLength={12000}
              rows={7}
              required
              disabled={
                busy || unknown || !settings || (!!capturedOrigin && !source)
              }
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
          <div className="ai-job-fields">
            <label>
              Ausgabe
              <select
                value={output}
                disabled={
                  busy || unknown || !settings || (!!capturedOrigin && !source)
                }
                onChange={(e) =>
                  setOutput(e.target.value as AiJobCreate["output"])
                }
              >
                {aiJobOutputs.map((o) => (
                  <option
                    key={o}
                    value={o}
                    disabled={
                      !settings?.outputs.find((s) => s.output === o)?.available
                    }
                  >
                    {aiJobOutputNames[o]}
                    {!settings?.outputs.find((s) => s.output === o)?.available
                      ? " · nicht verfügbar"
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            {output === "file" && (
              <label>
                Dateiformat
                <select
                  value={format}
                  disabled={
                    busy ||
                    unknown ||
                    !settings ||
                    (!!capturedOrigin && !source)
                  }
                  onChange={(e) => setFormat(e.target.value as typeof format)}
                >
                  {aiJobFormats.map((f) => (
                    <option key={f} value={f}>
                      {aiJobFormatNames[f]}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <p className="help">
            {origin
              ? "Todoist erhält nur eine Unteraufgabe mit der Auftrags-ID. Der Prompt bleibt lokal."
              : "Dieser Auftrag bleibt lokal und erzeugt keine Todoist-Aufgabe."}{" "}
            <InfoTip label="KI-Auftragsmodell">
              {settings?.outputs.find((s) => s.output === output)?.model ??
                "Kein Modell gewählt"}
              . Originalprompt, Modell und Verlauf werden dauerhaft lokal
              gespeichert.
            </InfoTip>
          </p>
          {!settings?.outputs.some((s) => s.available) && settings && (
            <p>
              <Link href="/settings/contexts#ai-delegation">
                Ausgabe und lokales Modell in den Einstellungen aktivieren
              </Link>
            </p>
          )}
          {unknown ? (
            <div>
              <p role="status">
                Übermittlung ungeklärt. Eingaben und ID bleiben erhalten; zuerst
                den gespeicherten Stand prüfen.
              </p>
              <div className="actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void reconcile()}
                >
                  Auftragsstatus prüfen
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void submit()}
                >
                  Mit derselben ID erneut senden
                </button>
              </div>
              <p className="help">
                Die unveränderte Anfrage wird anhand derselben ID abgeglichen.
                Ein bestehender Auftrag und sein Todoist-Schreibjournal werden
                wiederverwendet.
              </p>
            </div>
          ) : (
            <button
              type="submit"
              disabled={
                busy ||
                !settings?.outputs.find((s) => s.output === output)
                  ?.available ||
                !prompt.trim() ||
                (!!origin && !source)
              }
            >
              Auftrag erstellen
            </button>
          )}
        </form>
      )}
    </UiDialog>
  );
}
