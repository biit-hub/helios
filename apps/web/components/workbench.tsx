"use client";
import { Epics } from "./epics";
import { MorningRoutine } from "./morning-routine";
import { Problems } from "./problems";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Brand } from "@helios/ui";
import { themes, problemMessages } from "@helios/contracts";
import type {
  ContextInput,
  ContextView,
  WorkSnapshot,
  TaskList,
  TaskView,
  CommentView,
} from "@helios/contracts";
import { TaskManager, TaskCapture } from "./tasks";
import { PlanningPanel } from "./planning";
import { Logout } from "./identity-forms";
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
}: Readonly<{
  planning?: "focus" | "plan";
  routine?: boolean;
  epics?: boolean;
  settings?: boolean;
  mobile?: boolean;
}>) {
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
    [now, setNow] = useState(() => Date.now()),
    [refreshId, setRefreshId] = useState(0);
  async function load() {
    const d: WorkSnapshot = await request("/api/work");
    setSnapshot(d);
    setSelected((prev) =>
      d.contexts.some((c) => c.id === prev && c.active)
        ? prev
        : (d.contexts.find((c) => c.kind === "private")?.id ?? ""),
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
          setSelected(
            d.contexts.find((c) => c.active && c.id === requested)?.id ??
              d.contexts.find((c) => c.kind === "private")?.id ??
              "",
          );
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
    if (!selected || settings || mobile || planning || routine || epics) return;
    const abort = new AbortController();

    request(
      "/api/work?contextId=" + encodeURIComponent(selected),
      undefined,
      abort.signal,
    )
      .then((data) => setLoaded({ contextId: selected, data }))
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [selected, settings, mobile, planning, refreshId, routine, epics]);
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
      setNotice("Gespeichert. Todoist-Inhalte bleiben unverändert.");
      return result;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Die Anfrage ist fehlgeschlagen.",
      );
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const list = loaded?.contextId === selected ? loaded.data : null;
  const current = snapshot?.contexts.find((c) => c.id === selected);
  const pause =
    !!snapshot?.integration.nextAllowedAt &&
    Date.parse(snapshot.integration.nextAllowedAt) > now;
  return (
    <div
      className={"workspace" + (mobile ? " mobile-workspace" : "")}
      data-theme={current?.theme ?? "copper"}
    >
      <div className="work-shell">
        <header>
          <Brand />
          <div className="context-picker">
            <span className="help">Dein Kontext</span>
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
                    onClick={() => {
                      setSelected(c.id);
                      const url = new URL(window.location.href);
                      url.searchParams.set("context", c.id);
                      window.history.replaceState(
                        null,
                        "",
                        url.pathname + url.search,
                      );
                      setError("");
                    }}
                  >
                    {c.name}
                  </button>
                ))}
            </div>
          </div>
        </header>
        {!mobile && (
          <nav
            className="work-nav"
            aria-label="Hauptnavigation"
            onClickCapture={(event) => {
              if (busy) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
          >
            <Link
              aria-disabled={busy}
              href="/morning"
              aria-current={routine ? "page" : undefined}
            >
              Morgenroutine
            </Link>
            <Link
              aria-disabled={busy}
              aria-current={planning === "focus" ? "page" : undefined}
              href={"/?context=" + selected}
            >
              Fokus
            </Link>
            <Link
              aria-disabled={busy}
              aria-current={planning === "plan" ? "page" : undefined}
              href={"/plan?context=" + selected}
            >
              Tagesplan
            </Link>
            <Link
              aria-disabled={busy}
              aria-current={
                !settings && !planning && !routine && !epics
                  ? "page"
                  : undefined
              }
              href={"/tasks?context=" + selected}
            >
              Aufgaben
            </Link>
            <Link
              aria-disabled={busy}
              aria-current={settings ? "page" : undefined}
              href="/settings/contexts"
            >
              Einstellungen
            </Link>
            <Link
              aria-disabled={busy}
              aria-current={epics ? "page" : undefined}
              href={"/epics?context=" + selected}
            >
              Epics
            </Link>
            <Link aria-disabled={busy} href="/settings/security">
              Sicherheit
            </Link>
          </nav>
        )}
        <main>
          <div className="eyebrow">
            {routine
              ? "IN DEINEM TEMPO"
              : settings
                ? "DEIN ARBEITSRAUM"
                : mobile
                  ? "DEINE KONTEXTE"
                  : planning
                    ? "DEIN TAG, DEIN FOKUS"
                    : "DEINE AUFGABEN, BEWUSST VERWALTET"}
          </div>
          <h1>
            {routine
              ? "Ein ruhiger Start in deinen Tag."
              : settings
                ? "Alles am richtigen Platz."
                : mobile
                  ? "Für wen startest du heute?"
                  : planning
                    ? "Ein guter nächster Schritt."
                    : (current?.name ?? "Deine Aufgaben")}
          </h1>
          <p className="lead">
            {routine
              ? "Ein Schritt nach dem anderen. Du kannst jederzeit pausieren oder später fortsetzen."
              : settings
                ? "Arbeitgeber und Privat bewusst einrichten. Jeder Kontext bleibt eigenständig."
                : mobile
                  ? "Die gemeinsame Morgenroutine folgt in einer späteren Etappe."
                  : planning
                    ? "Eine bewusste Auswahl und ein guter nächster Schritt. Jeder Kontext bleibt eigenständig."
                    : "Ein ruhiger Überblick. Änderungen werden bewusst bestätigt und extern nachgewiesen."}
          </p>
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
            <>
              <StepUp onError={setError} />
              <Connection
                data={snapshot}
                busy={busy}
                pause={pause}
                action={action}
              />
              <section className="card settings-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Arbeitgeber & Privat</h2>
                    <p>Freie Namen, bewusste Zuordnung, eigene Farben.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewEmployer(!newEmployer)}
                  >
                    Arbeitgeber hinzufügen
                  </button>
                </div>
                {newEmployer && (
                  <ContextEditor
                    key="new"
                    snapshot={snapshot}
                    busy={busy}
                    save={async (data) => {
                      await action("context-save", data);
                      setNewEmployer(false);
                    }}
                  />
                )}
                {snapshot.contexts.map((c) => (
                  <ContextEditor
                    key={c.id + ":" + c.revision}
                    context={c}
                    snapshot={snapshot}
                    busy={busy}
                    save={(data) => action("context-save", data)}
                  />
                ))}
              </section>
              <Problems snapshot={snapshot} busy={busy} action={action} />
            </>
          )}
          {epics && current && snapshot && (
            <Epics key={current.id} context={current} snapshot={snapshot} />
          )}
          {planning && current && (
            <PlanningPanel key={current.id} context={current} mode={planning} />
          )}
          {routine && snapshot && (
            <MorningRoutine
              snapshot={snapshot}
              refreshSnapshot={load}
              onContextChange={setSelected}
            />
          )}
          {snapshot &&
            !settings &&
            !mobile &&
            !planning &&
            !routine &&
            !epics && (
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
        {snapshot && !mobile && <TaskCapture snapshot={snapshot} />}
        <footer>
          <span>
            Helios · Dein Zugang ist geschützt. · Todoist bleibt führend.
          </span>
          <Logout />
        </footer>
      </div>
    </div>
  );
}
function StepUp({ onError }: Readonly<{ onError: (v: string) => void }>) {
  const [pwd, setPwd] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [ok, setOk] = useState(false);
  return (
    <section id="sensitive-changes" className="card settings-panel auth-card">
      <h2>Sensible Änderungen bestätigen</h2>
      <p>
        Tokenwechsel und Projektzuordnungen benötigen Passwort und einen neuen
        Authenticator-Code. Die Bestätigung gilt höchstens fünf Minuten.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setOk(false);
          try {
            await request("/api/identity/step-up", { password: pwd, code });
            setPwd("");
            setCode("");
            setOk(true);
            onError("");
          } catch (e) {
            onError(
              e instanceof Error ? e.message : "Bestätigung fehlgeschlagen.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Aktuelles Passwort
          <input
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
    <section className="card settings-panel auth-card">
      <h2>Todoist verbinden</h2>
      <p>
        Helios liest mit dem API-Token deine Aufgaben. Erst nach bewusster
        Tagesplanbestätigung sind die vorgesehenen Abschnittswechsel erlaubt. Er
        wird verschlüsselt auf deinem Server gespeichert.
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
      <div className="termihub-status">
        <h3>TermiHub</h3>
        <p>
          Noch nicht verfügbar · Instanzreferenz und Arbeitgeber-ID können
          vorbereitet werden. Es findet kein Netzwerkzugriff statt.
        </p>
      </div>
    </section>
  );
}
function ContextEditor({
  context,
  snapshot,
  busy,
  save,
}: Readonly<{
  context?: ContextView;
  snapshot: WorkSnapshot;
  busy: boolean;
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
  const field = (patch: Partial<ContextInput>) =>
    setData((d) => ({ ...d, ...patch }));
  return (
    <article className="context-editor auth-card" data-theme={data.theme}>
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
          void save(data).catch(() => {});
        }}
      >
        <label>
          Anzeigename
          <input
            required
            maxLength={100}
            value={data.name}
            onChange={(e) => field({ name: e.target.value })}
          />
        </label>
        <fieldset>
          <legend>Farbschema</legend>
          <div className="theme-options">
            {Object.entries(themes).map(([key, name]) => (
              <button
                key={key}
                type="button"
                data-theme={key}
                className="theme-choice"
                aria-pressed={data.theme === key}
                onClick={() => field({ theme: key as ContextInput["theme"] })}
              >
                {name}
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          Todoist-Projekt
          <select
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
        <label>
          TermiHub-Instanzreferenz (optional)
          <input
            maxLength={200}
            value={data.termihubInstanceRef ?? ""}
            onChange={(e) =>
              field({ termihubInstanceRef: e.target.value || null })
            }
          />
        </label>
        <label>
          TermiHub-Arbeitgeber-ID (optional)
          <input
            maxLength={120}
            value={data.termihubEmployerId ?? ""}
            onChange={(e) =>
              field({ termihubEmployerId: e.target.value || null })
            }
          />
        </label>
        {context?.kind !== "private" && (
          <label className="check">
            <input
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
        <button type="submit" disabled={busy}>
          Kontext speichern
        </button>
      </form>
    </article>
  );
}
function TaskCard({
  task,
  contextId,
  tasks,
  disabled,
  action,
}: Readonly<{
  task: TaskView;
  contextId: string;
  tasks: TaskView[];
  disabled: boolean;
  action: Action;
}>) {
  const [comments, setComments] = useState<CommentView[] | null>(null),
    [error, setError] = useState("");
  const t = task.data;
  const parent = tasks.find((p) => p.data.id === t.parent_id);
  return (
    <article
      className={
        "card task-card " + (task.state === "unknown" ? "unknown-task" : "")
      }
      id={"task-" + t.id}
    >
      <div className="task-heading">
        <h3>{t.content}</h3>
        <span className="pill">Priorität {5 - t.priority}</span>
      </div>
      <p className="help">
        {task.state === "unknown"
          ? "Externer Zustand unbekannt · letzter gespeicherter Stand"
          : task.state === "completed"
            ? "Von Todoist als erledigt gemeldet"
            : task.state === "deleted"
              ? "Von Todoist als gelöscht gemeldet"
              : "Offen"}
        {task.sectionName
          ? " · Abschnitt: " + task.sectionName
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
      <details>
        <summary>Aufgabendetails</summary>
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
      </details>
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
      {!current?.configured ? (
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
                : "Noch keine Aufgaben abgerufen."}{" "}
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
                  ? "Der letzte vollständige Abruf enthielt keine Aufgaben."
                  : "Aufgaben über die Schaltfläche bewusst laden."}
              </p>
            </section>
          )}
          <TaskManager
            key={selected}
            tasks={list.tasks}
            context={current}
            snapshot={snapshot}
            renderTask={(task) => (
              <TaskCard
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
