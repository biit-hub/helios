"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { TaskAccordion } from "./task-accordion";
import { TaskMarkdown } from "./task-markdown";
type Comment = { id: string; content: string; posted_at: string | null };
export function TaskComments({
  comments: initial,
  load,
  disabled = false,
}: Readonly<{
  comments?: Comment[];
  load?: () => Promise<Comment[]>;
  disabled?: boolean;
}>) {
  const [comments, setComments] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const shownComments = initial ?? comments;
  const [open, setOpen] = useState(false);
  const attempted = useRef(false);
  const inFlight = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const read = useCallback(async () => {
    if (!load || disabled || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const rows = await load();
      if (alive.current) setComments(rows);
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "Kommentare nicht verfügbar.",
        );
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }, [load, disabled]);
  useEffect(() => {
    if (open && !disabled && !attempted.current && !shownComments && !error) {
      attempted.current = true;
      void read();
    }
  }, [open, disabled, shownComments, error, read]);
  function changeOpen(next: boolean) {
    if (next && !open && initial === undefined) {
      attempted.current = false;
      setComments(undefined);
      setError("");
    }
    setOpen(next);
  }
  return (
    <TaskAccordion title="Kommentare" onOpenStateChange={changeOpen}>
      {busy && <p role="status">Kommentare werden geladen …</p>}
      {disabled && !shownComments && (
        <p>Kommentare sind für diesen Aufgabenstand nicht verfügbar.</p>
      )}
      {error && (
        <>
          <p role="alert">{error}</p>
          <button
            type="button"
            className="secondary"
            disabled={busy || disabled}
            onClick={() => void read()}
          >
            Kommentare erneut laden
          </button>
        </>
      )}
      {shownComments &&
        (shownComments.length ? (
          shownComments.map((c) => (
            <blockquote key={c.id}>
              <TaskMarkdown text={c.content} />
              {c.posted_at && (
                <small>
                  {new Date(c.posted_at).toLocaleString("de-CH", {
                    timeZone: "Europe/Zurich",
                  })}
                </small>
              )}
            </blockquote>
          ))
        ) : (
          <p>Keine Kommentare vorhanden.</p>
        ))}
    </TaskAccordion>
  );
}
