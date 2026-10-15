import type {
  CalendarOrientation,
  CalendarBudget,
  PlanEntry,
} from "@helios/contracts";
type FitState = {
  minutes: number;
  unknown: boolean;
  overBudgetUrgent: boolean;
};
function knownDuration(entry: PlanEntry) {
  const duration = entry.source.duration;
  return duration?.unit === "minute" &&
    Number.isFinite(duration.amount) &&
    duration.amount > 0
    ? duration.amount
    : null;
}
function assessFit(
  known: number | null,
  urgent: boolean,
  state: FitState,
  minimumMinutes: number,
) {
  if (known === null) {
    if (state.unknown || (state.minutes >= minimumMinutes && !urgent))
      return null;
    return {
      state: { ...state, unknown: true },
      reason:
        "Dauer unbekannt; die zeitliche Passung ist offen, nicht null Minuten.",
    };
  }
  if (state.minutes + known <= minimumMinutes)
    return {
      state: { ...state, minutes: state.minutes + known },
      reason:
        "Bekannte Dauer passt innerhalb der vorsichtigen Kalenderorientierung.",
    };
  if (!urgent || state.overBudgetUrgent) return null;
  return {
    state: { ...state, minutes: state.minutes + known, overBudgetUrgent: true },
    reason:
      "Echte Deadline ist erreicht; die bekannte Dauer passt nicht verlässlich ins Zeitbudget. Bewusst prüfen.",
  };
}
function fitCandidates(
  entries: PlanEntry[],
  budget: CalendarBudget,
  day: string,
) {
  const selected: PlanEntry[] = [];
  let state: FitState = { minutes: 0, unknown: false, overBudgetUrgent: false };
  for (const entry of entries) {
    if (selected.length >= 5) break;
    const known = knownDuration(entry),
      urgent = !!entry.source.deadline && entry.source.deadline.date <= day;
    const fit = assessFit(known, urgent, state, budget.minimumMinutes);
    if (!fit) continue;
    state = fit.state;
    const reasons = [
      ...entry.reasons,
      `Kalenderorientierung: ${budget.minimumMinutes}–${budget.maximumMinutes} Minuten, keine feste Uhrzeitzuweisung.`,
      fit.reason,
    ];
    selected.push({ ...entry, reasons, position: selected.length + 1 });
    if (known === null) break;
  }
  return selected;
}
export function calendarCandidates(
  entries: PlanEntry[],
  orientation: CalendarOrientation,
  day: string,
): PlanEntry[] {
  if (!orientation.reliable || !orientation.budget)
    return entries
      .slice(0, 5)
      .map((entry, position) => ({ ...entry, position: position + 1 }));
  return fitCandidates(entries, orientation.budget, day);
}
