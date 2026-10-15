# E8 – Epic- und Markdown-API

Aktive vollständig MFA-bestätigte Sitzung, bei POST kanonischer Origin. Private/no-store. Kontextbesitz, aktives verwaltetes Projekt und Credentialgeneration werden nach externen Reads erneut geprüft. Eingang und Fremdprojekte ausgeschlossen.

| Route                            | Vertrag                                                                                                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET /api/epics?contextId         | Bekannte native epic-Projektionen, kein vollständiger Abschlussarchivimport. Unknown ist kein Abschluss.                                                                                                                   |
| GET /api/epics?contextId&taskId  | Frische Aufgabe/Kommentare, bekannte mehrstufige Hierarchie mit individuellen Abschlussnachweisen, Ziel/Checkliste/Links, Korrekturrevision und Cache-Freshness. Auch normale Aufgaben verwenden dieselbe Detailgrundlage. |
| POST /api/epics/preview          | contextId, taskId, change; liefert before/after/basis ohne Todoist-Write. change: goal, checklist, link-add oder link-edit.                                                                                                |
| POST /api/epics/correct          | contextId, taskId, basis, revision, value; lokale Benutzerkorrektur. Veraltete Revision: 409.                                                                                                                              |
| POST /api/tasks/submit           | Bestehender Vertrag; action document mit document und basis bestätigt die gezeigte Quellfassung.                                                                                                                           |
| POST /api/tasks/submit           | Manueller Epic-close mit offenen Kindern verlangt epicClosePolicy detach, acknowledgeHierarchy und acknowledgeDestructive. Server bestimmt Teilbäume und Kommentare selbst.                                                |
| GET /api/tasks                   | Bestehendes Journal mit verified-Einzeleffekten, pending, unknown/partial und ursprünglichem Kommando.                                                                                                                     |
| POST /api/ai/start               | Bestehender E6-Vertrag mit smart, epic oder decomposition; managed-only.                                                                                                                                                   |
| POST /api/ai/edit, apply, reject | Bestehende E6-Einzelpatch-/Revisions-/Entscheidungsverträge. goal ersetzt nur den Zielabschnitt; subtask erzeugt ein Kind am frisch geprüften Parent.                                                                      |

Eingaben bleiben bei Konflikten erhalten. Keine externe CAS-/Exactly-once-Garantie. Unbekannte Creates/Kommentare/Abschlüsse werden nicht blind wiederholt. Erst externe Verifikation bestätigt eine Speicherung.

[Architektur/F1](../architecture/epics-smart-goals.md), [Bedienung](../runbooks/epics-smart-goals.md).
