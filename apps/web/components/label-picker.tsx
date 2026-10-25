"use client";
import { FormField, Button, Input, Icon } from "@helios/ui";

import { useEffect, useId, useState } from "react";
export function LabelPicker({
  value,
  onChange,
}: Readonly<{ value: string[]; onChange: (labels: string[]) => void }>) {
  const id = useId();
  const [labels, setLabels] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    void fetch("/api/tasks?kind=labels", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.labels))
          throw new Error(
            "Labeldaten sind momentan nicht verfügbar. Deine Auswahl bleibt erhalten.",
          );
        if (alive) {
          setLabels(
            data.labels.filter(
              (v: unknown) => typeof v === "string" && v !== "fun",
            ),
          );
          setError("");
          setLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [version]);
  const options = labels
    .filter((name) =>
      name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    )
    .slice(0, 50);
  function toggle(name: string) {
    if (value.includes(name)) onChange(value.filter((label) => label !== name));
    else if (value.length < 50) onChange([...value, name]);
  }
  return (
    <div className="label-picker">
      <FormField htmlFor={id}>Labels suchen</FormField>
      <div className="label-chips" aria-label="Ausgewählte Labels">
        {value.map((name) => (
          <span className="label-chip" key={name}>
            {name}
            <Button
              type="button"
              aria-label={"Label entfernen: " + name}
              onClick={() => onChange(value.filter((v) => v !== name))}
            >
              <Icon name="close" />
            </Button>
          </span>
        ))}
      </div>
      <Input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={id + "-list"}
        aria-activedescendant={
          open && options[active] ? id + "-option-" + active : undefined
        }
        aria-describedby={id + "-help"}
        value={query}
        autoComplete="off"
        placeholder="Vorhandene Labels durchsuchen"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          } else if (["ArrowDown", "ArrowUp"].includes(e.key)) {
            e.preventDefault();
            setOpen(true);
            setActive((n) =>
              Math.max(
                0,
                Math.min(
                  options.length - 1,
                  n + (e.key === "ArrowDown" ? 1 : -1),
                ),
              ),
            );
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (open && options[active]) toggle(options[active]);
            setOpen(true);
          }
        }}
      />
      {open && (
        <ul
          id={id + "-list"}
          role="listbox"
          aria-label="Vorhandene Todoist-Labels"
          aria-multiselectable="true"
        >
          {options.map((name, n) => (
            <li key={name}>
              <Button
                id={id + "-option-" + n}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={value.includes(name)}
                className={active === n ? "active-option" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setActive(n);
                  toggle(name);
                }}
              >
                {value.includes(name) && <Icon name="check" />}
                {name}
              </Button>
            </li>
          ))}
          {!options.length && (
            <li role="presentation">
              {loading
                ? "Labels werden geladen …"
                : error
                  ? "Labels aktuell nicht verfügbar."
                  : "Keine passenden vorhandenen Labels."}
            </li>
          )}
        </ul>
      )}
      <p id={id + "-help"} className="help">
        {error ||
          "Nur vorhandene Labels auswählen. Neue Labels werden hier nicht angelegt."}
      </p>
      {error && (
        <Button
          type="button"
          onClick={() => {
            setLoading(true);
            setVersion((n) => n + 1);
          }}
        >
          Labels erneut laden
        </Button>
      )}
    </div>
  );
}
