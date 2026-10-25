"use client";
import { ActionButton, FormField, Textarea, Select } from "@helios/ui";

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
      <FormField>
        <span>Auftrag</span>
        <Textarea
          value={c.prompt}
          maxLength={12000}
          rows={7}
          required
          disabled={c.locked}
          onChange={(e) => c.setPrompt(e.target.value)}
        />
      </FormField>
      <div className="ai-job-fields">
        <FormField>
          <span>Ausgabe</span>
          <Select
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
          </Select>
        </FormField>
        {c.output === "file" && (
          <FormField>
            <span>Dateiformat</span>
            <Select
              value={c.format}
              disabled={c.locked}
              onChange={(e) => c.setFormat(e.target.value as typeof c.format)}
            >
              {aiJobFormats.map((f) => (
                <option key={f} value={f}>
                  {aiJobFormatNames[f]}
                </option>
              ))}
            </Select>
          </FormField>
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
        <ActionButton
          busy={c.busy}
          loadingText="KI-Auftrag wird erstellt …"
          type="submit"
          disabled={!c.canSubmit}
        >
          Auftrag erstellen
        </ActionButton>
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
        <ActionButton
          busy={c.busy}
          loadingText="Vorgang wird verarbeitet …"
          type="button"
          disabled={c.busy}
          onClick={() => void c.reconcile()}
        >
          Auftragsstatus prüfen
        </ActionButton>
        <ActionButton
          busy={c.busy}
          loadingText="Vorgang wird verarbeitet …"
          type="button"
          className="secondary"
          disabled={c.busy}
          onClick={() => void c.submit()}
        >
          Mit derselben ID erneut senden
        </ActionButton>
      </div>
      <p className="help">
        Die unveränderte Anfrage wird anhand derselben ID abgeglichen. Ein
        bestehender Auftrag und sein Todoist-Schreibjournal werden
        wiederverwendet.
      </p>
    </div>
  );
}
