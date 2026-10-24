"use client";
import { useCallback, useEffect, useState } from "react";
import type { TermiHubSettings } from "@helios/contracts";
import { routineRequest as api } from "./routine-http";
import { useNavigationLock } from "./navigation-lock";
const at = (v: string | null) =>
  v ? new Date(v).toLocaleString("de-CH") : "Noch nicht abgerufen";
function formText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}
const states: Record<string, string> = {
  not_connected: "Nicht verbunden",
  saved: "Gespeichert · Abruf ausstehend",
  disabled: "Deaktiviert",
  ready: "Verbunden",
  queued: "Abruf vorgemerkt",
  updating: "Wird gelesen",
  incomplete: "Unvollständiger Datenstand",
  TERMIHUB_AUTH: "Token abgewiesen. Bitte prüfen.",
  TERMIHUB_PERMISSION:
    "Die Berechtigung für mindestens einen Lesezugriff fehlt. Bitte Token-Berechtigungen prüfen.",
  TERMIHUB_RATE_LIMIT: "Abruflimit erreicht · Wartezeit beachten",
  TERMIHUB_UNREACHABLE: "TermiHub ist nicht erreichbar",
  TERMIHUB_TIMEOUT: "TermiHub antwortet zu langsam",
  KEY_UNAVAILABLE: "Integrationsschlüssel fehlt oder passt nicht",
};
export function TermiHubConnection({
  onChange,
  contextId,
  mode = "all",
  onStepUp,
}: Readonly<{
  onChange: () => Promise<unknown>;
  contextId?: string;
  mode?: "all" | "connection" | "mapping";
  onStepUp?: () => void;
}>) {
  const [data, setData] = useState<TermiHubSettings | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [token, setToken] = useState(""),
    [day, setDay] = useState("");
  useNavigationLock(busy);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const reload = useCallback(async () => {
    const value: TermiHubSettings = await api("/api/termihub");
    setData(value);
  }, []);
  useEffect(() => {
    let alive = true;
    api("/api/termihub")
      .then((v) => {
        if (alive) setData(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [contextId]);
  useEffect(() => {
    if (!data?.syncing) return;
    const timer = setInterval(
      () => void reload().catch((e) => setError(e.message)),
      3000,
    );
    return () => clearInterval(timer);
  }, [data?.syncing, reload]);
  async function act(action: string, body: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/termihub/" + action, body);
      await reload();
      await onChange();
      setNotice(
        action === "refresh"
          ? "Leseabruf vorgemerkt. Der Worker lädt den Datenstand."
          : "Gespeichert.",
      );
      return true;
    } catch (e) {
      if (
        (e as Error).message.includes(
          "Passwort und neuen Authenticator-Code bestätigen",
        )
      )
        onStepUp?.();
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section
        id="termihub-settings"
        className="card settings-panel termihub-settings"
        aria-label="TermiHub-Einstellungen"
      >
        <h2>TermiHub verbinden</h2>
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <output>Kalendereinstellungen werden geladen …</output>
        )}
      </section>
    );
  const i = data,
    pause = !!i.nextAllowedAt && Date.parse(i.nextAllowedAt) > now;
  const calendars = [
    ...new Map([
      ...i.calendars.map((c) => [c.id, c] as const),
      ...i.mappings
        .filter((m) => !i.calendars.some((c) => c.id === m.calendarId))
        .map(
          (m) =>
            [
              m.calendarId,
              {
                id: m.calendarId,
                name: "Nicht im aktuellen Katalog",
                type: "unknown",
                enabled: false,
                available: false,
              },
            ] as const,
        ),
    ]).values(),
  ];
  return (
    <section
      id="termihub-settings"
      className="card settings-panel termihub-settings"
      aria-label="TermiHub-Einstellungen"
    >
      <h2>
        {mode === "mapping"
          ? "TermiHub · Arbeitszeiten & Kalender"
          : "TermiHub verbinden"}
      </h2>
      <div hidden={mode === "mapping"}>
        <p>
          Arbeitszeiten und Kalender dienen als Orientierung. Helios liest
          ausschliesslich; bestätigte Tagespläne bleiben erhalten.
        </p>
        <output>
          Verbindung:{" "}
          {states[i.state] ??
            "Abruf fehlgeschlagen · Verbindung und Lese-Berechtigungen prüfen"}
        </output>
        <p className="help">
          Letzter Abrufversuch: {at(i.lastCheckedAt)} · Letzter vollständiger
          Abruf: {at(i.lastSyncAt)}
        </p>
        <p className="help">
          Vor Token- und Zuordnungsänderungen{" "}
          <a href="#sensitive-changes">
            Passwort und neuen Authenticator-Code bestätigen
          </a>
          . Benötigte Leserechte: events:read, work_locations:read, travel:read.
        </p>
        {!i.keyAvailable && (
          <p role="alert">
            Der gemeinsame Integrationsschlüssel fehlt. Bitte die
            Serverkonfiguration prüfen.
          </p>
        )}
        <form
          key={i.revision}
          onSubmit={async (e) => {
            e.preventDefault();
            const values = new FormData(e.currentTarget);
            if (
              await act("save", {
                revision: i.revision,
                baseUrl: values.get("baseUrl"),
                token,
              })
            )
              setToken("");
          }}
        >
          <fieldset className="settings-group">
            <legend>1. Verbindung einrichten</legend>
            <label>
              TermiHub-Serveradresse
              <input
                name="baseUrl"
                type="url"
                placeholder="https://termihub.example.invalid"
                defaultValue={i.baseUrl}
                maxLength={2048}
                required
              />
            </label>
            <label>
              Neuer TermiHub-API-Token
              <input
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                maxLength={4096}
                required
              />
            </label>
            <button type="submit" disabled={busy || !i.keyAvailable}>
              TermiHub-Token verschlüsselt speichern
            </button>
          </fieldset>
        </form>
        <p className="help">
          {i.hasToken
            ? "Token hinterlegt · wird nicht erneut ausgegeben."
            : "Kein Token hinterlegt."}{" "}
          HTTPS-Serveradresse ohne Pfad verwenden.
        </p>
        <div className="settings-group">
          <h3>2. Daten lesen und Verbindung prüfen</h3>
          <div className="button-row">
            <label>
              Referenztag für Arbeitsorganisationen
              <input
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={
                busy ||
                i.syncing ||
                pause ||
                !i.enabled ||
                !i.hasToken ||
                !i.keyAvailable
              }
              onClick={() => void act("refresh", day ? { day } : {})}
            >
              Verbindung prüfen & Kalender lesen
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void reload().catch((e) => setError(e.message))}
            >
              Gespeicherten Stand neu laden
            </button>
            {i.hasToken && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(i.enabled ? "disable" : "enable", {
                      revision: i.revision,
                    })
                  }
                >
                  {i.enabled ? "TermiHub deaktivieren" : "TermiHub aktivieren"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void act("remove", { revision: i.revision })}
                >
                  TermiHub-Token entfernen
                </button>
              </>
            )}
          </div>
          {pause && (
            <p className="help">
              Nächster Abruf frühestens: {at(i.nextAllowedAt)}.
            </p>
          )}
        </div>
      </div>
      {mode === "mapping" && !i.hasToken && (
        <p>
          Keine TermiHub-Verbindung hinterlegt. Unter Verbindungen einrichten.
        </p>
      )}
      {i.enabled && i.hasToken && (
        <form
          hidden={mode === "connection"}
          key={"mapping:" + i.revision}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act("mapping", {
              revision: i.revision,
              contexts: i.contexts
                .filter((c) => c.active)
                .map((c) => ({
                  contextId: c.id,
                  contextRevision: c.revision,
                  organizationId: formText(f, "organization:" + c.id) || null,
                })),
              calendars: calendars.flatMap((c) => {
                const v = formText(f, "calendar:" + c.id);
                return v
                  ? [
                      {
                        calendarId: c.id,
                        mode: v.startsWith("context:") ? "context" : v,
                        contextId: v.startsWith("context:") ? v.slice(8) : null,
                      },
                    ]
                  : [];
              }),
            });
          }}
        >
          <fieldset className="settings-group">
            <legend>3. Arbeitsorganisationen bewusst zuordnen</legend>
            <p className="help">
              Organisationen werden anhand ihrer IDs aus gelesenen Arbeitszeiten
              angeboten. Fehlt eine, einen passenden Referenztag lesen. Ein Tag
              ohne Arbeitszeit entfernt bestehende Zuordnungen nicht.
            </p>
            {i.contexts
              .filter((c) => c.active)
              .map((c) => (
                <label key={c.id} hidden={!!contextId && c.id !== contextId}>
                  {c.name} · Arbeitsorganisation
                  <select
                    name={"organization:" + c.id}
                    defaultValue={c.organizationId ?? ""}
                  >
                    <option value="">Keine Zuordnung</option>
                    {c.organizationId &&
                      !i.organizations.some(
                        (o) => o.id === c.organizationId,
                      ) && (
                        <option value={c.organizationId}>
                          Bestehende Referenz {c.organizationId} ·{" "}
                          {c.instanceMatches
                            ? "erhalten"
                            : "erneute Verifikation erforderlich"}
                        </option>
                      )}
                    {i.organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} · {o.id}
                      </option>
                    ))}
                  </select>
                  {!c.instanceMatches && c.organizationId && (
                    <span className="help">
                      Diese Referenz ist für die aktuelle Verbindung
                      unbestätigt.
                    </span>
                  )}
                </label>
              ))}
          </fieldset>
          <fieldset className="settings-group">
            <legend>4. Kalender bewusst zuordnen</legend>
            <p className="help">
              Jeden aktiven Kalender einem Kontext zuordnen, ausdrücklich
              gemeinsam verwenden oder ausschliessen. Gemeinsame Kalender gelten
              für alle Kontexte. Ungeklärte Quellen ergeben kein verlässliches
              Budget.
            </p>
            {!calendars.length && (
              <p>Noch kein Kalenderkatalog. Bitte einen Leseabruf ausführen.</p>
            )}
            {calendars.map((c) => {
              const m = i.mappings.find((v) => v.calendarId === c.id);
              return (
                <label key={c.id}>
                  {c.name} · {c.id} · {c.type}
                  {!c.available || !c.enabled ? " · nicht verfügbar" : ""}
                  {m && !m.verified ? " · unbestätigt" : ""}
                  <select
                    name={"calendar:" + c.id}
                    defaultValue={
                      m
                        ? m.mode === "context"
                          ? "context:" + m.contextId
                          : m.mode
                        : ""
                    }
                  >
                    <option value="">Ungeklärt lassen</option>
                    <option value="excluded">Ausschliessen</option>
                    <option value="shared">Bewusst gemeinsam verwenden</option>
                    {i.contexts
                      .filter((v) => v.active)
                      .map((v) => (
                        <option key={v.id} value={"context:" + v.id}>
                          {v.name}
                        </option>
                      ))}
                  </select>
                </label>
              );
            })}
          </fieldset>
          <button type="submit" disabled={busy || i.syncing}>
            TermiHub-Zuordnungen speichern
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && <output>{notice}</output>}
    </section>
  );
}
