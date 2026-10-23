"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ContextView,
  KanbanInspection,
  TaskOperationView,
} from "@helios/contracts";
import { useNavigationLock } from "./navigation-lock";
async function api(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      value.error?.message ?? "Projektabschnitte konnten nicht geprüft werden.",
    );
  return value;
}
export function KanbanSetup({ context }: Readonly<{ context: ContextView }>) {
  const [view, setView] = useState<KanbanInspection | null>(null),
    [busy, setBusy] = useState(false),
    [operation, setOperation] = useState<TaskOperationView | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const attempt = useRef<{ hash: string; key: string } | null>(null),
    lock = useRef(false),
    finished = useRef<string | null>(null);
  const pending =
    !!operation &&
    ["queued", "running", "partial", "unknown"].includes(operation.status);
  useNavigationLock(busy || pending);
  const inspect = useCallback(async () => {
    const result = await api(
      "/api/tasks?kind=kanban&contextId=" + encodeURIComponent(context.id),
    );
    setView(result);
    return result as KanbanInspection;
  }, [context.id]);
  useEffect(() => {
    if (!operation || !pending) return;
    let alive = true;
    const timer = setInterval(() => {
      void api("/api/tasks")
        .then(async (rows: TaskOperationView[]) => {
          const row = rows.find((r) => r.id === operation.id);
          if (!alive || !row) return;
          if (row.status === "succeeded" && finished.current !== row.id) {
            const result = await inspect();
            finished.current = row.id;
            if (alive) {
              setOperation(row);
              setNotice(
                result.missing.length || result.ambiguous.length
                  ? "Auftrag nachgewiesen. Die Struktur wurde zwischenzeitlich verändert; bitte erneut prüfen."
                  : "Alle vier Abschnitte sind in Todoist nachgewiesen.",
              );
            }
          } else setOperation(row);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    }, 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [operation, pending, inspect]);
  async function run(resume = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (resume && operation) {
        await api("/api/tasks/resume", { operationId: operation.id });
        setOperation({ ...operation, status: "queued" });
      } else if (view && !pending) {
        const body = {
          action: "sections",
          contextId: context.id,
          sectionSetup: {
            projectId: view.projectId,
            contextRevision: view.contextRevision,
            missing: view.missing,
          },
        };
        const hash = JSON.stringify(body);
        if (attempt.current?.hash !== hash)
          attempt.current = { hash, key: crypto.randomUUID() };
        const result = await api("/api/tasks/submit", {
          ...body,
          key: attempt.current.key,
        });
        setOperation({
          id: result.operationId,
          status: "queued",
          code: null,
          retryAt: null,
          result: null,
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="kanban-setup"
      aria-label={"Projektabschnitte für " + context.name}
    >
      <h4>Todoist-Projektabschnitte</h4>
      <button
        type="button"
        disabled={busy || pending}
        onClick={() => {
          setBusy(true);
          setError("");
          void inspect()
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        Kanban-Abschnitte prüfen
      </button>
      {view && (
        <>
          <p className="help">
            Vorhanden:{" "}
            {view.present.join(" · ") || "keine der benötigten Abschnitte"}.
          </p>
          {view.ambiguous.length > 0 ? (
            <p role="alert">
              Mehrdeutige Abschnitte: {view.ambiguous.join(", ")}. Zuerst in
              Todoist klären; es wird nichts umbenannt.
            </p>
          ) : view.missing.length > 0 ? (
            <>
              <p>
                Nur fehlende Abschnitte anlegen:{" "}
                <strong>{view.missing.join(" · ")}</strong>. Bestehende
                Abschnitte und Aufgaben bleiben unverändert.
              </p>
              <button
                type="button"
                disabled={busy || pending || operation?.status === "succeeded"}
                onClick={() => void run()}
              >
                Fehlende Abschnitte bewusst anlegen
              </button>
            </>
          ) : (
            <p>Vollständig eingerichtet.</p>
          )}
        </>
      )}
      {operation && operation.status !== "succeeded" && (
        <p role="status">
          {["queued", "running"].includes(operation.status)
            ? "Einrichtung angenommen; externer Nachweis steht aus."
            : "Einrichtung nicht vollständig bestätigt. Kein neuer Auftrag wird automatisch erzeugt."}
        </p>
      )}
      {operation &&
        ["unknown", "partial", "failed"].includes(operation.status) && (
          <button type="button" disabled={busy} onClick={() => void run(true)}>
            Stand prüfen und denselben Auftrag fortsetzen
          </button>
        )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
