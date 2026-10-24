import type { TaskView, WaitingDetails } from "@helios/contracts";
import { dateLabel, taskDateInputs } from "./task-dates";
import { TaskMarkdown } from "./task-markdown";

export function displayDescription(
  text: string,
  waiting: WaitingDetails | null,
) {
  if (!waiting) return text;
  const block =
    "## Helios – Wartedetails\nWartet auf: " +
    waiting.who +
    "\nGegenstand: " +
    waiting.subject +
    "\nNachfassen am: " +
    (waiting.followUp ?? "—");
  const normalized = text.replaceAll("\r\n", "\n");
  const start = normalized.indexOf(block);
  if (
    start < 0 ||
    (start > 0 && normalized[start - 1] !== "\n") ||
    normalized.indexOf(block, start + 1) >= 0
  )
    return text;
  const rest = normalized.slice(start + block.length);
  if (rest && !rest.startsWith("\n")) return text;
  return (normalized.slice(0, start) + rest).trim();
}
export function TaskProperties({
  task,
  timezone = "Europe/Zurich",
  status,
}: Readonly<{ task: TaskView; timezone?: string; status: string }>) {
  const t = task.data,
    due = taskDateInputs(t.due, timezone);
  const fields: [string, string][] = [
    ["Status", status],
    ["Priorität", "P" + (5 - t.priority)],
    ["Geplantes Datum", due.date ? dateLabel(due.date) : "Nicht gesetzt"],
  ];
  if (due.time) fields.push(["Geplante Uhrzeit", due.time + " · " + timezone]);
  fields.push([
    "Deadline",
    t.deadline ? dateLabel(t.deadline.date) : "Nicht gesetzt",
  ]);
  if (t.duration)
    fields.push([
      "Dauer",
      t.duration.amount + (t.duration.unit === "minute" ? " Minuten" : " Tage"),
    ]);
  if (t.due?.is_recurring)
    fields.push(["Wiederholung", t.due.string ?? "Wiederkehrend"]);
  if (t.labels.length) fields.push(["Labels", t.labels.join(", ")]);
  if (task.waiting) {
    fields.push(
      ["Wartet auf", task.waiting.who],
      ["Gegenstand", task.waiting.subject],
    );
    if (task.waiting.followUp)
      fields.push(["Nächste Prüfung", dateLabel(task.waiting.followUp)]);
  }
  return (
    <>
      <dl className="task-property-grid">
        {fields.map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <section className="task-description-section">
        <h4>Beschreibung</h4>
        <TaskMarkdown
          text={
            displayDescription(t.description, task.waiting ?? null) ||
            "Keine Beschreibung vorhanden."
          }
        />
      </section>
    </>
  );
}
