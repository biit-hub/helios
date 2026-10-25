"use client";
import { useNavigationLock } from "./navigation-lock";
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
    [items, setItems] = useState<
      { id: string; text: string; checked: boolean }[]
    >([]),
    [correction, setCorrection] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<Preview | null>(null),
    [operation, setOperation] = useState<TaskOperationView | null>(null),
    [linkLabel, setLinkLabel] = useState(""),
    [linkUrl, setLinkUrl] = useState(""),
    [linkTarget, setLinkTarget] = useState(""),
    [newItem, setNewItem] = useState("");
  const draft = useRef({
    detail,
    goal,
    items,
    correction,
    linkLabel,
    linkUrl,
    newItem,
  });
  useEffect(() => {
    draft.current = {
      detail,
      goal,
      items,
      correction,
      linkLabel,
      linkUrl,
      newItem,
    };
  });
  const [requestUncertain, setRequestUncertain] = useState(false);
  const key = useRef(crypto.randomUUID());
  const path =
    "/api/epics?" + new URLSearchParams({ contextId: context.id, taskId });
  const load = useCallback(
    async (preserveDraft = false) => {
      const d: EpicDetail = await request(path);
      const current = draft.current;
      const clean = (items: { text: string; checked: boolean }[]) =>
        items.map(({ text, checked }) => ({ text, checked }));
      const changed = (a: unknown, b: unknown) =>
        JSON.stringify(a) !== JSON.stringify(b);
      setDetail(d);
      if (
        !preserveDraft ||
        !current.detail ||
        !changed(current.goal, current.detail.goal) ||
        current.goal === d.goal
      )
        setGoal(d.goal);
      if (
        !preserveDraft ||
        !current.detail ||
        !changed(clean(current.items), current.detail.checklist) ||
        !changed(clean(current.items), d.checklist)
      )
        setItems(
          d.checklist.map(({ text, checked }) => ({
            id: crypto.randomUUID(),
            text,
            checked,
          })),
        );
      if (
        !preserveDraft ||
        !current.detail ||
        current.correction === current.detail.correction
      )
        setCorrection(d.correction);
      if (
        !preserveDraft ||
        d.inspection.links.some(
          (l) => l.url === current.linkUrl && l.label === current.linkLabel,
        )
      ) {
        setLinkLabel("");
        setLinkUrl("");
        setLinkTarget("");
      }
      if (!preserveDraft) setNewItem("");
      setPreview(null);
      return d;
    },
    [path],
  );
  useEffect(() => {
    let alive = true;
    void request(path)
      .then((d: EpicDetail) => {
        if (alive) {
          setDetail(d);
          setGoal(d.goal);
          setItems(
            d.checklist.map(({ text, checked }) => ({
              id: crypto.randomUUID(),
              text,
              checked,
            })),
          );
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
              await load(true);
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
    requestUncertain ||
    (!!operation &&
      ["queued", "running", "unknown", "partial"].includes(operation.status));
  useNavigationLock(pending);
  async function propose(change: DocumentChange) {
    const cleanChange =
      change.kind === "checklist"
        ? {
            kind: "checklist" as const,
            items: change.items.map(({ text, checked }) => ({ text, checked })),
          }
        : change;
    setBusy(true);
    setError("");
    try {
      setPreview(
        await request("/api/epics/preview", {
          contextId: context.id,
          taskId,
          change: cleanChange,
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
    requestUncertain,
    setRequestUncertain,
    detail,
    newItem,
    setNewItem,
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
