# Todoist – lesender Vertrag in E2

Geprüft am 14. Oktober 2026 anhand der [offiziellen Todoist API v1](https://developer.todoist.com/api/v1/) und ihrer eingebetteten OpenAPI-3.1-Spezifikation (info.version: 1). Nicht die abgelösten REST-v1/v2- oder Sync-v9-Pfade verwenden. Es wurde kein persönlicher/produktiver Token für die Entwicklung verwendet.

## Verifizierte API-Fakten

| Gegenstand          | Vertrag und Helios-Verwendung                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Basis / Auth        | https://api.todoist.com/api/v1/; Authorization: Bearer mit persönlichem API-Token, ausschliesslich serverseitig                                                                                              |
| Projekte            | GET projects und GET projects/{id}; Liste aktiver zugänglicher Projekte; id ist ein undurchsichtiger String, niemals als Zahl casten                                                                         |
| Pagination          | results und next_cursor (String oder null); cursor und limit=200 mit unveränderten Filtern für Folgeseiten                                                                                                   |
| Eingang             | inbox_project bei persönlichen Projekten; Workspaceprojekte besitzen workspace_id. Keine Erkennung über Namen, Zahlen oder feste IDs                                                                         |
| Aufgaben            | GET tasks?project_id=... liefert aktive Aufgaben; GET tasks/{id} dient der erneuten Scopeprüfung vor Kommentarabrufen                                                                                        |
| Hierarchie / Status | parent_id und section_id nativ; checked und is_deleted explizit; Abschnittsnamen über GET sections?project_id=...                                                                                            |
| Priorität           | API 1 normal bis 4 dringend; Oberfläche zeigt die üblichen P4 bis P1 entsprechend umgekehrt                                                                                                                  |
| Datum / Deadline    | due.date, optional due.datetime/timezone/is_recurring; deadline.date ist fachlich getrennt. Fehlende Werte bleiben leer; keine erfundene Deadline                                                            |
| Kommentare          | GET comments?task_id=... paginiert; item_id bindet den Kommentar an die Aufgabe; content/posted_at werden gelesen, gelöschte Kommentare ausgefiltert                                                         |
| Fehler              | 401 Authfehler; 403/404 je nach Ressourcenbindung fehlender Projekt-/Taskzugriff, sonst globaler Auth-/Vertragsfehler, 429 Rate Limit, 5xx temporär; Retry-After und numerisches retry_after berücksichtigen |

Die dokumentierten Zahlen zu Full-/Partial-Sync-Quoten werden nicht als Quote für GET-Ressourcen übernommen. Helios verwendet keinen Sync-Schreib- oder Tokenmigrationsendpunkt. Ein persönlicher Token kann bei Todoist weitergehende Rechte besitzen; Helios beschränkt den Adapter strukturell auf GET. Das ist eine Anwendungsgarantie, keine Behauptung über einen externen Read-only-Scope dieses Tokens.

## Lesende Synchronisation und Grenzen

Bewusster Verbindungstest lädt den vollständigen Projektkatalog. Erst nach letzter Seite wird der Katalog atomar übernommen; fehlende Projekte bleiben als nicht verfügbar nachvollziehbar. Ein aktiver Kontext darf nur ein geladenes, zugängliches Nicht-Eingangsprojekt zuordnen. Projektwechsel prüft zusätzlich den einzelnen Projektvertrag live und benötigt Step-up. Ein Projekt ist nicht mehrfach aktiv zuordenbar.

Aufgabenrefresh liest ausschliesslich das konfigurierte Projekt samt Abschnitten. Keine Suche über alle Aufgaben, kein Eingangimport, keine Analyse, keine Labels, kein Erstellen von Projekten/Abschnitten und keine sonstigen Schreiboperationen. Neue Daten werden erst nach vollständigem, validiertem Paging übernommen. Fehlt eine zuvor gelesene Aufgabe in der aktiven Liste, wird ihr Zustand unknown; dies beweist weder Abschluss noch Löschung. Eine externe Verschiebung in ein anderes verwaltetes Projekt kann beim nächsten dortigen Abruf neu zugeordnet werden. Historische Kontext- und Projektverweise werden nicht durch Cloudänderungen gelöscht.

Kommentarabrufe prüfen erst die aktuelle einzelne Aufgabe. Wurde sie extern verschoben, werden keine Kommentare des fremden Projekts gelesen. Beschreibungen/Checklisten und Kommentartext werden in E2 als Text angezeigt; keine HTML-Ausführung und keine Attachmentdownloads. Vollständige Editier-, Wiederholungs-, Move-/Close- und Abschlussverträge gehören in spätere Etappen.

Kein Hintergrundpolling und keine neue Queue. Manuelle Refreshes nutzen dieselbe Backendlogik, mit einer persistenten Abrufpause von mindestens 15 Sekunden, 60-Sekunden-Claim und überprüfter Claim-ID gegen verspätete Ergebnisse. Temporäre Fehler erlauben nach mindestens 30 Sekunden bewussten Retry, Rate-Limit-Angaben können länger sperren. HTTP-Aufrufe besitzen fünf Sekunden Timeout, Paging 45 Sekunden Budget je Ressource, 8 MiB je Antwort und eine Sicherheitsgrenze von 1000 Seiten. Grenzen führen zu einem erkennbaren Fehler; niemals wird eine Teilliste als vollständiger Stand gespeichert.

## Tatsächlicher Prüfstand

Offizielle Dokumentation und Quellverträge geprüft; synthetischer HTTP-Vertragsserver mit paginierten, offiziell strukturierten Antworten sowie echte PostgreSQL-/Browserabläufe getestet. Noch kein lesender Live-Vertragstest mit einem separaten Todoist-Testaccount ausgeführt: dafür lag kein freigegebener Testtoken vor. Keine Behauptung, dass ein produktiver Account abgeglichen wurde. Spätere Schreib-/Recurring-/Completed-/Webhooks-Verträge sind ausdrücklich nicht abgenommen. Siehe [E2-Prüfbericht](../development/e2-verification.md).

## Deadline-Schreibfunktionen und Kontoberechtigungen

Präzisierung des Auftraggebers vom 15. Oktober 2026: Das separate Todoist-Testkonto verwendet den Free-Plan; das produktive Konto besitzt einen kostenpflichtigen Plan mit Deadline-Unterstützung. Das ist die mitgeteilte Kontokonfiguration, keine automatische Tarifermittlung durch Helios.

Deadline-Erstellung, -Änderung und -Entfernung bleiben verbindliche Helios-Funktionen. Deadline und geplantes Datum bleiben getrennt. Die in E4 beobachtete HTTP-403-Antwort beim Deadline-Schreiben ist sehr wahrscheinlich durch die fehlende Tarifberechtigung des Free-Testkontos erklärbar. Der HTTP-Status allein beweist diese Ursache jedoch nicht; andere fehlende Berechtigungen oder Zugriffsbeschränkungen bleiben möglich.

Helios zeigt eine verständliche, neutrale Berechtigungsablehnung und erhält die Eingaben. Keine sichere Tarifdiagnose allein aus HTTP 403, kein behaupteter Schreiberfolg und kein automatischer Tarifwechsel oder Fallback auf das geplante Datum. Bestehende Nachlese-/Journalregeln bleiben verbindlich: Auch HTTP 200 genügt ohne passenden zurückgelesenen Feldwert nicht als Erfolgsnachweis.

### Verbindliche Testhinweise

- Automatisierte Tests verwenden ausschliesslich synthetische API-Fixtures und isolierte Testdatenbanken. Erfolgreiche Deadline-Erstellung, -Änderung und -Entfernung sowie abgewiesene Operationen werden unabhängig von den Berechtigungen des Live-Testkontos modelliert. Ein ausgelassenes Deadline-Feld bleibt unverändert; null entfernt die Deadline, ohne das geplante Datum zu verändern.
- Berechtigungs-Fixtures liefern HTTP 403 und prüfen verständlichen Fehlerstatus, erhaltene Originaleingaben und ausbleibenden Erfolgsnachweis. HTTP 403 darf keine gesicherte Free-/Pro-Tarifklassifikation auslösen. Ignorierte Felder oder nicht passende Nachlesewerte dürfen ebenfalls keinen Erfolg vortäuschen.
- Bewusst freigegebene Live-Schreibtests im separaten Free-Testkonto dürfen erwartungsgemäss an fehlender Tarifberechtigung scheitern. Konto-/Testbedingung und tatsächliche HTTP-Antwort getrennt dokumentieren; das ist kein erfolgreicher Deadline-Schreibnachweis.
- Produktive Todoist-Zugangsdaten und produktive Aufgaben dürfen niemals für automatische Tests verwendet werden. Insbesondere gibt es keinen automatischen Ausweichpfad auf das bezahlte Produktivkonto.

**Offene Integrationsprüfung:** Eine erfolgreiche Live-Abnahme der berechtigungspflichtigen Deadline-Erstellung, -Änderung und -Entfernung liegt weiterhin nicht vor. Synthetische Erfolgstests ersetzen sie nicht. Ein künftiger Live-Nachweis benötigt eine gesondert freigegebene isolierte Testumgebung mit den erforderlichen Berechtigungen; die Angabe zum Produktivkonto erteilt keine Testfreigabe. Keine Architekturänderung erforderlich.

Vorhandene Fixture-Nachweise und der historische Live-Befund: [E4-Prüfbericht](../development/e4-verification.md#deadline-testhinweise-präzisierung-vom-15-oktober-2026). Bedienung bei Ablehnung: [Aufgaben-Runbook](../runbooks/tasks.md).

## E8 – F1-Vertrag

Der isolierte Live-Nachweis bestätigt native Parent-Kaskade und das Wiederöffnen des Parents beim Öffnen eines Kindes. Der Auftraggeber hat deshalb ausschliesslich Trennen oder Abbrechen bestätigt. IDs/Kommentare/mehrstufige Teilbäume bleiben beim Trennen im selben Projekt erhalten; erst vollständiger Nachweis erlaubt Epic-Close. [Architekturentscheid](../architecture/epics-smart-goals.md), [Prüfbericht](../development/e8-verification.md).

## E9.2 – Labelauswahl

Zusätzliche verifizierte GET-Ressourcen: labels (Objekte mit id/name) und labels/shared (Namen), jeweils results/next_cursor. Vollständiges Paging vor Rückgabe, kein Teilkatalog bei Fehler. Persönliche und geteilte Namen werden dedupliziert. Neue öffentliche Label-Schreibendpunkte gibt es nicht. [Aktueller offizieller API-Vertrag](https://developer.todoist.com/api/v1/).

## E9.4 – Dauerberechtigung und bestätigte Teilwerte

Der isolierte Live-Vertrag vom 24.10.2026 prüfte vor Writes das freigegebene separate Testkonto und genau ein vorgesehenes Testprojekt. Ausschliesslich neu erzeugte synthetische Aufgaben wurden verwendet und ihre Bereinigung nachgewiesen. Datum, Winter-/Sommeruhrzeit, Datum ohne Uhrzeit, Entfernung und bewusste Wiederholungsänderung wurden nativ nachgelesen. Das Free-Konto lieferte für Dauer allein und kombiniert HTTP 200, behielt aber Dauer null. Die Datumswerte wurden bei kombinierten Anfragen gespeichert. Dieser Feldunterschied erklärt die bisherige ungeklärte Gesamtrückmeldung; es war kein nachgewiesener Deadline-Fehler. Die alten Unknown-Operationen bleiben unverändert.

Todoist nennt Aufgabendauern als [Pro-/Business-Funktion](https://www.todoist.com/help/todoist/features/set-a-task-duration-L1kYkZv8d). Das erklärt die beobachtete Einschränkung des ausdrücklich als Free bekannten Kontos. Helios leitet aus einem allgemeinen HTTP- oder Nachweisfehler dennoch keine sichere Tarifdiagnose ab. Dauer bleibt eine native Funktion; kein lokaler Ersatzwert und kein Ausweichen auf das Produktivkonto. Positive Dauer-Erstellung/-Änderung/-Entfernung, abgewiesene Operationen und fehlende Nachweise werden automatisiert synthetisch geprüft. Ein positiver berechtigungspflichtiger Live-Dauernachweis bleibt als Integrationsabnahme offen, ebenso die Deadline-Liveabnahme. [Offizieller Schreibvertrag](https://developer.todoist.com/api/v1/).
