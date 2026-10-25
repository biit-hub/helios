"use client";
import { FormField, Textarea, Button, Checkbox, Input, Icon } from "@helios/ui";
import { TaskAccordion } from "./task-accordion";

import type { DocumentModel } from "./use-task-document";

export function DocumentFields({ model }: Readonly<{ model: DocumentModel }>) {
  const {
    detail,
    goal,
    setGoal,
    items,
    setItems,
    setPreview,
    pending,
    propose,
    move,
    newItem,
    setNewItem,
  } = model;
  return (
    <>
      {" "}
      <fieldset
        disabled={
          pending || detail.inspection.task.checked || !!detail.markdownError
        }
      >
        <TaskAccordion title="Ziel">
          <FormField>
            <span>Ziel</span>
            <Textarea
              value={goal}
              maxLength={6000}
              onChange={(e) => {
                setGoal(e.target.value);
                setPreview(null);
              }}
            />
          </FormField>
          {!detail.goal && detail.inspection.task.labels.includes("epic") && (
            <p>
              Diesem Epic fehlt noch ein Ziel. Du kannst es selbst formulieren
              oder SMART-Hilfe nutzen.
            </p>
          )}
          <Button
            type="button"
            onClick={() => void propose({ kind: "goal", value: goal })}
          >
            Zieländerung prüfen
          </Button>
        </TaskAccordion>
        <TaskAccordion title={"Checkliste (" + items.length + ")"}>
          {items.map((item, i) => (
            <div className="checklist-row" key={item.id}>
              <Checkbox
                type="checkbox"
                aria-label={"Punkt " + (i + 1) + " erledigt"}
                checked={item.checked}
                onChange={(e) => {
                  setItems(
                    items.map((p, j) =>
                      j === i ? { ...p, checked: e.target.checked } : p,
                    ),
                  );
                  setPreview(null);
                }}
              />
              <Input
                aria-label={"Checklistenpunkt " + (i + 1)}
                value={item.text}
                maxLength={500}
                onChange={(e) => {
                  setItems(
                    items.map((p, j) =>
                      j === i ? { ...p, text: e.target.value } : p,
                    ),
                  );
                  setPreview(null);
                }}
              />
              <Button
                type="button"
                aria-label={"Punkt " + (i + 1) + " nach oben"}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <Icon name="up" />
              </Button>
              <Button
                type="button"
                aria-label={"Punkt " + (i + 1) + " nach unten"}
                disabled={i === items.length - 1}
                onClick={() => move(i, 1)}
              >
                <Icon name="down" />
              </Button>
              <Button
                type="button"
                aria-label={"Punkt " + (i + 1) + " löschen"}
                onClick={() => {
                  setItems(items.filter((_, j) => j !== i));
                  setPreview(null);
                }}
              >
                Entfernen
              </Button>
            </div>
          ))}
          <div className="checklist-add">
            <FormField>
              <span>Neuer Checklistenpunkt</span>
              <Input
                value={newItem}
                maxLength={500}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (newItem.trim() && items.length < 100) {
                      setItems([
                        ...items,
                        {
                          id: crypto.randomUUID(),
                          text: newItem.trim(),
                          checked: false,
                        },
                      ]);
                      setNewItem("");
                      setPreview(null);
                    }
                  }
                }}
              />
            </FormField>
            <Button
              type="button"
              aria-label="Checklistenpunkt hinzufügen"
              disabled={!newItem.trim() || items.length >= 100}
              onClick={() => {
                setItems([
                  ...items,
                  {
                    id: crypto.randomUUID(),
                    text: newItem.trim(),
                    checked: false,
                  },
                ]);
                setNewItem("");
                setPreview(null);
              }}
            >
              <Icon name="plus" />
            </Button>
          </div>
          <p className="help">
            Checklistenpunkte sind keine Todoist-Unteraufgaben. Änderungen
            werden erst nach Vorschau und Bestätigung gespeichert.
          </p>
          <Button
            type="button"
            disabled={items.some((i) => !i.text.trim())}
            onClick={() => void propose({ kind: "checklist", items })}
          >
            Checklistenänderung prüfen
          </Button>
        </TaskAccordion>
      </fieldset>
    </>
  );
}
