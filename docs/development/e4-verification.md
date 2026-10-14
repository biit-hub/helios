# E4 – Aufgabenverwaltung und Wartestatus: Prüfbericht

Stand: 15. Oktober 2026. Umsetzung auf `feat/e4-task-management` von aktuellem `develop` (2e1be65). E1/E2 abgenommen, E3 technisch integriert; **die manuelle E3-Abnahme bleibt bewusst verschoben und offen**. E4 darf unabhängig davon entwickelt werden. Dieser Bericht unterscheidet bestandene Prüfungen von noch laufenden Abschlussprüfungen. Noch kein E4-PR/Merge oder Entwicklungsupgrade behauptet.

## Verbindliche Grundlagen und Entscheidungen

E4-Auftrag, AGENTS, Implementierungsplan, technische Architektur, freigegebenes [Lastenheft](https://app.notion.com/p/3f77667a045981c0b688c82885b82ca1), [ADRs](https://app.notion.com/p/3f87667a04598161aae9f9f5550b59cf), [Entwicklungsrichtlinien](https://app.notion.com/p/3f97667a045981ff8a59eba6c4780050), E3-Prüfbericht und Todoist-Dokumentation ausgewertet. Insbesondere LH-010–016, LH-020–024, LH-064/065 sowie AT-07/08/10. Sites-Projekt erneut gelesen: bestätigte Version 2, Quellcommit f01316c03f04ae64db38dac8b8ccd654d045ef50. Der Live-Webabruf des geschützten Prototyps war nicht möglich; vorhandene V2-Referenz und E2/E3-Shell dienen als Gestaltungsgrundlage.

O-09 wurde ausdrücklich freigegeben: Wartedetails in `## Helios – Wartedetails` mit `Wartet auf`, `Gegenstand`, `Nachfassen am`. Ein Markdown-AST bestimmt genau den zu ersetzenden Quellbereich; fremde Inhalte bleiben bytegetreu erhalten. Mehrdeutige/fremd ergänzte Blöcke erzeugen einen Konflikt. Der Abschnitt Wartet bleibt führend, Nachfassen erzeugt nur einen Hinweis und keine Aufgabe.

Zusätzliche ausdrückliche Freigabe nach Live-Nachweis: Wiederholung zuerst nach Abgeschlossen verschieben und nativ abschliessen; nur bei eindeutig nachgewiesenem neuem Termin wird die aktive Folgeinstanz nach Offen zurückverschoben. Unbekannter Abschluss wird nicht erneut abgesendet.

Die lokale verschlüsselte Backupfreigabe bleibt bestehen; kein NAS erforderlich. Synology-Ziel und Zugang erst bei Produktivinstallation konfigurieren.

## Tatsächliche Live-Verträge

Die aktuelle [Todoist API v1](https://developer.todoist.com/api/v1/) samt eingebetteter OpenAPI wurde erneut geladen. Vor jedem Live-Lauf wurden die bereits freigegebene separate Kontoidentität und das eindeutig vorhandene aktive Nicht-Eingangsprojekt Helios Integration Tests erneut geprüft. Token nur serverseitig entschlüsselt. Keine Kontoidentität, realen IDs oder rohen Antworten im Repository.

Ausschliesslich eigene synthetische Aufgaben/Abschnitte angelegt. Nur diese Daten bereinigt. Wiederholungs-/Replayproben sind bewusste einzelne Vertragstests, kein Lasttest. Timeouts werden kontrolliert in Fixtures als verlorene Antwort modelliert, keine produktiven Aufgaben verwendet.

| Vertrag                                                             | Beobachtung                                                                                                                                                                              |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create mit identischem Body und X-Request-Id                        | Zweimal HTTP 200, tatsächlich zwei verschiedene Aufgaben. Keine externe Create-Idempotenz unterstellen.                                                                                  |
| Kommentar mit identischem Body und X-Request-Id                     | Zweimal HTTP 200, tatsächlich zwei Kommentare. Keine externe Comment-Idempotenz unterstellen.                                                                                            |
| Geplantes Datum entfernen                                           | due_string=no date: HTTP 200, due=null.                                                                                                                                                  |
| Planungsdatum mit Uhrzeit                                           | HTTP 200; due.date enthält den UTC-Zeitpunkt, timezone zusätzlich Europe/Zurich. Getrennt von deadline.                                                                                  |
| Deadline schreiben                                                  | Dieses Testkonto liefert HTTP 403. Kein erfolgreicher Live-Deadline-Schreibnachweis; Formular-/Fixturevertrag wird separat geprüft.                                                      |
| Dauer schreiben                                                     | HTTP 200, aber duration bleibt null. Ein HTTP-Erfolg ist kein Feldnachweis; ignorierte Werte dürfen keinen falschen Erfolg erzeugen.                                                     |
| Titel/Beschreibung/Priorität bearbeiten, Labels/Beschreibung leeren | HTTP 200; normale Updates funktionieren, bewusst leere Werte bleiben leer.                                                                                                               |
| Einzelne Unteraufgabe in Abschnitt verschieben                      | HTTP 200; Parent wird entfernt. Nur mit ausdrücklich angezeigter und bestätigter Hierarchiewirkung zulässig.                                                                             |
| Normale Aufgabe: Move, Close, erneuter Close                        | Move HTTP 200, Close HTTP 204, checked=true und Abschnitt erhalten. Erneuter Close ebenfalls HTTP 204.                                                                                   |
| Wiederholung: Close und derselbe Close-Key erneut                   | Je HTTP 204; Termin springt bei jedem Aufruf weiter. Dieselbe Aufgaben-ID, nächste Instanz aktiv, Abschnitt bleibt Abgeschlossen. Darum instanzbezogener Nachweis und kein Close-Replay. |
| Elternaufgabe löschen                                               | HTTP 204; angehängte synthetische Unteraufgabe anschliessend HTTP 404. Wirkung vor Freigabe anzeigen.                                                                                    |

## Implementierung und bisherige Tests

Migration 0006 erweitert die bestehenden plan_operations um kind/context_id/payload/result und erlaubt plan_id=null ausschliesslich für den neuen fachlichen Gebrauch. Dieselben Journal-/Schritttabellen, derselbe Worker und derselbe Advisory-Lock; keine zweite unabhängige Schreibpipeline. E3-Planoperationen behalten ihren Ablauf. Die neue Readiness prüft E4-Spalten.

47 Unit-/UI-/Vertragstests bestanden. Erste vollständige PostgreSQL-Suite: 91 bestanden. Anschliessend fünf zusätzliche Regressionen ergänzt; gezielte E4-Suite jetzt 26 bestanden. Darunter: Eingang ohne Projektwahl, Quellenkonflikte, Felder/Clearing, Kommentare, Wartedetails, native Moves, normale/wiederholende Abschlüsse, Delete, Session-/Origin-/Kontextschutz, Rate Limit, unbekannte Ergebnisse und Absturzmarker. E3/E4-Regressionen prüfen unveränderte Planhistorie bei nicht mehr ausführbarem Fokus, neue Kinder zwischen Move und Close sowie Sitzungswiderruf zwischen Schritten. Die endgültige vollständige Suite und Browser-/Docker-/CI-Abnahme stehen noch aus.

Bisher behoben: frische Browser-Testdatenbank musste vor Workerstart migriert werden; reine E2-Abrufpause durfte nicht als externes Todoist-Rate-Limit für Mutationen behandelt werden. Sicherheitsguards und echte Rate-Limit-Pausen bleiben erhalten.

## Grenzen

Kein verteilter Commit/CAS zwischen Todoist und PostgreSQL. Änderungen zwischen letzter Quellenprüfung und externer Mutation können nur eingegrenzt und nachgeprüft werden. Unbekannte Create-/Comment-Ergebnisse ohne zurückgespeicherte externe ID bleiben ungeklärt; kein blindes Neuanlegen bei Wiederaufnahme. Das vollständige Journal bewahrt bestätigte Eingaben und nachgewiesene Schritte.

Dieses Testkonto unterstützt Deadline und Dauer nicht wie ein vollständig berechtigtes Konto; diese Grenzen werden sichtbar statt Erfolg zu behaupten. Historische bestätigte Planquellen bleiben erhalten; aktuelle Projektionen sind keine zweite Aufgabenwahrheit. Die Aufgabenübersicht zeigt bekannte Projektionen, keinen behaupteten vollständigen Todoist-Abschlussarchivimport.

Der F1-Sonderabschluss eines Epics mit offenen Kindern bleibt E8 vorbehalten und wird in E4 nicht durch stillen nativen Kaskadenabschluss ersetzt. Inkonsistente fun-Einzeländerungen innerhalb bestehender Epics werden abgewiesen; keine automatische Labeländerung an Kindern. E5/E6, KI-Eingangsanalyse, Review, Reserve und Produktivbetrieb sind ausserhalb dieses Auftrags.
