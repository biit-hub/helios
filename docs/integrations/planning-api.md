# E3 – Planungs-API

Alle Routen brauchen gültige Sitzung, vollständige MFA und Kontextberechtigung. POST benötigt kanonischen Origin, JSON, maximal 8 KiB und erwartete Revision. Antworten sind no-store. Clientdaten dürfen weder Zeitzone noch Actor-/Systemberechtigung setzen.

| Route                                        | Eingabe / Wirkung                                                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| GET /api/plans?contextId=UUID&day=YYYY-MM-DD | Ohne day aktueller lokaler Tag. Plan, Operation mit Schritten und letzte 30 Revisionen. Keine externen Writes.                |
| POST /api/plans/propose                      | contextId, day, revision (0 ohne Plan). Nur draft darf neu vorgeschlagen werden.                                              |
| POST /api/plans/confirm                      | contextId, day, revision, key (UUID), taskIds (1–5 eindeutige Vorschlagseinträge). HTTP 202 mit operationId bedeutet Annahme. |
| POST /api/plans/focus                        | contextId, day, revision, taskId desselben bestätigten Plans. Neue Revision ohne Reorder.                                     |
| POST /api/plans/resume                       | contextId, day, revision, operationId. Nur partial nach Retryfrist; explizite neue Autorisierung derselben Operation.         |

Veraltete Revisionen, fremde Aufgaben und derselbe Idempotency-Key mit anderem Requesthash werden abgewiesen. confirmedAt entsteht erst nach vollständigem Wirkungsnachweis. Historische Quellen und Gründe bleiben erhalten.

Statusfolge: draft → confirming → confirmed oder partial; partial → bewusste Wiederaufnahme → confirming. Fokusänderungen betreffen nur confirmed. Einzelschritte: pending, sending, verified (externer Nachweis), local (freigegebener Hierarchieschutz), unknown oder failed. Die UI übersetzt reduzierte Fehlercodes in konkrete nächste Schritte.
