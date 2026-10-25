"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@helios/ui";
import type { AiJobDetail } from "@helios/contracts";
import { UiDialog } from "./ui-help";
import { useNavigationLock } from "./navigation-lock";
import { useAiJobCapture, type CaptureOrigin } from "./use-ai-job-capture";
import { AiJobFields } from "./ai-job-fields";
export function AiJobCapture({
  disabled = false,
  origin,
}: Readonly<{ disabled?: boolean; origin?: CaptureOrigin }>) {
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
}: Readonly<{ origin?: CaptureOrigin; close: () => void }>) {
  const capture = useAiJobCapture(origin);
  const [discard, setDiscard] = useState(false);
  useNavigationLock(capture.dirty || capture.busy || capture.unknown);
  let content: ReactNode;
  if (capture.existingId)
    content = (
      <div>
        <p>Diese Unteraufgabe verweist bereits auf einen lokalen KI-Auftrag.</p>
        <Link href={"/ai-jobs?job=" + capture.existingId} onClick={close}>
          Zugehörigen KI-Auftrag öffnen
        </Link>
      </div>
    );
  else if (capture.created)
    content = <CreatedJob job={capture.created} close={close} />;
  else if (discard)
    content = (
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
    );
  else content = <AiJobFields capture={capture} />;
  function requestClose() {
    if (capture.unknown) return;
    if (capture.dirty) setDiscard(true);
    else close();
  }
  return (
    <UiDialog
      title={
        capture.delegated ? "Aufgabe an KI delegieren" : "Neuer KI-Auftrag"
      }
      busy={capture.busy}
      close={requestClose}
    >
      {capture.error && (
        <p role="alert" className="form-error">
          {capture.error}
        </p>
      )}
      {content}
    </UiDialog>
  );
}
function CreatedJob({
  job,
  close,
}: Readonly<{ job: AiJobDetail; close: () => void }>) {
  return (
    <div>
      <output>
        Auftrag gespeichert.
        {job.status === "linking"
          ? " Die Todoist-Unteraufgabe wird über das Operationsjournal geprüft."
          : " In Warteschlange."}
      </output>
      <p className="ai-job-id">{job.id}</p>
      <Link href={"/ai-jobs?job=" + job.id} onClick={close}>
        KI-Auftrag öffnen
      </Link>
    </div>
  );
}
