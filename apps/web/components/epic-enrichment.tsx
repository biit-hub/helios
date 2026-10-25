"use client";
import type { DocumentModel } from "./use-task-document";
import { TaskAccordion } from "./task-accordion";
import { useState } from "react";
import { AiDraftPanel } from "./ai-drafts";
import { epicRequest as request } from "./epic-http";
export function EpicEnrichment({
  model,
  context,
  taskId,
  snapshot,
}: Readonly<{
  model: DocumentModel;
  context: import("@helios/contracts").ContextView;
  taskId: string;
  snapshot: import("@helios/contracts").WorkSnapshot;
}>) {
  const [smartOpen, setSmartOpen] = useState(false),
    [decompositionOpen, setDecompositionOpen] = useState(false),
    [understandingOpen, setUnderstandingOpen] = useState(false);
  const {
    detail,
    setDetail,
    correction,
    setCorrection,
    setError,
    setBusy,
    pending,
  } = model;
  return (
    <>
      {" "}
      {!detail.inspection.task.checked && (
        <>
          <TaskAccordion
            title="SMART-Ziel prüfen und verbessern"
            onOpen={() => setSmartOpen(true)}
          >
            {smartOpen && (
              <AiDraftPanel
                kind="smart"
                contextId={context.id}
                taskId={taskId}
                snapshot={snapshot}
              />
            )}
          </TaskAccordion>
          <TaskAccordion
            title="Checkliste oder eigenständig planbare Unteraufgaben vorschlagen"
            onOpen={() => setDecompositionOpen(true)}
          >
            {decompositionOpen && (
              <AiDraftPanel
                kind="decomposition"
                contextId={context.id}
                taskId={taskId}
                snapshot={snapshot}
              />
            )}
          </TaskAccordion>
        </>
      )}
      {detail.inspection.task.labels.includes("epic") && (
        <>
          <h3>Epic-Verständnis</h3>
          {detail.cache ? (
            <>
              <p>
                {detail.cache.fresh
                  ? "Aktuelle abgeleitete Einschätzung"
                  : "Veraltete Einschätzung – Quellen oder Profil wurden geändert"}{" "}
                · {new Date(detail.cache.createdAt).toLocaleString("de-CH")}
              </p>
              <p>{detail.cache.output.understanding?.summary}</p>
              <p>Unsicherheit: {detail.cache.output.uncertainty}</p>
              {detail.cache.output.understanding?.contributions.map((c) => (
                <p key={c.taskId}>
                  <a
                    href={
                      "/tasks?context=" +
                      context.id +
                      "&task=" +
                      encodeURIComponent(c.taskId)
                    }
                  >
                    Zielbeitrag:{" "}
                    {detail.children.find((t) => t.id === c.taskId)?.content ??
                      detail.inspection.task.content}
                  </a>{" "}
                  · Einschätzung: {c.reason} · Quellbeleg: «{c.evidence}»
                </p>
              ))}
              {detail.cache.output.understanding?.dependencies.map((d) => (
                <p key={d.from + ":" + d.to}>
                  Bekannte Abhängigkeit {d.from} → {d.to}: «{d.evidence}»
                </p>
              ))}
              {detail.cache.output.understanding?.nextSteps.map((n) => (
                <p key={n.taskId + ":" + n.text}>
                  Vorgeschlagener nächster Schritt: {n.text} · «{n.evidence}»
                </p>
              ))}
              <p>
                Modell {detail.cache.model} · Prompt{" "}
                {detail.cache.promptVersion} · Schema{" "}
                {detail.cache.schemaVersion}
              </p>
            </>
          ) : (
            <p>Noch kein abgeleitetes Verständnis gespeichert.</p>
          )}
          <label>
            <span>Deine verbindliche Korrektur</span>
            <textarea
              maxLength={4000}
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setBusy(true);
              void request("/api/epics/correct", {
                contextId: context.id,
                taskId,
                basis: detail.inspection.basis,
                revision: detail.correctionRevision,
                value: correction,
              })
                .then((r) =>
                  setDetail({
                    ...detail,
                    correction,
                    correctionRevision: r.revision,
                    cache: detail.cache
                      ? { ...detail.cache, fresh: false }
                      : null,
                  }),
                )
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Korrektur lokal speichern
          </button>
          {!detail.inspection.task.checked && (
            <details
              onToggle={(e) => {
                if (e.currentTarget.open) setUnderstandingOpen(true);
              }}
            >
              <summary>Epic-Verständnis analysieren oder korrigieren</summary>
              {understandingOpen && (
                <AiDraftPanel
                  kind="epic"
                  contextId={context.id}
                  taskId={taskId}
                  snapshot={snapshot}
                />
              )}
            </details>
          )}
        </>
      )}
    </>
  );
}
