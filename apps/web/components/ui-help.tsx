"use client";
import { Button, Icon } from "@helios/ui";
import { useId, useState, type ReactNode } from "react";

export function InfoTip({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="ux-tooltip"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setOpen(false);
      }}
    >
      <Button
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
      </Button>
      <span id={id} role="tooltip" hidden={!open}>
        {children}
      </span>
    </span>
  );
}
export { Dialog as UiDialog } from "@helios/ui";
