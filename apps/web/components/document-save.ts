import type { DocumentChange } from "@helios/contracts";
import type { DocumentController } from "./use-task-document";

export function documentDraftChanges(
  model: DocumentController | null,
): DocumentChange[] {
  if (!model?.detail) return [];
  const { detail } = model;
  if (model.correction !== detail.correction)
    throw new Error(
      "Deine verbindliche Epic-Korrektur bitte zuerst über ihre eigene Bestätigung speichern. Alle Eingaben bleiben erhalten.",
    );
  const changes: DocumentChange[] = [];
  if (model.goal !== detail.goal)
    changes.push({ kind: "goal", value: model.goal });
  const items = model.items.map(({ text, checked }) => ({ text, checked }));
  if (model.newItem.trim())
    items.push({ text: model.newItem.trim(), checked: false });
  if (JSON.stringify(items) !== JSON.stringify(detail.checklist))
    changes.push({ kind: "checklist", items });
  if (model.linkLabel || model.linkUrl) {
    if (!model.linkLabel.trim() || !model.linkUrl.trim())
      throw new Error(
        "Bitte Linkbezeichnung und Dokumentenadresse vollständig eingeben.",
      );
    const value = { label: model.linkLabel, url: model.linkUrl };
    if (model.linkTarget)
      changes.push({ kind: "link-edit", target: model.linkTarget, ...value });
    else changes.push({ kind: "link-add", ...value });
  }
  return changes;
}
