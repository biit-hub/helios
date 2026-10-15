import type { CalendarOrientation, PlanEntry } from "@helios/contracts";
export function calendarCandidates(
  entries: PlanEntry[],
  orientation: CalendarOrientation,
  day: string,
): PlanEntry[] {
  if (!orientation.reliable || !orientation.budget)
    return entries
      .slice(0, 5)
      .map((entry, position) => ({ ...entry, position: position + 1 }));
  const selected: PlanEntry[] = [];
  let minutes = 0,
    unknown = false,
    overBudgetUrgent = false;
  const { minimumMinutes, maximumMinutes } = orientation.budget;
  for (const entry of entries) {
    if (selected.length >= 5) break;
    const duration = entry.source.duration;
    const known =
      duration?.unit === "minute" &&
      Number.isFinite(duration.amount) &&
      duration.amount > 0
        ? duration.amount
        : null;
    const urgent = !!entry.source.deadline && entry.source.deadline.date <= day;
    const reasons = [
      ...entry.reasons,
      `Kalenderorientierung: ${minimumMinutes}–${maximumMinutes} Minuten, keine feste Uhrzeitzuweisung.`,
    ];
    if (known === null) {
      if (unknown || (minutes >= minimumMinutes && !urgent)) continue;
      unknown = true;
      reasons.push(
        "Dauer unbekannt; die zeitliche Passung ist offen, nicht null Minuten.",
      );
    } else if (minutes + known <= minimumMinutes) {
      minutes += known;
      reasons.push(
        "Bekannte Dauer passt innerhalb der vorsichtigen Kalenderorientierung.",
      );
    } else {
      if (!urgent || overBudgetUrgent) continue;
      overBudgetUrgent = true;
      minutes += known;
      reasons.push(
        "Echte Deadline ist erreicht; die bekannte Dauer passt nicht verlässlich ins Zeitbudget. Bewusst prüfen.",
      );
    }
    selected.push({ ...entry, reasons, position: selected.length + 1 });
    if (known === null) break;
  }
  return selected;
}
