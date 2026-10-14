import { createHash } from "node:crypto";
import type { PlanEntry, TaskView, TodoistTask } from "@helios/contracts";
export function localDay(now = new Date(), timezone = "Europe/Zurich") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const field = (n: string) => parts.find((p) => p.type === n)!.value;
  return field("year") + "-" + field("month") + "-" + field("day");
}
// Stable meaningful source: own section moves legitimately change updated_at.
export function taskBasis(t: TodoistTask) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        stable([
          t.id,
          t.project_id,
          t.parent_id,
          t.content,
          t.description,
          t.priority,
          [...t.labels].sort((a, b) => a.localeCompare(b)),
          t.due
            ? Object.fromEntries(
                Object.entries(t.due).filter(
                  ([key]) => key !== "string" && key !== "lang",
                ),
              )
            : null,
          t.deadline,
          t.duration ?? null,
          t.checked,
          t.is_deleted,
        ]),
      ),
    )
    .digest("hex");
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    );
  return value;
}
export function candidates(
  rows: TaskView[],
  projectId: string,
  day: string,
  kind: string,
): PlanEntry[] {
  const known = new Map(rows.map((t) => [t.data.id, t]));
  const suitable = (row: TaskView) => {
    const t = row.data;
    if (
      row.state !== "active" ||
      t.project_id !== projectId ||
      t.checked ||
      t.is_deleted ||
      t.labels.includes("epic") ||
      ["Wartet", "Abgeschlossen"].includes(row.sectionName ?? "")
    )
      return false;
    // Unknown/deleted/completed ancestors never imply an executable child.
    const seen = new Set([t.id]);
    let parent = t.parent_id;
    while (parent) {
      const ancestor = known.get(parent);
      if (
        !ancestor ||
        seen.has(parent) ||
        ancestor.state !== "active" ||
        ancestor.data.checked ||
        ancestor.data.is_deleted ||
        ancestor.data.project_id !== projectId ||
        ["Wartet", "Abgeschlossen"].includes(ancestor.sectionName ?? "")
      )
        return false;
      seen.add(parent);
      parent = ancestor.data.parent_id;
    }
    return (
      !t.due?.date ||
      t.due.date.slice(0, 10) <= day ||
      !!(t.deadline && t.deadline.date <= day)
    );
  };
  const deadline = (t: TodoistTask) => t.deadline?.date ?? "9999-99-99";
  const due = (t: TodoistTask) => t.due?.date.slice(0, 10) ?? "9999-99-99";
  return rows
    .filter(suitable)
    .sort((a, b) => {
      const x = a.data,
        y = b.data;
      return (
        deadline(x).localeCompare(deadline(y)) ||
        due(x).localeCompare(due(y)) ||
        y.priority - x.priority ||
        (kind === "private"
          ? Number(x.labels.includes("fun")) - Number(y.labels.includes("fun"))
          : 0) ||
        duration(x) - duration(y) ||
        x.id.localeCompare(y.id)
      );
    })
    .slice(0, 5)
    .map((row, index) => {
      const t = row.data;
      const reasons: string[] = [];
      if (t.deadline) reasons.push("Echte Deadline: " + t.deadline.date + ".");
      if (t.due)
        reasons.push(
          "Geplantes Datum: " +
            t.due.date.slice(0, 10) +
            "; getrennt von der Deadline.",
        );
      if (t.priority > 1)
        reasons.push("Todoist-Priorität P" + (5 - t.priority) + ".");
      if (kind === "private")
        reasons.push(
          t.labels.includes("fun")
            ? "Bewusst als freiwillig (fun) gekennzeichnet."
            : "Private Aufgabe ohne fun-Kennzeichnung.",
        );
      if (t.duration?.unit === "minute")
        reasons.push("Bekannte Dauer: " + t.duration.amount + " Minuten.");
      if (!reasons.length)
        reasons.push(
          "Offene, nicht als wartend bekannte Aufgabe im gewählten Projekt.",
        );
      if (t.parent_id)
        reasons.push(
          "Unteraufgabe: Hierarchie und Todoist-Abschnitt bleiben erhalten.",
        );
      return {
        taskId: t.id,
        position: index + 1,
        source: t,
        sectionName: row.sectionName,
        reasons,
      };
    });
}
function duration(t: TodoistTask) {
  return t.duration?.unit === "minute"
    ? t.duration.amount
    : Number.MAX_SAFE_INTEGER;
}
