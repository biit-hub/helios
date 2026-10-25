"use client";
import Link from "next/link";
import { aiJobErrorMessages, problemMessages } from "@helios/contracts";
import type { WorkSnapshot } from "@helios/contracts";
type Action = (name: string, body: unknown) => Promise<unknown>;
const at = (value: string | null) =>
  value ? new Date(value).toLocaleString("de-CH") : "Noch nicht abgerufen";
export function Problems({
  snapshot,
  busy,
  action,
}: Readonly<{
  snapshot: WorkSnapshot;
  busy: boolean;
  action: Action;
}>) {
  return (
    <section className="card settings-panel">
      <h2>Verbindungen & Probleme</h2>
      {!!snapshot.aiJobProblems?.length && (
        <div>
          <h3>KI-Aufträge · {snapshot.aiJobProblems.length} offen</h3>
          {snapshot.aiJobProblems.map((job) => (
            <article key={job.id} className="problem-row">
              <p>
                {aiJobErrorMessages[job.code ?? ""] ??
                  "Die KI-Bearbeitung wurde nicht bestätigt."}
              </p>
              <Link href={"/ai-jobs?job=" + job.id}>KI-Auftrag ansehen</Link>
              <p className="help">{at(job.updatedAt)}</p>
            </article>
          ))}
        </div>
      )}
      {!snapshot.problems.length ? (
        <p>Keine erfassten Verbindungsprobleme.</p>
      ) : (
        snapshot.problems.map((p) => (
          <article key={p.id} className="problem-row">
            <h3>{problemMessages[p.code]}</h3>
            <p>
              {snapshot.contexts.find((c) => c.id === p.contextId)?.name ??
                "Todoist"}{" "}
              ·{" "}
              {p.status === "checked"
                ? "Geprüft · weiterhin offen"
                : p.status === "resolved"
                  ? "Behoben durch erfolgreichen Abruf"
                  : "Offen"}{" "}
              · {p.occurrences} Auftreten
            </p>
            <p className="help">
              {p.code} · {at(p.lastSeenAt)}
            </p>
            {p.status === "open" && (
              <button
                type="button"
                disabled={busy}
                className="secondary"
                onClick={() =>
                  void action("problem-check", {
                    id: p.id,
                    revision: p.revision,
                  }).catch(() => {})
                }
              >
                Als geprüft markieren
              </button>
            )}
          </article>
        ))
      )}
    </section>
  );
}
