"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import type {
  EpicDetail,
  DocumentChange,
  ContextView,
  TaskOperationView,
} from "@helios/contracts";
import { epicRequest as request } from "./epic-http";
export type Preview = {
  before: string;
  after: string;
  basis: string;
  change: DocumentChange;
};
export function useTaskDocument(context: ContextView, taskId: string) {
  const [detail, setDetail] = useState<EpicDetail | null>(null),
    [goal, setGoal] = useState(""),
    [items, setItems] = useState<{ text: string; checked: boolean }[]>([]),
    [correction, setCorrection] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<Preview | null>(null),
    [operation, setOperation] = useState<TaskOperationView | null>(null),
    [linkLabel, setLinkLabel] = useState(""),
    [linkUrl, setLinkUrl] = useState(""),
    [linkTarget, setLinkTarget] = useState("");
  const key = useRef(crypto.randomUUID());
  const path =
    "/api/epics?" + new URLSearchParams({ contextId: context.id, taskId });
  const load = useCallback(async () => {
    const d: EpicDetail = await request(path);
    setDetail(d);
    setGoal(d.goal);
    setItems(d.checklist.map(({ text, checked }) => ({ text, checked })));
    setCorrection(d.correction);
    setPreview(null);
    return d;
  }, [path]);
  useEffect(() => {
    let alive = true;
    void request(path)
      .then((d: EpicDetail) => {
        if (alive) {
          setDetail(d);
          setGoal(d.goal);
          setItems(d.checklist.map(({ text, checked }) => ({ text, checked })));
          setCorrection(d.correction);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [path]);
  const operationId = operation?.id,
    operationStatus = operation?.status;
  useEffect(() => {
    if (!operationId || !["queued", "running"].includes(operationStatus ?? ""))
      return;
    let checking = false,
      alive = true;
    const timer = setInterval(() => {
      if (checking) return;
      checking = true;
      void (async () => {
        try {
          const rows: TaskOperationView[] = await request("/api/tasks");
          const op = rows.find((r) => r.id === operationId);
          if (!op || !alive) return;
          if (op.status === "succeeded") {
            setBusy(true);
            try {
              await load();
            } finally {
              if (alive) {
                setOperation(op);
                setBusy(false);
              }
            }
          } else setOperation(op);
        } catch (e) {
          if (alive)
            setError(
              e instanceof Error
                ? e.message
                : "Quelle konnte nicht geladen werden.",
            );
        } finally {
          checking = false;
        }
      })();
    }, 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [operationId, operationStatus, load]);
  const pending =
    busy ||
    (!!operation &&
      ["queued", "running", "unknown", "partial"].includes(operation.status));
  async function propose(change: DocumentChange) {
    setBusy(true);
    setError("");
    try {
      setPreview(
        await request("/api/epics/preview", {
          contextId: context.id,
          taskId,
          change,
        }),
      );
      key.current = crypto.randomUUID();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vorschau fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }
  function move(index: number, offset: number) {
    const copy = [...items],
      next = index + offset;
    if (next < 0 || next >= copy.length) return;
    [copy[index], copy[next]] = [copy[next]!, copy[index]!];
    setItems(copy);
    setPreview(null);
  }
  return {
    detail,
    setDetail,
    goal,
    setGoal,
    items,
    setItems,
    correction,
    setCorrection,
    error,
    setError,
    busy,
    setBusy,
    preview,
    setPreview,
    operation,
    setOperation,
    linkLabel,
    setLinkLabel,
    linkUrl,
    setLinkUrl,
    linkTarget,
    setLinkTarget,
    key,
    load,
    pending,
    propose,
    move,
  };
}
export type DocumentController = ReturnType<typeof useTaskDocument>;
export type DocumentModel = Omit<DocumentController, "detail"> & {
  detail: EpicDetail;
};
