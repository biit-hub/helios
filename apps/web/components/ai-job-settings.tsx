"use client";
import { useCallback, useEffect, useState } from "react";
import {
  aiJobOutputNames,
  type AiJobSettings,
  type AiJobSetting,
} from "@helios/contracts";
import { Icon } from "@helios/ui";
import { jobRequest } from "./ai-job-client";
import { useNavigationLock, useNavigationLocked } from "./navigation-lock";
import { InfoTip } from "./ui-help";
export function AiJobSettingsPanel() {
  const [data, setData] = useState<AiJobSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useNavigationLocked();
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setData(await jobRequest<AiJobSettings>("/api/ai-jobs/settings"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  return (
    <section className="card" id="ai-delegation">
      <div className="panel-heading">
        <h2>KI-Delegation</h2>
        <button
          type="button"
          className="secondary"
          disabled={busy || locked}
          onClick={() => void load()}
        >
          <Icon name="refresh" />
          Modelle aktualisieren
        </button>
      </div>
      <p className="help">
        Pro Ausgabe ein installiertes lokales Modell.{" "}
        <InfoTip label="Lokale Modellverwaltung">
          Es werden nur Modelle des konfigurierten privaten Ollama-Endpunkts
          geprüft. Helios installiert keine Modelle und wechselt bei Fehlern
          nicht automatisch.
        </InfoTip>
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {busy && <output>Modellliste wird geprüft …</output>}
      {data && !data.connected && (
        <p role="alert">
          Ollama ist nicht erreichbar. Gespeicherte Modellzuordnungen bleiben
          erhalten.
        </p>
      )}
      {data?.outputs.map((setting) => (
        <Setting
          key={setting.output + ":" + setting.revision}
          value={setting}
          data={data}
          saved={setData}
        />
      ))}
    </section>
  );
}
function Setting({
  value,
  data,
  saved,
}: Readonly<{
  value: AiJobSetting;
  data: AiJobSettings;
  saved: (data: AiJobSettings) => void;
}>) {
  const [enabled, setEnabled] = useState(value.enabled);
  const [model, setModel] = useState(value.model ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const dirty = enabled !== value.enabled || model !== (value.model ?? "");
  useNavigationLock(dirty || busy);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      saved(
        await jobRequest<AiJobSettings>("/api/ai-jobs/settings", {
          key,
          output: value.output,
          revision: value.revision,
          enabled,
          model: model || null,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edited() {
    setKey(crypto.randomUUID());
    setError("");
  }
  const selected = data.models.some(
    (m) => m.name === model && m.available && m.local,
  );
  return (
    <form
      className="ai-job-setting"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h3>{aiJobOutputNames[value.output]}</h3>
      <div className="ai-job-fields">
        <label className="check">
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(e) => {
              edited();
              setEnabled(e.target.checked);
            }}
          />
          <span>Ausgabe aktivieren</span>
        </label>
        <label>
          <span>Lokales Modell für {aiJobOutputNames[value.output]}</span>
          <select
            value={model}
            disabled={busy}
            onChange={(e) => {
              edited();
              setModel(e.target.value);
            }}
          >
            <option value="">Kein Modell</option>
            {model && !data.models.some((m) => m.name === model) && (
              <option value={model} disabled>
                {model} · nicht verfügbar
              </option>
            )}
            {data.models.map((m) => (
              <option
                key={m.name}
                value={m.name}
                disabled={!m.available || !m.local}
              >
                {m.name}
                {!m.available ? " · nicht geeignet/verfügbar" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {value.enabled && !value.available && (
        <output>
          Das gespeicherte Modell ist nicht verfügbar oder seine Version wurde
          geändert. Die Ausgabe bleibt für neue Aufträge gesperrt. Ein Modell
          bewusst auswählen und speichern.
        </output>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="actions">
        <button
          type="submit"
          disabled={
            busy ||
            (!dirty && !(value.enabled && !value.available && !!selected)) ||
            (enabled && !selected)
          }
        >
          {!dirty && value.enabled && !value.available && selected
            ? "Modellversion bewusst bestätigen"
            : "Einstellungen speichern"}
        </button>
        {dirty && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => {
              setEnabled(value.enabled);
              setModel(value.model ?? "");
              edited();
            }}
          >
            Änderungen verwerfen
          </button>
        )}
      </div>
    </form>
  );
}
