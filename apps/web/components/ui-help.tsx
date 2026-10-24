"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "@helios/ui";
export function InfoTip({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="ux-tooltip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={"Information zu " + label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <Icon name="info" />
      </button>
      <span id={id} role="tooltip" hidden={!open}>
        {children}
      </span>
    </span>
  );
}
export function UiDialog({
  title,
  children,
  close,
  busy = false,
}: Readonly<{
  title: string;
  children: ReactNode;
  close: () => void;
  busy?: boolean;
}>) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className="ux-dialog card"
      aria-label={title}
      aria-busy={busy}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <div className="panel-heading">
        <h2>{title}</h2>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={close}
        >
          Schliessen
        </button>
      </div>
      {children}
    </dialog>
  );
}
