"use client";
import {
  StatusMessage,
  ActionButton,
  Accordion,
  Input,
  Card,
  Button,
  FormField,
  Select,
  Icon,
} from "@helios/ui";
import { AiJobStatusBadge } from "./ai-job-status";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  aiJobStatuses,
  aiJobStatusNames,
  aiJobOutputNames,
  aiJobErrorMessages,
  type AiJobList,
  type AiJobDetail,
} from "@helios/contracts";
import { jobRequest, jobDate } from "./ai-job-client";
import { TaskMarkdown } from "./task-markdown";
import { UiDialog } from "./ui-help";
import { AiJobWorkflow } from "./ai-job-workflow";
import { useNavigationLock, useNavigationLocked } from "./navigation-lock";
const referenceNames = {
  verified: "nachgewiesen",
  pending: "wird geprüft",
  unknown: "nicht bestätigt",
  error: "nicht bestätigt",
  closing: "nicht bestätigt",
  closed: "abgeschlossen",
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
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
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
            ...(search ? { q: search } : {}),
          }),
      );
      if (read === reads.current) setList(value);
    } catch (e) {
      if (read === reads.current) setError((e as Error).message);
    } finally {
      if (read === reads.current) setBusy(false);
    }
  }, [page, sort, status, search]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchDraft.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchDraft]);
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
      <Card as="section" className="card">
        <div className="panel-heading">
          <h2>Deine KI-Aufträge</h2>
          <ActionButton
            busy={busy}
            loadingText="Stand wird aktualisiert …"
            type="button"
            className="secondary"
            disabled={busy || locked}
            onClick={() => void load()}
          >
            <Icon name="refresh" />
            Aktualisieren
          </ActionButton>
        </div>
        <div className="task-filters ai-job-filters">
          <FormField label="Originalprompt durchsuchen">
            <Input
              type="search"
              maxLength={200}
              placeholder="Suchbegriff im Originalauftrag"
              value={searchDraft}
              disabled={locked}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </FormField>
          {searchDraft && (
            <Button
              type="button"
              variant="secondary"
              disabled={locked}
              onClick={() => {
                setSearchDraft("");
                setSearch("");
                setPage(1);
              }}
            >
              Suche zurücksetzen
            </Button>
          )}
          <FormField>
            <span>Status</span>
            <Select
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
            </Select>
          </FormField>
          <FormField>
            <span>Sortierung</span>
            <Select
              value={sort}
              disabled={locked}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <option value="newest">Neueste zuerst</option>
              <option value="oldest">Älteste zuerst</option>
            </Select>
          </FormField>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {busy && !list && (
          <StatusMessage loading>Aufträge werden geladen …</StatusMessage>
        )}
        {list && !list.jobs.length && (
          <StatusMessage>
            {search
              ? "Keine KI-Aufträge für diese Suche gefunden."
              : status
                ? "Keine KI-Aufträge für diesen Filter vorhanden."
                : "Keine KI-Aufträge vorhanden. Neue Aufträge über die Schnellaktion erstellen."}
          </StatusMessage>
        )}
        <div className="ai-job-list">
          {list?.jobs.map((job) => (
            <Card
              as="article"
              className={
                "ai-job-card" +
                (job.status === "closed" ? " ai-job-card-closed" : "")
              }
              key={job.id}
            >
              <div className="panel-heading">
                <AiJobStatusBadge status={job.status} />
                <small>{jobDate(job.createdAt)}</small>
              </div>
              <h3>{job.prompt}</h3>
              {job.status !== "closed" && (
                <p>{job.result || "Noch kein Ergebnis"}</p>
              )}
              <p className="help">
                {aiJobOutputNames[job.output]} · {job.model}
                {job.queuePosition !== null
                  ? " · Warteschlange " + job.queuePosition
                  : ""}
                {job.prioritized ? " · Priorisiert" : ""}
              </p>
              <p className="ai-job-id">{job.id}</p>
              <Button
                type="button"
                className="secondary"
                disabled={locked}
                onClick={() => setDetail(job.id)}
              >
                Auftrag ansehen
              </Button>
            </Card>
          ))}
        </div>
        {list && list.total > 20 && (
          <div className="actions">
            <Button
              type="button"
              disabled={busy || locked || page === 1}
              onClick={() => setPage(page - 1)}
            >
              Zurück
            </Button>
            <span>
              Seite {page} · {list.total} Aufträge
            </span>
            <Button
              type="button"
              disabled={busy || locked || page * 20 >= list.total}
              onClick={() => setPage(page + 1)}
            >
              Weiter
            </Button>
          </div>
        )}
      </Card>
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
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  useNavigationLock(dirty || busy);
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
    <UiDialog
      title="KI-Auftrag"
      busy={busy}
      close={() => (dirty ? setDiscard(true) : close())}
    >
      {discard && (
        <fieldset aria-label="Eingaben verwerfen">
          <p>
            Ungespeicherte Eingaben oder eine ungeklärte Rückmeldung sind noch
            vorhanden. Dialog trotzdem schliessen?
          </p>
          <div className="actions">
            <Button type="button" onClick={() => setDiscard(false)}>
              Weiterbearbeiten
            </Button>
            <Button type="button" className="secondary" onClick={close}>
              Dialog schliessen
            </Button>
          </div>
        </fieldset>
      )}
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
            <AiJobStatusBadge status={job.status} /> ·{" "}
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
              {["unknown", "error", "closing"].includes(
                job.reference.state,
              ) && (
                <>
                  {" "}
                  · <Link href="/problems">Operationsjournal prüfen</Link>
                </>
              )}
            </p>
          )}
          <Accordion title="Originalauftrag">
            <p className="ai-job-text">{job.originalPrompt}</p>
          </Accordion>
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
          <h3>Ergebnis</h3>
          {!job.results.length && (
            <p className="help">Noch kein Ergebnis vorhanden.</p>
          )}
          {job.results.map((r) => (
            <Card as="section" className="ai-job-result-card" key={r.id}>
              <Accordion
                open={r.id === job.results.at(-1)?.id}
                title={
                  <>
                    Ergebnisversion {r.version} · {jobDate(r.createdAt)}
                  </>
                }
              >
                <div className="ai-job-result-content">
                  <TaskMarkdown text={r.text} />
                </div>
                <div className="actions">
                  <Button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(r.text)
                        .catch(() =>
                          setError(
                            "Kopieren ist in diesem Browser nicht verfügbar. Bitte den Text markieren und kopieren.",
                          ),
                        );
                    }}
                  >
                    Ergebnis kopieren
                  </Button>
                  {r.artifact && (
                    <a
                      className="button secondary"
                      href={
                        "/api/ai-jobs/artifact?" +
                        new URLSearchParams({ job: job.id, id: r.artifact.id })
                      }
                      download={r.artifact.filename}
                    >
                      Datei herunterladen (.{r.artifact.format})
                    </a>
                  )}
                </div>
                {r.sources.length > 0 && (
                  <div>
                    <h4>Quellen</h4>
                    {r.sources.map((s) => (
                      <p key={s.url}>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          {s.title}
                        </a>{" "}
                        · abgerufen {jobDate(s.retrievedAt)}
                      </p>
                    ))}
                  </div>
                )}
                {r.uncertainties.length > 0 && (
                  <div>
                    <h4>Unsicherheiten</h4>
                    {r.uncertainties.map((s) => (
                      <p key={s}>{s}</p>
                    ))}
                  </div>
                )}
              </Accordion>
            </Card>
          ))}
          <AiJobWorkflow
            job={job}
            updated={(value) => {
              reads.current++;
              setJob(value);
              void changed();
            }}
            deleted={() => {
              void changed();
              close();
            }}
            dirty={setDirty}
          />
          {job.status === "queued" && (
            <div className="actions">
              <Button
                type="button"
                disabled={busy || job.prioritized}
                onClick={() => void command("prioritize")}
              >
                {job.prioritized ? "Priorisiert" : "Priorisieren"}
              </Button>
              <Button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setStop(true)}
              >
                Stoppen
              </Button>
            </div>
          )}
          {stop && job.status === "queued" && (
            <fieldset aria-label="Stoppen bestätigen">
              <p>
                Diesen wartenden Auftrag stoppen? Original und Verlauf bleiben
                erhalten.
              </p>
              <div className="actions">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void command("stop")}
                >
                  Auftrag stoppen
                </Button>
                <Button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setStop(false)}
                >
                  Zurück
                </Button>
              </div>
            </fieldset>
          )}
          <Accordion title="Technischer Nachweis">
            <dl>
              <dt>Modell</dt>
              <dd>{job.model}</dd>
              <dt>Modellversion</dt>
              <dd className="ai-job-id">{job.digest}</dd>
              <dt>Zuletzt geändert</dt>
              <dd>{jobDate(job.updatedAt)}</dd>
            </dl>
            {job.attempts.map((attempt) => (
              <Accordion
                key={attempt.id}
                title={
                  <>
                    Versuch {attempt.number} · {attempt.status}
                  </>
                }
              >
                <p>
                  {attempt.model} · {jobDate(attempt.startedAt)}
                  {attempt.finishedAt
                    ? " bis " + jobDate(attempt.finishedAt)
                    : ""}
                </p>
                <p className="ai-job-id">{attempt.digest}</p>
                <p className="ai-job-id">
                  {JSON.stringify(attempt.parameters)}
                </p>
                {attempt.code && <p>{attempt.code}</p>}
              </Accordion>
            ))}
            {job.events.map((e) => (
              <p key={e.id}>
                {jobDate(e.createdAt)} · {e.kind} · Revision {e.revision}
              </p>
            ))}
          </Accordion>
        </div>
      )}
    </UiDialog>
  );
}
