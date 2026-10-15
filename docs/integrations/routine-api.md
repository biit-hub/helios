# E7 – Routine-API

GET /api/routine liefert den gespeicherten Routinenstand für den lokalen Tag; ohne Start bleibt routine null. Optional day für historische Leseansicht. Lesen startet keine Routine. POST /api/routine/start beginnt bewusst, POST resume setzt bewusst fort; startedAt bleibt erhalten.

GET /api/routine?kind=inbox&id=UUID liefert eine einzige native Eingangskarte samt Quellenbasis und eigenen Operationsständen. kind=review oder enrichment benötigt zusätzlich contextId. Review liefert die historische Instanz und ihren belegten/aktiven/geänderten/unbekannten Zustand. Leseantworten werden nach asynchronen Abrufen erneut gegen Sitzung, Routine-/Kontextrevision, Integrationsrevision und Credentialgeneration geprüft.

Alle POSTs verwenden den bestehenden Domain-HTTP-Guard: aktive Sitzung, vollständige MFA, kanonischer Origin, JSON, 64 KiB und fünf Sekunden Body-Lesefrist. Kein Actor, Systemrecht oder Secret aus Clientdaten. Antworten sind no-store/private.

Gemeinsam: key als UUID, ausser start id und erwartete revision; Kontextaktionen zusätzlich contextId/contextRevision. Gleicher Key mit verändertem Body ist 409, gleiche Wiederholung hat keinen zweiten Effekt.

- select-contexts: bewusste contextIds; aktive eigene Kontexte, kein fest codierter Arbeitgeber. Abwahl erhält den Stand.
- navigate, skip, complete: step und gegebenenfalls Kontext. Skip ist skipped_open. Review mit unbekanntem Feedback und Planung ohne bestätigten Plan werden nicht als erfolgreicher Abschluss behauptet.
- inbox-defer: taskId/basis; nur lokale Rückstellung einer tatsächlich gelesenen Eingangskarte. inbox-reopen zeigt die heutigen Rückstellungen wieder.
- inbox-move: taskId/basis/projectId und ausdrückliche Benutzerwahl. inbox-delete benötigt acknowledgeDestructive; betroffene Hierarchien zusätzlich acknowledgeHierarchy. Beide verwenden E4, HTTP 202 ist nur Annahme.
- feedback: historische entryKeys, partial oder not_started, bei partial zwingend ein eigener passender E6-draftId (bei not_started optional). Keine native Mutation allein durch Rückmeldung.
- review-close: items mit entryKey/basis und acknowledgeDestructive, gegebenenfalls Hierarchiebestätigung. Ganze Entscheidung wird zuerst gespeichert, dann je Aufgabe E4 eingereiht. HTTP 202 beweist keinen Abschluss; Ergebnisse und Wiederaufnahme sind einzeln.

Externe Wiederaufnahme bleibt POST /api/tasks/resume mit operationId. Nicht eingereihte bestätigte Sammelentscheidungen liefert pendingReviews mit dem ursprünglichen idempotenten Befehl. Ein Unknown-Create/Comment/Close wird niemals neu erfunden oder blind wiederholt. Fortschritt nutzt /api/ai und denselben E6-Dialog; expectedInstanceKey bindet historische Einstiege zusätzlich.

Routinefortschritt ist kein Erfolgsprozentsatz. Eine vollständige Erfolgsaussage verlangt abgeschlossene ausgewählte Schritte und keine offenen verknüpften externen Operationen. Verbindliche Guards bleiben im Backend.
