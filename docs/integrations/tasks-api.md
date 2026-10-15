# E4 – Aufgaben- und Operationsvertrag

GET /api/tasks benötigt aktive Sitzung und vollständige MFA. Ohne Parameter liefert es die letzten 30 eigenen Aufgabenoperationen mit Status, bestätigten Originaleingaben, Fehlercode, Retryzeit und nachgewiesenen Einzeleffekten. Mit contextId/taskId liest es die aktuelle Aufgabe, native Kinder, Kommentare, sichere HTTP(S)-Links, Wartedetails und Quellenfingerprint. Mit bewusst gewähltem projectId lädt es zulässige Abschnitte und Elternoptionen; kein KI-Scan.

POST /api/tasks/submit verwendet den zentralen HTTP-Guard vor Parsing, kanonischen Origin, JSON, 64 KiB Grenze und fünf Sekunden Lesefrist. Eingabe: key (UUID), action, contextId oder null bei Eingang/frei gewählter Erfassung; je nach Aktion taskId/basis, fields, projectId/sectionId/parentId, comment oder waiting. Unbekannte Felder werden abgewiesen. HTTP 202 bedeutet ausschliesslich Aufnahme ins persistente Journal.

Aktionen: create, update, move, comment, wait, close, delete, sections. Title-only ohne explizite Projektwahl erzeugt im nativen Eingang; der Kontext wird nicht still als Projektwahl behandelt. Titel/Beschreibung/Priorität/Labels sowie getrennte geplante Daten/Uhrzeit, Deadline, Dauer und bewusster Todoist-Wiederholungstext sind begrenzte erlaubte Felder. Update übermittelt nur gewählte Felder, Move ist eine gesonderte native Operation. Fehlende Werte sind unverändert, null leert die vorgesehenen Datums-/Dauerfelder. fun ist nur für den bewusst gewählten Privatkontext zulässig.

close/delete brauchen acknowledgeDestructive. Betroffene Hierarchien brauchen zusätzlich acknowledgeHierarchy; Aufgaben und aktuelle Kinder gehören zum Quellenfingerprint. Der F1-Epicabschluss mit offenen Kindern wird nicht vorweggenommen. sections legt nur nach eigener bewusster Aktion fehlende eindeutige Kanban-Abschnitte im zugeordneten verwalteten Projekt an, niemals im Eingang.

POST /api/tasks/resume mit operationId autorisiert dieselbe eigene fehlgeschlagene/teilweise/ungeklärte Operation neu. Backoff bleibt verbindlich. Kein erneuter Create/Comment/Close bei unbekannter Wirkung. Payload, Credentialgeneration, Integration-/Kontextrevision, Sitzung und Intent werden serverseitig verwaltet. Derselbe Key mit anderem Body ist ein Konflikt.

Journalstatus: queued/running → succeeded, failed, partial oder unknown. Persistente Checkpoints behalten Eingaben, vor dem Senden gespeicherte Request-IDs und nachgewiesene Effekte. Vor jedem Write zentrale Sitzungs-/Scopeprüfung und aktuelle Quelle. Nach Wiederanlauf zuerst nachlesen; eine verlorene Antwort ist kein Beweis für fehlende Wirkung. Feldwerte werden per GET geprüft; HTTP 200 genügt nicht. Teilerfolg bleibt sichtbar, die zentrale Problemübersicht unterscheidet geprüft von behoben.

Wiederholung: Move nach Abgeschlossen → Close der bestätigten Instanz → nachgewiesener späterer Due-Zeitpunkt → Move der aktiven Folgeinstanz nach Offen. Ein unbekannter Close wird niemals zur nächsten Instanz wiederholt.

E3-Integration: bestätigte Einträge/Reihenfolge/Historie bleiben bestehen. Aktuelle Ausführbarkeit wird separat aus Projektionen und Vorfahrenstatus abgeleitet. Laufende/ungeklärte Änderungen markieren betroffene Projektionen zunächst unknown; Wartet/Abgeschlossen oder verschobene/gelöschte Aufgaben sind keine Fokus-Empfehlungen. Kein automatisches Reorder oder neue Tagesauswahl.

## Wiederholung bewusst ändern

Bei bestehenden Wiederholungen verlangt ein geändertes oder geleertes Planungsdatum zusätzlich die ausdrückliche Bestätigung „Wiederholung entfernen“ (`acknowledgeRecurrenceChange`). Alternativ einen vollständigen englischen Todoist-Wiederholungstext eingeben und die Datumsfelder unverändert lassen. Regel und normales Datum dürfen nicht gemeinsam gesendet werden. Die aktuelle native Regel wird angezeigt. GET muss die neue Regel nachweisen; blosse `is_recurring=true` genügt nicht. Ein ISO-Startdatum in `every week starting 2026-11-01` wird zusätzlich gegen das zurückgelesene Datum geprüft. Anders kanonisierte natürliche Texte bleiben konservativ ungeklärt und sind direkt in Todoist zu prüfen, statt einen falschen Erfolg zu melden. E3-Quellhashes ignorieren die neu eingelesenen menschlichen Felder `string`/`lang`, erhalten aber alle bisherigen optionalen Feldformen.

E8 erweitert denselben Vertrag um action document mit AST-basierten Ziel-/Checklisten-/Linkänderungen und epicClosePolicy detach. [E8-Vertrag](epics-api.md), [F1-Entscheid](../architecture/epics-smart-goals.md).

Deadline-Erstellung, -Änderung und -Entfernung bleiben verbindlich. Definitive HTTP-403-Ablehnung wird als TODOIST_PERMISSION ohne gesicherte Tarifdiagnose und ohne Erfolgseffekt behandelt; Eingaben bleiben erhalten. Synthetische Erfolgs-/Ablehnungs-Fixtures, Free-Testkonto und weiterhin offene berechtigungspflichtige Live-Abnahme: [Todoist-Testhinweise](todoist.md#verbindliche-testhinweise). Keine produktiven Zugangsdaten oder Aufgaben in automatischen Tests.
