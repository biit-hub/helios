"use client";
import { UiDialog, InfoTip } from "./ui-help";
import { taskChangedEvent, type VerifiedTaskChange } from "./task-events";
import {
  rememberContext,
  resolveContext,
  savedContext,
} from "./active-context";
import { useNavigationLocked } from "./navigation-lock";
import { KanbanSetup } from "./kanban-setup";
import { TermiHubConnection } from "./termihub-settings";
import { Epics } from "./epics";
import { MorningRoutine } from "./morning-routine";
import { Problems } from "./problems";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Brand, Icon } from "@helios/ui";
import { WorkbenchNavigation, SettingsChapters } from "./workbench-navigation";
import { themes, problemMessages } from "@helios/contracts";
import type {
  ContextInput,
  ContextView,
  WorkSnapshot,
  TaskList,
  TaskView,
  CommentView,
} from "@helios/contracts";
import { TaskManager, TaskCapture, TaskOperations } from "./tasks";
import { PlanningPanel } from "./planning";
import { Logout, SecurityForm } from "./identity-forms";
async function request(path: string, body?: unknown, signal?: AbortSignal) {
  const r = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.error?.message ?? "Die Anfrage ist fehlgeschlagen.");
  return data;
}
const at = (value: string | null) =>
  value ? new Date(value).toLocaleString("de-CH") : "Noch nicht abgerufen";
export function Workbench({
  planning,
  routine = false,
  epics = false,
  settings = false,
  mobile = false,
  problems = false,
  security = false,
}: Readonly<{
  planning?: "focus" | "plan";
  routine?: boolean;
  epics?: boolean;
  settings?: boolean;
  mobile?: boolean;
  problems?: boolean;
  security?: boolean;
}>) {
  const navigationLocked = useNavigationLocked();
  const [chapter, setChapter] = useState(security ? "security" : "contexts"),
    [settingTab, setSettingTab] = useState("private"),
    [settingEmployer, setSettingEmployer] = useState(""),
    [stepUpOpen, setStepUpOpen] = useState(false),
    [stepUpBusy, setStepUpBusy] = useState(false);
  const contextual = !settings && !routine && !problems;
  const [snapshot, setSnapshot] = useState<WorkSnapshot | null>(null),
    [selected, setSelected] = useState(""),
    [loaded, setLoaded] = useState<{
      contextId: string;
      data: TaskList;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [newEmployer, setNewEmployer] = useState(false),
    [newEmployerDirty, setNewEmployerDirty] = useState(false),
    [discardEmployer, setDiscardEmployer] = useState(false),
    [now, setNow] = useState(() => Date.now()),
    [refreshId, setRefreshId] = useState(0);
  const current = snapshot?.contexts.find((c) => c.id === selected);
  const pageTitle = {
    problems: "Probleme",
    settings: "Einstellungen",
    morning: "Morgenroutine",
    epics: "Epics und Ziele",
    focus: "Dein Fokus",
    plan: "Dein Tagesplan",
    mobile: "Deine Kontexte",
    tasks: "Aufgaben",
  };
  const view =
    (problems && "problems") ||
    (settings && "settings") ||
    (routine && "morning") ||
    (epics && "epics") ||
    planning ||
    (mobile && "mobile") ||
    "tasks";
  const settingsContextId =
    settingTab === "private"
      ? snapshot?.contexts.find((c) => c.kind === "private")?.id
      : settingEmployer ||
        snapshot?.contexts.find((c) => c.kind !== "private")?.id;
  useEffect(() => {
    if (!settings) return;
    const followHash = () => {
      const hash = window.location.hash;
      if (hash === "#termihub-settings") setChapter("hours");
      if (hash === "#todoist-settings") setChapter("connections");
      if (hash === "#sensitive-changes") setStepUpOpen(true);
    };
    followHash();
    window.addEventListener("hashchange", followHash);
    return () => window.removeEventListener("hashchange", followHash);
  }, [settings]);
  useEffect(() => {
    const changed = (event: Event) => {
      const change = (event as CustomEvent<VerifiedTaskChange>).detail;
      setNotice(
        change.action === "create"
          ? "Aufgabe in Todoist erstellt und nachgewiesen."
          : "Änderung in Todoist gespeichert und nachgewiesen.",
      );
      setRefreshId((v) => v + 1);
    };
    window.addEventListener(taskChangedEvent, changed);
    return () => window.removeEventListener(taskChangedEvent, changed);
  }, []);
  async function load() {
    const d: WorkSnapshot = await request("/api/work");
    setSnapshot(d);
    setSelected((prev) =>
      d.contexts.some((c) => c.id === prev && c.active) ? prev : "",
    );
    return d;
  }
  useEffect(() => {
    let alive = true;
    request("/api/work")
      .then((d: WorkSnapshot) => {
        if (alive) {
          setSnapshot(d);
          const requested = new URL(window.location.href).searchParams.get(
            "context",
          );
          const id = resolveContext(d.contexts, requested, savedContext());
          setSelected(id);
          if (id) rememberContext(id);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (
      !selected ||
      settings ||
      mobile ||
      planning ||
      routine ||
      epics ||
      problems
    )
      return;
    const abort = new AbortController();
    let alive = true;
    request(
      "/api/work?contextId=" + encodeURIComponent(selected),
      undefined,
      abort.signal,
    )
      .then(async (data: TaskList) => {
        if (!alive) return;
        if (
          data.contextRevision !== current?.revision ||
          data.projectId !== current?.projectId
        ) {
          const latest: WorkSnapshot = await request(
            "/api/work",
            undefined,
            abort.signal,
          );
          if (!alive) return;
          setSnapshot(latest);
          if (!latest.contexts.some((c) => c.id === selected && c.active))
            setSelected("");
        }
        if (alive) setLoaded({ contextId: selected, data });
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => {
      alive = false;
      abort.abort();
    };
  }, [
    selected,
    settings,
    mobile,
    planning,
    refreshId,
    routine,
    epics,
    current?.revision,
    current?.projectId,
    problems,
  ]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function action(name: string, body: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request("/api/work/" + name, body);
      await load();
      if (name === "tasks-refresh") setRefreshId((v) => v + 1);
      setNotice(
        name === "tasks-refresh"
          ? "Aufgabenstand vollständig aktualisiert."
          : "Gespeichert. Todoist-Inhalte bleiben unverändert.",
      );
      return result;
    } catch (e) {
      if (
        e instanceof Error &&
        e.message.includes("Passwort und neuen Authenticator-Code bestätigen")
      )
        setStepUpOpen(true);
      setError(
        e instanceof Error ? e.message : "Die Anfrage ist fehlgeschlagen.",
      );
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const list =
    loaded?.contextId === selected &&
    loaded.data.contextRevision === current?.revision &&
    loaded.data.projectId === current?.projectId
      ? loaded.data
      : null;
  const pause =
    !!snapshot?.integration.nextAllowedAt &&
    Date.parse(snapshot.integration.nextAllowedAt) > now;
  return (
    <div
      className={"workspace ux-workspace" + (mobile ? " mobile-workspace" : "")}
      onClickCapture={(event) => {
        if (
          !navigationLocked &&
          (event.target as HTMLElement).closest('a[aria-disabled="true"]')
        ) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (
          (event.target as HTMLElement).closest('a[href="#sensitive-changes"]')
        ) {
          event.preventDefault();
          setStepUpOpen(true);
        }
        if (
          navigationLocked &&
          (event.target as HTMLElement).closest("a[href]")
        ) {
          event.preventDefault();
          event.stopPropagation();
          setError(
            "Eine bestätigte Änderung wird noch verarbeitet. Zuerst den Operationsstand prüfen.",
          );
        }
      }}
      data-theme="copper"
    >
      <a className="skip-link" href="#main-content">
        Zum Inhalt
      </a>
      <div className="work-shell">
        <header className="ux-topbar">
          <Brand />
          {!mobile && (
            <WorkbenchNavigation
              busy={busy || navigationLocked}
              contextId={selected}
              view={view === "mobile" ? "tasks" : view}
            />
          )}
        </header>
        <aside className="ux-sidebar" aria-label="Kontext und Schnellaktionen">
          {contextual && (
            <div className="context-picker">
              <span className="eyebrow">Arbeitskontext</span>
              <div
                className="context-pills"
                role="group"
                aria-label="Kontext auswählen"
              >
                {snapshot?.contexts
                  .filter((c) => c.active)
                  .map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      className="context-pill"
                      data-theme={c.theme}
                      aria-pressed={selected === c.id}
                      disabled={busy || navigationLocked}
                      onClick={() => {
                        setSelected(c.id);
                        rememberContext(c.id);
                        const url = new URL(window.location.href);
                        url.searchParams.set("context", c.id);
                        window.history.replaceState(
                          window.history.state,
                          "",
                          url.pathname + url.search,
                        );
                        setError("");
                      }}
                    >
                      <span className="context-dot" />
                      {c.name}
                    </button>
                  ))}
              </div>
            </div>
          )}
          <div className="ux-quick-actions">
            <p className="eyebrow">Schnellaktionen</p>
            {snapshot && (
              <TaskCapture
                snapshot={snapshot}
                sidebar
                disabled={busy || navigationLocked}
              />
            )}
            <Link
              aria-disabled={
                !contextual || !current?.configured || navigationLocked || busy
              }
              href={"/tasks?context=" + selected + "&progress=pick"}
            >
              <Icon name="progress" />
              Fortschritt notieren
            </Link>
            <Link aria-disabled={navigationLocked} href="/morning">
              <Icon name="morning" />
              Morgenroutine starten
            </Link>
            <div className="ux-future">
              <button type="button" disabled>
                <Icon name="sparkles" />
                KI-Auftrag starten
              </button>
              <small>Noch nicht verfügbar</small>
            </div>
          </div>
          <div className="ux-sidebar-footer">
            <span>Ein Schritt nach dem anderen.</span>
            <Logout />
          </div>
        </aside>
        <main id="main-content" tabIndex={-1}>
          <div className="ux-page-heading">
            <h1>{pageTitle[view]}</h1>
            {contextual && current && (
              <p className="context-caption" data-theme={current.theme}>
                <span className="context-dot" />
                {current.name}
              </p>
            )}
          </div>
          {contextual && !current && snapshot && (
            <section className="card">
              <h2>Kontext bewusst auswählen</h2>
              <p>
                Wähle einen aktiven Kontext in der Seitenleiste. Eine fehlende
                oder deaktivierte Auswahl wird nicht automatisch durch Privat
                ersetzt.
              </p>
            </section>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {busy && <p role="status">Anfrage wird verarbeitet …</p>}
          {notice && <p role="status">{notice}</p>}
          {!snapshot && !error && (
            <p role="status">Einstellungen werden geladen …</p>
          )}
          {snapshot && settings && (
            <div className="ux-settings-layout">
              <SettingsChapters
                chapter={chapter}
                select={setChapter}
                busy={busy || navigationLocked}
              />
              <div className="ux-settings-content">
                <div hidden={chapter !== "contexts"}>
                  <div
                    className="ux-tabs"
                    role="tablist"
                    aria-label="Kontexttyp"
                  >
                    {["private", "employer"].map((tab) => (
                      <button
                        type="button"
                        key={tab}
                        role="tab"
                        aria-selected={settingTab === tab}
                        disabled={busy || navigationLocked}
                        onClick={() => setSettingTab(tab)}
                      >
                        {tab === "private" ? "Privat" : "Arbeitgeber"}
                      </button>
                    ))}
                  </div>
                  <section
                    id="contexts-settings"
                    className="card settings-panel"
                  >
                    <div className="panel-heading">
                      <h2>
                        {settingTab === "private"
                          ? "Privater Kontext"
                          : "Arbeitgeberkontext"}
                      </h2>
                      {settingTab === "employer" && (
                        <button
                          type="button"
                          disabled={busy || navigationLocked}
                          onClick={() => {
                            setNewEmployerDirty(false);
                            setDiscardEmployer(false);
                            setNewEmployer(true);
                          }}
                        >
                          <Icon name="plus" />
                          Arbeitgeber hinzufügen
                        </button>
                      )}
                    </div>
                    {settingTab === "employer" && (
                      <label>
                        <span>Arbeitgeber</span>
                        <select
                          value={
                            settingEmployer ||
                            snapshot.contexts.find((c) => c.kind !== "private")
                              ?.id ||
                            ""
                          }
                          disabled={busy || navigationLocked}
                          onChange={(e) => {
                            setSettingEmployer(e.target.value);
                            setNewEmployer(false);
                          }}
                        >
                          <option value="" disabled>
                            Arbeitgeber auswählen
                          </option>
                          {snapshot.contexts
                            .filter((c) => c.kind !== "private")
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                                {!c.active ? " · inaktiv" : ""}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    {settingTab === "employer" && newEmployer && (
                      <UiDialog
                        title="Arbeitgeber hinzufügen"
                        busy={busy}
                        close={() => {
                          if (newEmployerDirty) setDiscardEmployer(true);
                          else setNewEmployer(false);
                        }}
                      >
                        {discardEmployer && (
                          <div>
                            <p>Ungespeicherte Eingaben verwerfen?</p>
                            <button
                              type="button"
                              onClick={() => setDiscardEmployer(false)}
                            >
                              Weiterbearbeiten
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => setNewEmployer(false)}
                            >
                              Eingaben verwerfen
                            </button>
                          </div>
                        )}
                        <div hidden={discardEmployer}>
                          <ContextEditor
                            onDirty={() => setNewEmployerDirty(true)}
                            key="new"
                            snapshot={snapshot}
                            busy={busy || navigationLocked}
                            save={async (data) => {
                              const result = (await action(
                                "context-save",
                                data,
                              )) as { id: string };
                              setSettingEmployer(result.id);
                              setNewEmployer(false);
                            }}
                          />
                        </div>
                      </UiDialog>
                    )}
                    {snapshot.contexts.map((c) => (
                      <div
                        key={c.id + ":" + c.revision}
                        hidden={
                          settingTab === "private"
                            ? c.kind !== "private"
                            : c.id !==
                              (settingEmployer ||
                                snapshot.contexts.find(
                                  (v) => v.kind !== "private",
                                )?.id)
                        }
                      >
                        <ContextEditor
                          context={c}
                          snapshot={snapshot}
                          busy={busy || navigationLocked}
                          save={(data) => action("context-save", data)}
                        />
                      </div>
                    ))}
                  </section>
                </div>
                <div hidden={chapter !== "connections"}>
                  <Connection
                    data={snapshot}
                    busy={busy || navigationLocked}
                    pause={pause}
                    action={action}
                  />
                </div>
                <div
                  hidden={
                    chapter !== "contexts" &&
                    chapter !== "connections" &&
                    chapter !== "hours"
                  }
                >
                  <TermiHubConnection
                    onChange={load}
                    contextId={
                      chapter === "contexts" ? settingsContextId : undefined
                    }
                    mode={chapter === "connections" ? "connection" : "mapping"}
                    onStepUp={() => setStepUpOpen(true)}
                  />
                </div>
                {chapter === "security" && <SecurityForm embedded />}
              </div>
            </div>
          )}
          {snapshot && problems && (
            <>
              <TaskOperations />
              <Problems
                snapshot={snapshot}
                busy={busy || navigationLocked}
                action={action}
              />
            </>
          )}
          {stepUpOpen && (
            <UiDialog
              title="Sensible Änderungen bestätigen"
              busy={stepUpBusy}
              close={() => setStepUpOpen(false)}
            >
              <StepUp onError={setError} onBusy={setStepUpBusy} />
            </UiDialog>
          )}

          {epics && current && snapshot && (
            <Epics key={current.id} context={current} snapshot={snapshot} />
          )}
          {planning && current && (
            <PlanningPanel key={current.id} context={current} mode={planning} />
          )}
          {routine && snapshot && (
            <MorningRoutine snapshot={snapshot} refreshSnapshot={load} />
          )}
          {snapshot &&
            !settings &&
            !mobile &&
            !planning &&
            !routine &&
            !epics &&
            !problems &&
            current && (
              <TaskOverview
                snapshot={snapshot}
                current={current}
                list={list}
                selected={selected}
                busy={busy}
                pause={pause}
                action={action}
              />
            )}
          {mobile && snapshot && (
            <section className="card">
              <h2>{current?.name}</h2>
              <p>
                {current?.configured
                  ? "Dein Kontext ist eingerichtet."
                  : "Die Projektzuordnung kann in den Desktop-Einstellungen eingerichtet werden."}
              </p>
              <p>Dein Zugang ist geschützt.</p>
            </section>
          )}
        </main>

        <footer>
          <span>Helios · Dein Zugang ist geschützt.</span>
        </footer>
      </div>
    </div>
  );
}
function StepUp({
  onError,
  onBusy,
}: Readonly<{
  onError: (v: string) => void;
  onBusy: (busy: boolean) => void;
}>) {
  const [pwd, setPwd] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [ok, setOk] = useState(false),
    [localError, setLocalError] = useState("");
  return (
    <section id="sensitive-changes" className="card settings-panel auth-card">
      <p>
        Tokenwechsel sowie Projekt- und Kalenderzuordnungen benötigen Passwort
        und einen neuen Authenticator-Code. Die Bestätigung gilt höchstens fünf
        Minuten.
      </p>
      {localError && <p role="alert">{localError}</p>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          onBusy(true);
          setOk(false);
          setLocalError("");
          try {
            await request("/api/identity/step-up", { password: pwd, code });
            setPwd("");
            setCode("");
            setOk(true);
            onError("");
          } catch (e) {
            setLocalError(
              e instanceof Error ? e.message : "Bestätigung fehlgeschlagen.",
            );
          } finally {
            setBusy(false);
            onBusy(false);
          }
        }}
      >
        <label>
          Aktuelles Passwort
          <input
            disabled={busy}
            maxLength={128}
            type="password"
            autoComplete="current-password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            required
          />
        </label>
        <label>
          Neuer Authenticator-Code
          <input
            disabled={busy}
            maxLength={6}
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={busy}>
          Änderungen bestätigen
        </button>
        {ok && (
          <p role="status">Bestätigung für maximal fünf Minuten gültig.</p>
        )}
      </form>
    </section>
  );
}
type Action = (name: string, body: unknown) => Promise<unknown>;
function Connection({
  data,
  busy,
  pause,
  action,
}: Readonly<{
  data: WorkSnapshot;
  busy: boolean;
  pause: boolean;
  action: Action;
}>) {
  const [token, setToken] = useState(""),
    [tokenError, setTokenError] = useState(""),
    [tokenSaved, setTokenSaved] = useState(false);
  const i = data.integration;
  return (
    <section id="todoist-settings" className="card settings-panel auth-card">
      <h2>Todoist verbinden</h2>
      <p>
        Der Token wird verschlüsselt gespeichert. Inhaltliche Änderungen
        erfolgen nur nach deiner bewussten Aktion.
      </p>
      <p role="status">
        Verbindung:{" "}
        {i.state === "ready"
          ? "Verbunden"
          : i.state === "not_connected"
            ? "Nicht verbunden"
            : i.state === "not_tested"
              ? "Noch nicht geprüft"
              : (problemMessages[i.state as keyof typeof problemMessages] ??
                "Bitte prüfen")}
      </p>
      <p className="help">
        Letzter Test: {at(i.lastCheckedAt)} · Projektkatalog:{" "}
        {at(i.lastCatalogAt)}
      </p>
      {!i.keyAvailable && (
        <p role="alert">
          Integrationsschlüssel fehlt. Lokal pnpm config:integrations ausführen
          und Web/Worker neu starten.
        </p>
      )}
      <p id="token-requirements" className="help">
        Vor dem Speichern{" "}
        <a href="#sensitive-changes">
          Passwort und neuen Authenticator-Code bestätigen
        </a>
        . Die Bestätigung gilt fünf Minuten.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setTokenError("");
          setTokenSaved(false);
          try {
            await action("token-save", { revision: i.revision, token });
            setToken("");
            setTokenSaved(true);
          } catch (e) {
            setTokenError(
              e instanceof Error
                ? e.message
                : "Token konnte nicht gespeichert werden.",
            );
          }
        }}
      >
        <label>
          Neuer Todoist-API-Token
          <input
            type="password"
            autoComplete="off"
            value={token}
            maxLength={512}
            aria-describedby="token-requirements token-feedback"
            required
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        <button type="submit" disabled={busy || !i.keyAvailable}>
          Token verschlüsselt speichern
        </button>
        <div id="token-feedback">
          {tokenError && (
            <p role="alert" className="form-error">
              {tokenError}
            </p>
          )}
          {tokenSaved && (
            <p role="status">
              Token verschlüsselt gespeichert. Du kannst jetzt die Verbindung
              prüfen und Projekte laden.
            </p>
          )}
        </div>
      </form>
      <p className="help">
        {i.hasToken
          ? "Token hinterlegt · wird nicht erneut ausgegeben."
          : "Kein Token hinterlegt."}{" "}
        In Todoist: Einstellungen → Integrationen → Entwickler → API-Token.
      </p>
      <button
        type="button"
        disabled={busy || pause || !i.enabled || !i.hasToken}
        onClick={() => void action("catalog-refresh", {}).catch(() => {})}
      >
        Verbindung prüfen & Projekte laden
      </button>
      {i.hasToken && (
        <>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() =>
              void action(
                i.enabled ? "integration-disable" : "integration-enable",
                { revision: i.revision },
              ).catch(() => {})
            }
          >
            {i.enabled ? "Verbindung deaktivieren" : "Verbindung aktivieren"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() =>
              void action("token-remove", { revision: i.revision }).catch(
                () => {},
              )
            }
          >
            Token entfernen
          </button>
        </>
      )}
      {pause && <p className="help">Abrufpause bis {at(i.nextAllowedAt)}.</p>}
      <p className="help">
        TermiHub-Kalender und Arbeitsorganisationen werden unten bewusst
        zugeordnet.
      </p>
    </section>
  );
}
function ContextEditor({
  context,
  snapshot,
  busy,
  save,
  onDirty,
}: Readonly<{
  context?: ContextView;
  snapshot: WorkSnapshot;
  busy: boolean;
  onDirty?: () => void;
  save: (data: ContextInput) => Promise<unknown>;
}>) {
  const [data, setData] = useState<ContextInput>({
    id: context?.id,
    revision: context?.revision ?? 0,
    name: context?.name ?? "",
    theme: context?.theme ?? "plum",
    active: context?.active ?? true,
    projectId: context?.projectId ?? null,
    termihubEmployerId: context?.termihubEmployerId ?? null,
    termihubInstanceRef: context?.termihubInstanceRef ?? null,
  });
  const [saveError, setSaveError] = useState("");
  const field = (patch: Partial<ContextInput>) => {
    onDirty?.();
    setData((d) => ({ ...d, ...patch }));
  };
  return (
    <article className="context-editor auth-card">
      <h3>
        {context?.name ?? "Neuer Arbeitgeber"}{" "}
        <span className="help">
          {context?.kind === "private"
            ? "Privat"
            : data.active
              ? "Arbeitgeber · aktiv"
              : "Arbeitgeber · inaktiv"}
        </span>
      </h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSaveError("");
          void save(data).catch((error: unknown) => {
            setSaveError(
              error instanceof Error
                ? error.message
                : "Der Kontext konnte nicht gespeichert werden.",
            );
          });
        }}
      >
        <label>
          Anzeigename
          <input
            disabled={busy}
            required
            maxLength={100}
            value={data.name}
            onChange={(e) => field({ name: e.target.value })}
          />
        </label>
        <label>
          <span className="ux-field-caption">
            <span>Kontextfarbe</span>
            <InfoTip label="Kontextfarbe">
              Die Farbe kennzeichnet diesen Kontext. Allgemeine Ansichten
              bleiben warm-orange.
            </InfoTip>
          </span>
          <div className="ux-color-picker">
            <select
              disabled={busy}
              aria-label="Kontextfarbe"
              value={data.theme}
              onChange={(e) =>
                field({ theme: e.target.value as ContextInput["theme"] })
              }
            >
              {Object.entries(themes).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
            <svg
              viewBox="0 0 38 38"
              role="img"
              aria-label={"Farbvorschau: " + themes[data.theme]}
              data-theme={data.theme}
              className="ux-color-swatch"
            >
              <title>{"Farbvorschau: " + themes[data.theme]}</title>
              <rect width="38" height="38" rx="8" fill="var(--accent)" />
            </svg>
          </div>
        </label>
        <label>
          Todoist-Projekt
          <select
            disabled={busy}
            value={data.projectId ?? ""}
            onChange={(e) => field({ projectId: e.target.value || null })}
          >
            <option value="">Noch nicht zugeordnet</option>
            {data.projectId &&
              !snapshot.projects.some((p) => p.id === data.projectId) && (
                <option value={data.projectId}>
                  Nicht mehr verfügbar · {data.projectId}
                </option>
              )}
            {snapshot.projects.map((p) => (
              <option
                key={p.id}
                value={p.id}
                disabled={
                  !p.available ||
                  p.inbox ||
                  (!!p.assignedTo && p.assignedTo !== context?.id)
                }
              >
                {p.name} · {p.id}
                {p.inbox
                  ? " · Eingang, nicht zuordenbar"
                  : p.assignedTo && p.assignedTo !== context?.id
                    ? " · bereits zugeordnet"
                    : !p.available
                      ? " · nicht mehr verfügbar"
                      : ""}
              </option>
            ))}
          </select>
        </label>
        <p className="help">
          TermiHub-Referenzen werden im Kalenderbereich anhand verifizierter IDs
          zugeordnet.
        </p>

        {context?.kind !== "private" && (
          <label className="check">
            <input
              disabled={busy}
              type="checkbox"
              checked={data.active}
              onChange={(e) => field({ active: e.target.checked })}
            />
            Kontext aktiv
          </label>
        )}
        <p className="help">
          {context?.configured
            ? "Vollständig zugeordnet."
            : "Einrichtung noch unvollständig."}{" "}
          Projektwechsel verändert keine Todoist-Aufgabe. Deaktivierung erhält
          lokale Referenzen.
        </p>
        {saveError && (
          <p role="alert" className="form-error">
            {saveError}
          </p>
        )}
        <button type="submit" disabled={busy}>
          Kontext speichern
        </button>
      </form>
      {context?.active && context.configured && context.projectId && (
        <KanbanSetup context={context} />
      )}
    </article>
  );
}
function taskStateLabel(task: TaskView) {
  if (task.state === "unknown")
    return "Externer Zustand unbekannt · letzter gespeicherter Stand";
  if (task.state === "completed") return "Von Todoist als erledigt gemeldet";
  if (task.state === "deleted") return "Von Todoist als gelöscht gemeldet";
  return task.sectionName ?? "Ohne Abschnitt";
}
function TaskCard({
  task,
  contextId,
  tasks,
  disabled,
  action,
  compact = false,
}: Readonly<{
  task: TaskView;
  contextId: string;
  tasks: TaskView[];
  disabled: boolean;
  action: Action;
  compact?: boolean;
}>) {
  const [comments, setComments] = useState<CommentView[] | null>(null),
    [error, setError] = useState("");
  const t = task.data;
  const Details = compact ? "div" : "details";
  const parent = tasks.find((p) => p.data.id === t.parent_id);
  return (
    <article
      className={
        (compact ? "task-inline-details " : "card task-card ") +
        (task.state === "unknown" ? "unknown-task" : "")
      }
      id={"task-" + t.id}
    >
      <div className="task-heading">
        {!compact && <h3>{t.content}</h3>}
        <span className="pill">Priorität {5 - t.priority}</span>
      </div>
      <p className="help">
        {taskStateLabel(task)}
        {task.sectionName
          ? ""
          : t.section_id
            ? " · Abschnitt-ID: " + t.section_id
            : ""}
      </p>
      {task.sectionName === "Wartet" && task.waiting && (
        <p className="status-notice">
          Wartet auf {task.waiting.who}: {task.waiting.subject}
          {task.waiting.followUp && (
            <>
              {" "}
              · Nachfassen am {task.waiting.followUp}
              {task.waiting.followUp <= new Date().toLocaleDateString("en-CA")
                ? " · Nachfasshinweis fällig"
                : ""}
            </>
          )}
        </p>
      )}
      <dl className="task-dates">
        <div>
          <dt>Geplant</dt>
          <dd>
            {t.due?.datetime ?? t.due?.date ?? "Nicht gesetzt"}
            {t.due?.timezone ? " · " + t.due.timezone : ""}
            {t.due?.is_recurring ? " · wiederkehrend" : ""}
          </dd>
        </div>
        <div>
          <dt>Deadline</dt>
          <dd>{t.deadline?.date ?? "Nicht gesetzt"}</dd>
        </div>
      </dl>
      <Details>
        {!compact && <summary>Aufgabendetails</summary>}
        <p className="task-description">
          {t.description || "Keine Beschreibung vorhanden."}
        </p>
        <p>Labels: {t.labels.join(", ") || "Keine"}</p>
        <p>Todoist-ID: {t.id}</p>
        {t.parent_id && (
          <p>
            Übergeordnete Aufgabe:{" "}
            {parent ? (
              <a href={"#task-" + parent.data.id}>{parent.data.content}</a>
            ) : (
              t.parent_id + " · in dieser Lesesicht nicht verfügbar"
            )}
          </p>
        )}
        {t.duration && (
          <p>
            Dauer: {t.duration.amount} {t.duration.unit}
          </p>
        )}
        <p className="help">Abgerufen: {at(task.retrievedAt)}</p>
        {task.state === "active" && (
          <button
            type="button"
            className="secondary"
            disabled={disabled}
            onClick={async () => {
              try {
                const r = (await action("comments-read", {
                  contextId,
                  taskId: t.id,
                })) as { comments: CommentView[] };
                setComments(r.comments);
                setError("");
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Kommentare nicht verfügbar.",
                );
              }
            }}
          >
            Kommentare lesen
          </button>
        )}
        {error && <p role="alert">{error}</p>}
        {comments && (
          <div>
            {!comments.length ? (
              <p>Keine Kommentare vorhanden.</p>
            ) : (
              comments.map((c) => (
                <blockquote key={c.id}>
                  <p className="task-description">{c.content}</p>
                  <small>{at(c.posted_at)}</small>
                </blockquote>
              ))
            )}
          </div>
        )}
      </Details>
    </article>
  );
}

function TaskOverview({
  snapshot,
  current,
  list,
  selected,
  busy,
  pause,
  action,
}: Readonly<{
  snapshot: WorkSnapshot;
  current: ContextView | undefined;
  list: TaskList | null;
  selected: string;
  busy: boolean;
  pause: boolean;
  action: Action;
}>) {
  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>Aufgabenübersicht</h2>
          <p className="help">
            Letzter vollständiger Abruf: {at(list?.lastSyncAt ?? null)}
          </p>
        </div>
        <button
          type="button"
          disabled={busy || pause || !current?.configured}
          onClick={() =>
            void action("tasks-refresh", { contextId: selected }).catch(
              () => {},
            )
          }
        >
          Aufgaben aktualisieren
        </button>
      </div>
      {pause && (
        <p className="help">
          Nächster Abruf ab {at(snapshot.integration.nextAllowedAt)}.
        </p>
      )}
      {!current?.configured ||
      (list && (!list.configured || !list.connected)) ? (
        <section className="card">
          <h2>Deinen Kontext verbinden.</h2>
          <p>
            In den Einstellungen Todoist verbinden und ein bestehendes Projekt
            bewusst auswählen.
          </p>
          <Link href="/settings/contexts">Kontext einrichten →</Link>
        </section>
      ) : !list ? (
        <p role="status">Aufgaben werden geladen …</p>
      ) : (
        <>
          {list.stale && (
            <p className="status-notice">
              {list.lastSyncAt
                ? "Gespeicherter Stand · veraltet oder Verbindung gestört."
                : "Noch kein vollständiger Projektabruf."}{" "}
              Todoist bleibt die Quelle.
            </p>
          )}
          {!list.tasks.length && (
            <section className="card">
              <h2>
                {list.lastSyncAt
                  ? "Hier ist gerade Platz."
                  : "Bereit für den ersten Abruf."}
              </h2>
              <p>
                {list.lastSyncAt
                  ? list.stale
                    ? "Der gespeicherte Stand enthält keine bestätigten aktiven Aufgaben. Todoist bewusst aktualisieren."
                    : "Keine aktuellen aktiven Aufgaben für dieses Projekt nachgewiesen."
                  : "Aufgaben über die Schaltfläche bewusst laden."}
              </p>
            </section>
          )}
          {!!list.historicalTasks?.length && (
            <details className="card historical-tasks">
              <summary>Historische und extern ungeklärte Aufgaben</summary>
              <p>
                Diese gespeicherten Nachweise gehören nicht zum bestätigten
                aktuellen Aufgabenbestand. Hier sind keine Schreibaktionen
                möglich.
              </p>
              {list.historicalTasks.map((task) => (
                <TaskCard
                  key={task.data.id}
                  task={task}
                  contextId={selected}
                  tasks={list.historicalTasks!}
                  disabled
                  action={action}
                />
              ))}
            </details>
          )}
          <TaskManager
            key={selected}
            tasks={list.tasks}
            context={current}
            snapshot={snapshot}
            renderTask={(task) => (
              <TaskCard
                compact
                key={task.data.id}
                task={task}
                contextId={selected}
                tasks={list.tasks}
                disabled={busy || pause}
                action={action}
              />
            )}
          />
        </>
      )}
    </>
  );
}
