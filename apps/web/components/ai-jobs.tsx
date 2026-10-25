"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@helios/ui";
import {
  aiJobStatuses,
  aiJobStatusNames,
  aiJobOutputNames,
  aiJobErrorMessages,
  type AiJobList,
  type AiJobDetail,
} from "@helios/contracts";
import { jobRequest, jobDate } from "./ai-job-client";
import { UiDialog } from "./ui-help";
import { useNavigationLocked } from "./navigation-lock";
const referenceNames = {
  verified: "nachgewiesen",
  pending: "wird geprüft",
  unknown: "nicht bestätigt",
  error: "nicht bestätigt",
  closing: "nicht bestätigt",
  closed: "nicht bestätigt",
};
const turnNames = {
  prompt: "Originalauftrag",
  question: "Rückfrage",
  answer: "Antwort",
  refinement: "Nachbearbeitung",
};

export function AiJobs() {
  const query = useSearchParams();
  const [list, setList] = useState<AiJobList | null>(null);
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const locked = useNavigationLocked();
  const reads = useRef(0);
  const load = useCallback(async () => {
    const read = ++reads.current;
    setBusy(true);
    setError("");
    try {
      const value = await jobRequest<AiJobList>(
        "/api/ai-jobs?" +
          new URLSearchParams({
            page: String(page),
            sort,
            ...(status ? { status } : {}),
          }),
      );
      if (read === reads.current) setList(value);
    } catch (e) {
      if (read === reads.current) setError((e as Error).message);
    } finally {
      if (read === reads.current) setBusy(false);
    }
  }, [page, sort, status]);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const refresh = () => {
      void load();
    };
    window.addEventListener("helios:ai-jobs-changed", refresh);
    return () => {
      clearTimeout(initial);
      window.removeEventListener("helios:ai-jobs-changed", refresh);
    };
  }, [load]);
  useEffect(() => {
    const id = query?.get("job");
    if (id) {
      const timer = setTimeout(() => setDetail(id), 0);
      return () => clearTimeout(timer);
    }
  }, [query]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden && !locked) void load();
    }, 10000);
    return () => clearInterval(timer);
  }, [load, locked]);
  return (
    <>
      <section className="card">
        <div className="panel-heading">
          <h2>Deine KI-Aufträge</h2>
          <button
            type="button"
            className="secondary"
            disabled={busy || locked}
            onClick={() => void load()}
          >
            <Icon name="refresh" />
            Aktualisieren
          </button>
        </div>
        <div className="task-filters">
          <label>
            <span>Status</span>
            <select
              value={status}
              disabled={locked}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Alle</option>
              {aiJobStatuses.map((s) => (
                <option key={s} value={s}>
                  {aiJobStatusNames[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Sortierung</span>
            <select
              value={sort}
              disabled={locked}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <option value="newest">Neueste zuerst</option>
              <option value="oldest">Älteste zuerst</option>
            </select>
          </label>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {busy && !list && <output>Aufträge werden geladen …</output>}
        {list && !list.jobs.length && (
          <p>
            Keine KI-Aufträge{status ? " für diesen Filter" : " vorhanden"}.
            Neue Aufträge über die Schnellaktion erstellen.
          </p>
        )}
        <div className="ai-job-list">
          {list?.jobs.map((job) => (
            <article className="ai-job-card" key={job.id}>
              <div className="panel-heading">
                <span className="badge">{aiJobStatusNames[job.status]}</span>
                <small>{jobDate(job.createdAt)}</small>
              </div>
              <h3>{job.prompt}</h3>
              <p>{job.result || "Noch kein Ergebnis"}</p>
              <p className="help">
                {aiJobOutputNames[job.output]} · {job.model}
                {job.queuePosition !== null
                  ? " · Warteschlange " + job.queuePosition
                  : ""}
                {job.prioritized ? " · Priorisiert" : ""}
              </p>
              <p className="ai-job-id">{job.id}</p>
              <button
                type="button"
                className="secondary"
                disabled={locked}
                onClick={() => setDetail(job.id)}
              >
                Auftrag ansehen
              </button>
            </article>
          ))}
        </div>
        {list && list.total > 20 && (
          <div className="actions">
            <button
              type="button"
              disabled={busy || locked || page === 1}
              onClick={() => setPage(page - 1)}
            >
              Zurück
            </button>
            <span>
              Seite {page} · {list.total} Aufträge
            </span>
            <button
              type="button"
              disabled={busy || locked || page * 20 >= list.total}
              onClick={() => setPage(page + 1)}
            >
              Weiter
            </button>
          </div>
        )}
      </section>
      {detail && (
        <AiJobDetails
          id={detail}
          close={() => {
            setDetail(null);
            const url = new URL(window.location.href);
            url.searchParams.delete("job");
            window.history.replaceState(window.history.state, "", url);
          }}
          changed={load}
        />
      )}
    </>
  );
}
export function AiJobDetails({
  id,
  close,
  changed,
}: Readonly<{ id: string; close: () => void; changed: () => Promise<void> }>) {
  const [job, setJob] = useState<AiJobDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stop, setStop] = useState(false);
  const reads = useRef(0);
  const load = useCallback(async () => {
    const read = ++reads.current;
    try {
      const value = await jobRequest<AiJobDetail>(
        "/api/ai-jobs?id=" + encodeURIComponent(id),
      );
      if (read === reads.current) setJob(value);
    } catch (e) {
      if (read === reads.current) setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 10000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [load]);
  async function command(action: "stop" | "prioritize") {
    if (!job) return;
    reads.current++;
    setBusy(true);
    setError("");
    try {
      const value = await jobRequest<AiJobDetail>("/api/ai-jobs/" + action, {
        key: crypto.randomUUID(),
        id: job.id,
        revision: job.revision,
      });
      reads.current++;
      setJob(value);
      setStop(false);
      await changed();
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }
  return (
    <UiDialog title="KI-Auftrag" busy={busy} close={close}>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!job && !error && <output>Auftrag wird geladen …</output>}
      {job && (
        <div className="ai-job-detail">
          <p className="ai-job-id">{job.id}</p>
          <p>
            <strong>{aiJobStatusNames[job.status]}</strong> ·{" "}
            {aiJobOutputNames[job.output]}
            {job.format ? " · ." + job.format : ""}
          </p>
          {job.queuePosition !== null && (
            <p>
              Warteschlange: {job.queuePosition}
              {job.prioritized ? " · priorisiert" : ""}
            </p>
          )}
          {job.code && (
            <p role="alert">
              {aiJobErrorMessages[job.code] ??
                "Bearbeitung nicht bestätigt. Technischen Nachweis prüfen."}
            </p>
          )}
          {job.reference && (
            <p>
              Ursprung: {job.reference.title} · Todoist-Verknüpfung:{" "}
              {referenceNames[job.reference.state]}
              {["unknown", "error"].includes(job.reference.state) && (
                <>
                  {" "}
                  · <Link href="/problems">Operationsjournal prüfen</Link>
                </>
              )}
            </p>
          )}
          <h3>Originalauftrag</h3>
          <p className="ai-job-text">{job.originalPrompt}</p>
          <h3>Verlauf</h3>
          {job.turns
            .filter((t) => t.kind !== "prompt")
            .map((t) => (
              <div key={t.id}>
                <strong>{turnNames[t.kind]}</strong>
                <p className="ai-job-text">{t.text}</p>
              </div>
            ))}
          {job.turns.length === 1 && (
            <p className="help">
              Noch keine Rückfragen oder Nachbearbeitungen.
            </p>
          )}
          <h3>Ergebnisse</h3>
          {!job.results.length && (
            <p className="help">Noch kein Ergebnis vorhanden.</p>
          )}
          {job.results.map((r) => (
            <details key={r.id}>
              <summary>
                Ergebnisversion {r.version} · {jobDate(r.createdAt)}
              </summary>
              <p className="ai-job-text">{r.text}</p>
            </details>
          ))}
          {job.status === "queued" && (
            <div className="actions">
              <button
                type="button"
                disabled={busy || job.prioritized}
                onClick={() => void command("prioritize")}
              >
                {job.prioritized ? "Priorisiert" : "Priorisieren"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setStop(true)}
              >
                Stoppen
              </button>
            </div>
          )}
          {stop && job.status === "queued" && (
            <fieldset aria-label="Stoppen bestätigen">
              <p>
                Diesen wartenden Auftrag stoppen? Original und Verlauf bleiben
                erhalten.
              </p>
              <div className="actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void command("stop")}
                >
                  Auftrag stoppen
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setStop(false)}
                >
                  Zurück
                </button>
              </div>
            </fieldset>
          )}
          <details>
            <summary>Technischer Nachweis</summary>
            <dl>
              <dt>Modell</dt>
              <dd>{job.model}</dd>
              <dt>Modellversion</dt>
              <dd className="ai-job-id">{job.digest}</dd>
              <dt>Zuletzt geändert</dt>
              <dd>{jobDate(job.updatedAt)}</dd>
            </dl>
            {job.events.map((e) => (
              <p key={e.id}>
                {jobDate(e.createdAt)} · {e.kind} · Revision {e.revision}
              </p>
            ))}
          </details>
        </div>
      )}
    </UiDialog>
  );
}
