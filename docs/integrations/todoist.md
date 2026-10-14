# Todoist – lesender Vertrag in E2

Geprüft am 14. Oktober 2026 anhand der [offiziellen Todoist API v1](https://developer.todoist.com/api/v1/) und ihrer eingebetteten OpenAPI-3.1-Spezifikation (info.version: 1). Nicht die abgelösten REST-v1/v2- oder Sync-v9-Pfade verwenden. Es wurde kein persönlicher/produktiver Token für die Entwicklung verwendet.

## Verifizierte API-Fakten

| Gegenstand          | Vertrag und Helios-Verwendung                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Basis / Auth        | https://api.todoist.com/api/v1/; Authorization: Bearer mit persönlichem API-Token, ausschliesslich serverseitig                                      |
| Projekte            | GET projects und GET projects/{id}; Liste aktiver zugänglicher Projekte; id ist ein undurchsichtiger String, niemals als Zahl casten                 |
| Pagination          | results und next_cursor (String oder null); cursor und limit=200 mit unveränderten Filtern für Folgeseiten                                           |
| Eingang             | inbox_project bei persönlichen Projekten; Workspaceprojekte besitzen workspace_id. Keine Erkennung über Namen, Zahlen oder feste IDs                 |
| Aufgaben            | GET tasks?project_id=... liefert aktive Aufgaben; GET tasks/{id} dient der erneuten Scopeprüfung vor Kommentarabrufen                                |
| Hierarchie / Status | parent_id und section_id nativ; checked und is_deleted explizit; Abschnittsnamen über GET sections?project_id=...                                    |
| Priorität           | API 1 normal bis 4 dringend; Oberfläche zeigt die üblichen P4 bis P1 entsprechend umgekehrt                                                          |
| Datum / Deadline    | due.date, optional due.datetime/timezone/is_recurring; deadline.date ist fachlich getrennt. Fehlende Werte bleiben leer; keine erfundene Deadline    |
| Kommentare          | GET comments?task_id=... paginiert; item_id bindet den Kommentar an die Aufgabe; content/posted_at werden gelesen, gelöschte Kommentare ausgefiltert |
| Fehler              | 401/403 Authfehler, 404 nicht zugänglich/fehlend, 429 Rate Limit, 5xx temporär; Retry-After und numerisches retry_after berücksichtigen              |

Die dokumentierten Zahlen zu Full-/Partial-Sync-Quoten werden nicht als Quote für GET-Ressourcen übernommen. Helios verwendet keinen Sync-Schreib- oder Tokenmigrationsendpunkt. Ein persönlicher Token kann bei Todoist weitergehende Rechte besitzen; Helios beschränkt den Adapter strukturell auf GET. Das ist eine Anwendungsgarantie, keine Behauptung über einen externen Read-only-Scope dieses Tokens.

## Lesende Synchronisation und Grenzen

Bewusster Verbindungstest lädt den vollständigen Projektkatalog. Erst nach letzter Seite wird der Katalog atomar übernommen; fehlende Projekte bleiben als nicht verfügbar nachvollziehbar. Ein aktiver Kontext darf nur ein geladenes, zugängliches Nicht-Eingangsprojekt zuordnen. Projektwechsel prüft zusätzlich den einzelnen Projektvertrag live und benötigt Step-up. Ein Projekt ist nicht mehrfach aktiv zuordenbar.

Aufgabenrefresh liest ausschliesslich das konfigurierte Projekt samt Abschnitten. Keine Suche über alle Aufgaben, kein Eingangimport, keine Analyse, keine Labels, kein Erstellen von Projekten/Abschnitten und keine sonstigen Schreiboperationen. Neue Daten werden erst nach vollständigem, validiertem Paging übernommen. Fehlt eine zuvor gelesene Aufgabe in der aktiven Liste, wird ihr Zustand unknown; dies beweist weder Abschluss noch Löschung. Eine externe Verschiebung in ein anderes verwaltetes Projekt kann beim nächsten dortigen Abruf neu zugeordnet werden. Historische Kontext- und Projektverweise werden nicht durch Cloudänderungen gelöscht.

Kommentarabrufe prüfen erst die aktuelle einzelne Aufgabe. Wurde sie extern verschoben, werden keine Kommentare des fremden Projekts gelesen. Beschreibungen/Checklisten und Kommentartext werden in E2 als Text angezeigt; keine HTML-Ausführung und keine Attachmentdownloads. Vollständige Editier-, Wiederholungs-, Move-/Close- und Abschlussverträge gehören in spätere Etappen.

Kein Hintergrundpolling und keine neue Queue. Manuelle Refreshes nutzen dieselbe Backendlogik, mit einer persistenten Abrufpause von mindestens 15 Sekunden, 60-Sekunden-Claim und überprüfter Claim-ID gegen verspätete Ergebnisse. Temporäre Fehler erlauben nach mindestens 30 Sekunden bewussten Retry, Rate-Limit-Angaben können länger sperren. HTTP-Aufrufe besitzen fünf Sekunden Timeout, Paging 45 Sekunden Budget je Ressource, 8 MiB je Antwort und eine Sicherheitsgrenze von 1000 Seiten. Grenzen führen zu einem erkennbaren Fehler; niemals wird eine Teilliste als vollständiger Stand gespeichert.

## Tatsächlicher Prüfstand

Offizielle Dokumentation und Quellverträge geprüft; synthetischer HTTP-Vertragsserver mit paginierten, offiziell strukturierten Antworten sowie echte PostgreSQL-/Browserabläufe getestet. Noch kein lesender Live-Vertragstest mit einem separaten Todoist-Testaccount ausgeführt: dafür lag kein freigegebener Testtoken vor. Keine Behauptung, dass ein produktiver Account abgeglichen wurde. Spätere Schreib-/Recurring-/Completed-/Webhooks-Verträge sind ausdrücklich nicht abgenommen. Siehe [E2-Prüfbericht](../development/e2-verification.md).
