"use client";
import { Button, Icon } from "@helios/ui";
import { useState, type ReactNode } from "react";

import { DragDropProvider } from "@dnd-kit/react";
import { useSortable, isSortable } from "@dnd-kit/react/sortable";
import { entryKey, type PlanEntry, type AgendaArea } from "@helios/contracts";
export function SortableArea({
  area,
  entries,
  disabled,
  reorder,
  children,
}: {
  readonly area: AgendaArea;
  readonly entries: PlanEntry[];
  readonly disabled: boolean;
  readonly reorder: (
    area: AgendaArea,
    from: number,
    to: number,
  ) => Promise<boolean>;
  readonly children: (entry: PlanEntry, index: number) => ReactNode;
}) {
  const [saving, setSaving] = useState(false);
  const [generation, setGeneration] = useState(0);
  return (
    <DragDropProvider
      key={generation}
      onDragEnd={async (event) => {
        if (event.canceled) return;
        const source = event.operation.source;
        if (isSortable(source) && source.initialIndex !== source.index) {
          setSaving(true);
          try {
            const success = await reorder(
              area,
              source.initialIndex,
              source.index,
            );
            if (!success) setGeneration((n) => n + 1);
          } finally {
            setSaving(false);
          }
        }
      }}
    >
      <ol
        className="today-list agenda-list"
        aria-label={area === "main" ? "Hauptaufgaben ordnen" : "Reserve ordnen"}
      >
        {entries.map((entry, index) => (
          <SortableEntry
            key={entryKey(entry)}
            entry={entry}
            index={index}
            area={area}
            disabled={disabled || saving}
          >
            {children(entry, index)}
          </SortableEntry>
        ))}
      </ol>
    </DragDropProvider>
  );
}
function SortableEntry({
  entry,
  index,
  area,
  disabled,
  children,
}: {
  readonly entry: PlanEntry;
  readonly index: number;
  readonly area: AgendaArea;
  readonly disabled: boolean;
  readonly children: ReactNode;
}) {
  const { ref, handleRef, isDragging, isDropTarget } = useSortable({
    id: entryKey(entry),
    index,
    group: area,
    disabled,
  });
  return (
    <li
      ref={ref}
      className={
        "today-entry agenda-entry" +
        (isDragging ? " dragging" : "") +
        (isDropTarget ? " drop-target" : "")
      }
      data-task-id={entry.taskId}
    >
      <Button
        ref={handleRef}
        type="button"
        className="secondary drag-handle"
        aria-label={entry.source.content + " verschieben"}
        disabled={disabled}
      >
        <Icon name="drag" />
      </Button>
      <div className="agenda-entry-content">{children}</div>
    </li>
  );
}
