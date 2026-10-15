"use client";
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
  } = model;
  return (
    <>
      {" "}
      <fieldset
        disabled={
          pending || detail.inspection.task.checked || !!detail.markdownError
        }
      >
        <label>
          <span>Ziel</span>
          <textarea
            value={goal}
            maxLength={6000}
            onChange={(e) => {
              setGoal(e.target.value);
              setPreview(null);
            }}
          />
        </label>
        {!detail.goal && detail.inspection.task.labels.includes("epic") && (
          <p>
            Diesem Epic fehlt noch ein Ziel. Du kannst es selbst formulieren
            oder SMART-Hilfe nutzen.
          </p>
        )}
        <button
          type="button"
          onClick={() => void propose({ kind: "goal", value: goal })}
        >
          Zieländerung prüfen
        </button>
        <h3>Checkliste</h3>
        {items.map((item, i) => (
          <div className="checklist-row" key={item.id}>
            <input
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
            <input
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
            <button
              type="button"
              aria-label={"Punkt " + (i + 1) + " nach oben"}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={"Punkt " + (i + 1) + " nach unten"}
              disabled={i === items.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              aria-label={"Punkt " + (i + 1) + " löschen"}
              onClick={() => {
                setItems(items.filter((_, j) => j !== i));
                setPreview(null);
              }}
            >
              Entfernen
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            setItems([
              ...items,
              { id: crypto.randomUUID(), text: "", checked: false },
            ]);
            setPreview(null);
          }}
        >
          Checklistenpunkt hinzufügen
        </button>
        <button
          type="button"
          disabled={items.some((i) => !i.text.trim())}
          onClick={() => void propose({ kind: "checklist", items })}
        >
          Checklistenänderung prüfen
        </button>
      </fieldset>
    </>
  );
}
