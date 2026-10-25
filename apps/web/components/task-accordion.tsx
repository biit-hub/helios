"use client";
import type { ReactNode } from "react";
import { Icon } from "@helios/ui";

export function TaskAccordion({
  title,
  children,
  onOpen,
  onOpenStateChange,
  className = "",
}: Readonly<{
  title: ReactNode;
  children: ReactNode;
  onOpen?: () => void;
  onOpenStateChange?: (open: boolean) => void;
  className?: string;
}>) {
  return (
    <details
      className={"task-accordion " + className}
      onToggle={(e) => {
        if (e.target !== e.currentTarget) return;
        onOpenStateChange?.(e.currentTarget.open);
        if (e.currentTarget.open) onOpen?.();
      }}
    >
      <summary>
        <span>{title}</span>
        <Icon name="chevron" />
      </summary>
      <div className="task-accordion-body">{children}</div>
    </details>
  );
}
