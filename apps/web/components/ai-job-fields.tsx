"use client";
import Link from "next/link";
import {
  aiJobOutputs,
  aiJobFormats,
  aiJobOutputNames,
  aiJobFormatNames,
  type AiJobCreate,
} from "@helios/contracts";
import type { CaptureController } from "./use-ai-job-capture";
import { InfoTip } from "./ui-help";
export function AiJobFields({
  capture: c,
}: Readonly<{ capture: CaptureController }>) {
  return (
    <form
      className="ai-job-form"
      onSubmit={(e) => {
        e.preventDefault();
        void c.submit();
      }}
    >
      {!c.settings && !c.error && (
        <output>Lokale Modelle werden geprüft …</output>
      )}
      {c.source && (
        <p>
          Ursprung: <strong>{c.source.task.content}</strong>
        </p>
      )}
      <label>
        <span>Auftrag</span>
        <textarea
          value={c.prompt}
          maxLength={12000}
          rows={7}
          required
          disabled={c.locked}
          onChange={(e) => c.setPrompt(e.target.value)}
        />
      </label>
      <div className="ai-job-fields">
        <label>
          <span>Ausgabe</span>
          <select
            value={c.output}
            disabled={c.locked}
            onChange={(e) =>
              c.setOutput(e.target.value as AiJobCreate["output"])
            }
          >
            {aiJobOutputs.map((o) => (
              <option
                key={o}
                value={o}
                disabled={
                  !c.settings?.outputs.find((s) => s.output === o)?.available
                }
              >
                {aiJobOutputNames[o]}
                {!c.settings?.outputs.find((s) => s.output === o)?.available
                  ? " · nicht verfügbar"
                  : ""}
              </option>
            ))}
          </select>
        </label>
        {c.output === "file" && (
          <label>
            <span>Dateiformat</span>
            <select
              value={c.format}
              disabled={c.locked}
              onChange={(e) => c.setFormat(e.target.value as typeof c.format)}
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
        {c.delegated
          ? "Todoist erhält nur eine Unteraufgabe mit der Auftrags-ID. Der Prompt bleibt lokal."
          : "Dieser Auftrag bleibt lokal und erzeugt keine Todoist-Aufgabe."}{" "}
        <InfoTip label="KI-Auftragsmodell">
          {c.selected?.model ?? "Kein Modell gewählt"}. Originalprompt, Modell
          und Verlauf werden dauerhaft lokal gespeichert.
        </InfoTip>
      </p>
      {!c.settings?.outputs.some((s) => s.available) && c.settings && (
        <p>
          <Link href="/settings/contexts#ai-delegation">
            Ausgabe und lokales Modell in den Einstellungen aktivieren
          </Link>
        </p>
      )}
      {c.unknown ? (
        <UnknownActions capture={c} />
      ) : (
        <button type="submit" disabled={!c.canSubmit}>
          Auftrag erstellen
        </button>
      )}
    </form>
  );
}
function UnknownActions({
  capture: c,
}: Readonly<{ capture: CaptureController }>) {
  return (
    <div>
      <output>
        Übermittlung ungeklärt. Eingaben und ID bleiben erhalten; zuerst den
        gespeicherten Stand prüfen.
      </output>
      <p className="ai-job-id">Auftrags-ID: {c.id}</p>
      <div className="actions">
        <button
          type="button"
          disabled={c.busy}
          onClick={() => void c.reconcile()}
        >
          Auftragsstatus prüfen
        </button>
        <button
          type="button"
          className="secondary"
          disabled={c.busy}
          onClick={() => void c.submit()}
        >
          Mit derselben ID erneut senden
        </button>
      </div>
      <p className="help">
        Die unveränderte Anfrage wird anhand derselben ID abgeglichen. Ein
        bestehender Auftrag und sein Todoist-Schreibjournal werden
        wiederverwendet.
      </p>
    </div>
  );
}
