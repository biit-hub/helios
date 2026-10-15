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

## E5 – Ordnung, Fokus und Reserve

GET liefert zusätzlich `agenda`, `editable`, aktuelle Instanzverfügbarkeit und die ausstehenden verknüpften E4-Operationen. Fehlendes agenda in alten Snapshots bedeutet unveränderte E3-Hauptauswahl und leere Reserve. History bleibt unverändert lesbar. Nachfolgende POSTs verlangen contextId/day/revision/key; nur der aktuelle lokale Tag ist schreibbar. `reorder` ist auf 128 KiB begrenzt, alle anderen Planposts bleiben bei 8 KiB; dieselbe fünfsekündige Lesefrist, zentrale Auth-/MFA-/Originprüfung vor Bodyparsing und no-store.

| POST /api/plans/… | Weitere Eingabe                                                                                          | Wirkung                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| reorder           | area main/reserve, order (vollständige Instanzschlüssel-Permutation)                                     | Atomare Reihenfolge, neue Revision/History/Ereignis; kein Todoist-Write                                |
| transfer          | entryKey, area                                                                                           | Expliziter Bereichswechsel; Fokuskarte zuerst bewusst abwählen, sofern andere Hauptaufgaben existieren |
| agenda-focus      | taskId, optional entryKey zur eindeutigen Instanzwahl                                                    | Genau ein Fokuszeiger, kein Reorder oder Abschnittswechsel                                             |
| admit             | taskId, entryKey, area                                                                                   | Frische Eignungsprüfung; HTTP 202 bedeutet nur Journalannahme, Aufnahme erst nach Nachweis             |
| reserve-skip      | entryKey der aktuellen ausführbaren Karte, optional reason                                               | Rotation oder Einzelkartenpause, nur lokal                                                             |
| reserve-pause     | paused true/false                                                                                        | Persistente bewusste Pause/Fortsetzung                                                                 |
| reserve-close     | taskId, entryKey, aktueller basis-Fingerprint, acknowledgeDestructive, nötigenfalls acknowledgeHierarchy | HTTP 202; vorhandener E4-Abschluss; Karte erst nach nachgewiesenem Erfolg entfernen                    |

Instanzschlüssel mit `entryKey` aus dem gemeinsamen Vertrag berechnen; Todoist-ID allein genügt bei Wiederholungen nicht. Derselbe Key mit geändertem Body ist 409; eine identische Wiederholung verursacht keine zweite Aktion. Veraltete Revision ist 409 und bietet den erneut lesbaren Stand statt stillen Überschreibens. `PLAN_INSTANCE_CHANGED` verlangt eine neue bewusste Prüfung, `PLAN_TASK_UNAVAILABLE` kennzeichnet fehlende Eignung. Nachweise werden nicht aus fehlenden Active-Tasks abgeleitet.

Wiederaufnahme verknüpfter Writes bleibt POST /api/tasks/resume mit operationId und den E4-Frist-/Backoff-/Scopeprüfungen; kein neuer Close bei unbekannter Wirkung. Der bisherige E3-focus-Vertrag bleibt kompatibel; die E5-Oberfläche nutzt den zusätzlich idempotenten agenda-focus-Vertrag.


## E9-Ergänzung

PlanningView kann calendar und calendarChanged enthalten; PlanView optional calendarBasis. Nur die explizite propose-Aktion erstellt die aggregierte Basis. Bestehende bestätigte Pläne/Historien werden bei Refresh nicht mutiert. Ohne TermiHub bleibt der bisherige Antwortvertrag erhalten. Aktuelle lesende Orientierung separat über GET /api/calendar?contextId=…&day=…. [Details](termihub.md).
