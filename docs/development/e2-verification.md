# E2 – Prüfbericht

Stand: 14. Oktober 2026. Featurebranch feat/e2-contexts-todoist von aktuellem develop nach E1.2. Kein stabiles Release, main-Merge, Docker-Hub-Push oder Produktivdeployment. E3 wird nicht begonnen.

## Quellen und Abdeckung

Aktuelle Notion-Seiten Lastenheft, ADRs und Entwicklungsrichtlinien gelesen; E2-Plan, technische Architektur, E1.2-Prüfbericht sowie Sicherheits-/Betriebsrunbooks abgeglichen. Referenzen LH-002/003/004/005/057/081/090/093/094/096 und ADR-004 sind durch Context-, Integration-, Task-Read- und Problems-Modul abgedeckt. Die sechs tatsächlichen Farbschemata des bestätigten Sites-V2-Prototyps wurden über den Eigentümer-Lesezugang geprüft. Der normale öffentliche Leser sah wegen der privaten Freigabe nur den Login; die Referenz wurde nicht veröffentlicht oder verändert.

| Anforderung             | Umsetzung / Nachweis                                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dynamische Kontexte     | Genau ein Privat, frei benannte Arbeitgeber, Themes, optionale TermiHub-Referenzen, Deaktivierung ohne Löschung; DB-Constraints und Persistenztests  |
| Bewusste Projektwahl    | Vollständiger API-Katalog mit opaken IDs, keine Namensheuristik; aktive Unique-Zuordnung, Step-up, Live-Projektprüfung und Revision                  |
| Sichere Verbindung      | Separater INTEGRATION_KEY, Better-Auth-/Noble-XChaCha20-Poly1305, kein Klartext-/Ciphertext-Export, Tokenwechsel/-entfernung mit Step-up             |
| Lesesicht               | GET-only API v1, Projektfilter, aktive Taskprojektionen, native Parents, getrennte due/deadline, Abschnitte/Prioritäten, bewusst gelesene Kommentare |
| Datenverantwortung      | Vollständige Pagesätze erst atomar übernehmen; fehlend/extern verschoben bleibt unknown. Kein erfundener Abschluss, kein zweiter Taskmaster          |
| Eingang / Fremdprojekte | Nur im Projektkatalog sichtbar, keine Eingangszuordnung/Taskanalyse, keine KI-/Label-/Cloudwritejobs                                                 |
| Status / Probleme       | Begrenzte Abrufe, dauerhafte Wartezeit, reduzierte Fehlercodes, stabile Probleme mit Wiederholungszähler; checked getrennt von resolved              |
| E1.2 erhalten           | Gemeinsamer transaktionsgebundener Auth-/MFA-/Frist-/Origin-/Step-up-Guard; erneute Scope-/Revisionsprüfung nach externem Abruf                      |

## Tatsächliche Prüfungen

| Prüfung                   | Ergebnis                                                                                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint / Typecheck          | Bestanden für Implementierung und Tests                                                                                                                                                                                                      |
| Unit-/UI-/Vertragstests   | 30 bestanden, darunter 13 neue Todoist-/Kontextkonfigurationsfälle                                                                                                                                                                           |
| PostgreSQL-Integration    | 41 bestanden: 18 bestehende Auth-/Queuefälle, 22 E2-Fälle, 1 E1.2-Upgradeprobe                                                                                                                                                               |
| Produktionsbuild          | Next-Standalone und Worker-Typecheck bestanden                                                                                                                                                                                               |
| E2-Browserzieltest        | Vollständiges E2-Szenario auf produktivem Standalone-Server bestanden, einschliesslich separatem mobilem Browserkontext                                                                                                                      |
| Vollständige Browsersuite | 6 bestanden, 2 bewusst übersprungene Wiederholungen im Mobileprojekt; beide vollständigen Szenarien prüfen eigene mobile Kontexte                                                                                                            |
| Visuelle Prüfung          | Synthetische Aufgaben-/Einstellungsaufnahmen geprüft; sechs Themes, horizontale Navigation und hervorgehobene Kontext-Pills sichtbar                                                                                                         |
| Drizzle                   | Additive Migrationen 0003/0004; neue DB und echtes E1.2-Schema samt provisioniertem Testkonto geprüft                                                                                                                                        |
| Abhängigkeiten            | pnpm peers check ohne Konflikte; pnpm audit --prod ohne bekannte Schwachstellen; keine neue Laufzeitdependency                                                                                                                               |
| Docker / Scans / CI       | Web-/Worker-Linuxbuild und Compose/Queue/Readiness bestanden; beide Trivy-Scans ohne behebbare HIGH/CRITICAL-Befunde. Secret-/Historienprüfung ohne Funde; PR-CI, CodeQL und Sonar-Quality-Gate erfolgreich am Implementierungsstand 1bc8dea |

Alle automatisierten Datenbank-/Browserdaten sind synthetisch und isoliert. Datenbanken mit \_test-Suffix; PostgreSQL-Testcontainer besitzt tmpfs. Die Upgradeprobe erzeugt und entfernt ausschliesslich ihre eigene neue Testdatenbank. Der zusätzlich verwendete lokale Todoist-HTTP-Server bindet nur Loopback, verlangt Testkonfiguration und ist kein Bestandteil des produktiven HTTP-Routers. Die Tests prüfen null externe Schreibaufrufe; Fixture-Steueroperationen werden nicht als Todoist-Endpunkte behandelt.

## Vertiefte Sicherheits- und Datenprüfungen

- Generische Guardverweigerung ohne Sitzung/vollständige MFA, fremde Kontext-ID, falscher Origin, Sessionwiderruf und fehlender Step-up. Die E1.2-Frist-/Replay-/Recoverytests laufen unverändert weiter.
- Parallel initialisierter Privatkontext bleibt eindeutig; beliebige Arbeitgeber bleiben nach neuer Serviceinstanz erhalten. Parallele Änderungen erkennen Revisionen und aktive Projektunique; Deaktivierung erhält lokale Daten und verhindert neue Taskabrufe.
- Verschlüsselte Tokenwerte unterscheiden sich vom Klartext; zufällige Nonces erzeugen bei erneuter Speicherung anderen Ciphertext. Snapshot/Fehlerantworten enthalten weder Token noch Ciphertext. Neuer Credentialstand macht alte Kontocaches unsichtbar.
- Erfolgreiche und fehlerhafte paginierte Projekte/Tasks; spätere fehlerhafte Seite überschreibt keinen vollständigen Cache. Timeout, Netzwerk, abgelaufener/ungültiger Token, Rate Limit und unerwartete Antwort werden getrennt erfasst.
- Aufgaben halten native Parent-IDs und echtes Planungsdatum/Deadline getrennt. Fehlende Aufgabe nach externer Verschiebung oder Task-404 ist unknown; ein Task-404 entwertet nicht das ganze Projekt. Kommentare werden vor Abruf frisch auf ihren Kontext geprüft.
- Laufender Abruf darf nach Tokenentfernung, Kontextdeaktivierung oder Logout nicht mehr speichern. Ein älterer abgelaufener Read-Claim überschreibt auch nach Abschluss eines neueren Abrufs keine Daten. Keine externen Requests während des Auth-DB-Locks.
- Geprüft-Markierung bleibt offen; nur ein erfolgreicher passender Abruf löst das Problem. Wiederkehrender Fehler verwendet dieselbe ID und wird mit erhöhtem Zähler wieder geöffnet. Veraltete Caches werden sichtbar erfasst.
- Reale Browserbedienung: Bootstrap/MFA, Sicherheitsbestätigung, Token speichern, Projektkatalog, Privat benennen/färben, drei freie Arbeitgeber, Projektzuordnung, Reload, Aufgaben/Deadline/Parent/Kommentare, leerer Kontext, Verbindungsfehler und geprüfter Problemstatus, mobile Pills ohne Desktopnavigation.

## Behobene Probleme

1. DOMException aus einem anderen JavaScript-Realm ist nicht verlässlich instanceof Error. Der Reader klassifiziert Timeout-/Abortnamen jetzt robust, ohne Rohfehlertexte zu übernehmen.
2. Ein Integrationstest nahm eine unbelegte PostgreSQL-Zeilenreihenfolge an. Er prüft nun die fachliche Task-ID statt einer zufälligen Arrayposition; Inhalte werden nicht verändert, um Tests passend zu machen.
3. Der erste E2-Browserlauf fand das verschachtelte Select über getByLabel mit exakt normalisiertem Label nicht zuverlässig. Der korrigierte Test bedient die tatsächlich zugängliche Combobox-Rolle. Das vollständige Szenario bestand danach; keine Sicherheitsregel oder Abrufpause wurde deaktiviert.
4. Bei mehreren aufeinanderfolgenden Ressourcenabrufen kann ein alter Claim ablaufen. Eine zusätzliche zufällige Claim-ID und erneute Prüfung verhindern Übernahme eines überholten Ergebnisses.
5. Einzelne Task-404-Antworten werden von echten Projektfehlern getrennt, damit ein verschwundener Task keine gültige gesamte Projektzuordnung entwertet.
6. Fehlender/falscher Integrationsschlüssel wird als lokales Konfigurationsproblem behandelt, nicht irreführend als falscher Todoist-Token. Die Anwendung bietet keinen Klartext-Fallback.

## Einschränkungen und bewusste Grenzen

Noch kein lesender Live-Vertragstest mit einem separaten Todoist-Testaccount: kein freigegebener Testtoken lag vor. Die offizielle aktuelle Dokumentation/OpenAPI wurde geprüft; Pagination, Datenformen, Fehler und fehlende Writes sind mit HTTP-Vertragsfixtures und realer PostgreSQL-/Browserintegration nachgewiesen. Es wurden keine produktiven Kontoinhalte als Testmaterial benutzt. Die manuelle Verbindung durch den Betreiber ist in der [Anleitung](../runbooks/todoist-setup.md) beschrieben.

TermiHub bleibt lokale Konfigurationsvorbereitung ohne Netzwerkvertrag bis E9. E2 verwendet bewussten Refresh, kein Hintergrundpolling/Webhook; grosse/langsame Bestände können die dokumentierten Grenzen erreichen und liefern dann einen sichtbaren Fehler statt einer als vollständig behaupteten Teilliste. Taskdetails rendern Text, keine interaktiven Markdown-Edits oder Attachmentdownloads. Completed-/Move-/Write-/Recurring-Verträge bleiben späteren Etappen vorbehalten.

Mobile ist Chromium mit iPhone-Profil, kein physisches iPhone-/Safari- oder PWA-/Pushnachweis. Öffentlicher HTTPS-/NPM-Betrieb braucht weiterhin die separate Sicherheitsabnahme aus E1.2. Vor dem lokalen additiven Upgrade wurden vorhandene Datenbank und private Konfiguration verschlüsselt gesichert; der Dump wurde authentifiziert entschlüsselt im Speicher auf Lesbarkeit geprüft, ohne persönliche Datensätze in eine Testumgebung zu übernehmen oder auszugeben. Externe Backups/Retention/Recoveryaufbewahrung bleiben Betreiberaufgabe.

Ein generischer Gitleaks-Befund betraf ausschliesslich den nie veröffentlichten Integrationsschlüssel-Platzhalter in .env.example. Dieser wurde durch einen Generierungshinweis ersetzt; keine Scan-Ausnahme oder Regelabschwächung. Das lokale Upgrade ist erfolgreich, das bestehende Konto samt eindeutigem Privatkontext erhalten.

Die erste zusätzliche SonarCloud-Prüfung meldete drei beabsichtigte Formular-Submitbuttons ohne expliziten type als Reliability-Befunde. Die Typen wurden ergänzt und Transport, Dispatch, Fehlerabbildung sowie Taskdarstellung in kleine Funktionen aufgeteilt. Projektbezogene HTTP-403-Antworten werden zusätzlich von global ungültigen Credentials unterschieden; entsprechende Unit-/PostgreSQL-Regressionstests ergänzt. Auch Fehlerantworten unterliegen jetzt dem begrenzten JSON-Reader. Keine Gate-/Securityregel wurde abgeschwächt und keine bereits angewandte Migration für einen stilistischen Scannerbefund umgeschrieben.

## Konkrete CI-Nachweise

[PR #11](https://github.com/biit-hub/helios/pull/11) integriert nach develop. Am Implementierungsstand 1bc8deababcd086bf527a33006d56c0dd198b760 sind [CI 38620017276](https://github.com/biit-hub/helios/actions/runs/38620017276) und [CodeQL 38620017135](https://github.com/biit-hub/helios/actions/runs/38620017135) erfolgreich. checks, docker, analyze, CodeQL und das zusätzliche SonarCloud-Quality-Gate bestanden; keine neuen CodeQL-Alerts und null Sonar-Security-Hotspots. Die Linux-CI wiederholt Lint, Typecheck, 30 Unit-/41 PostgreSQL-Fälle, Produktionsbuild, 6 Browserfälle mit 2 erklärten Doppel-Skips, Audit/Gitleaks und Compose-/Imagesmoke. Der abschliessende reine Dokumentationscommit unterliegt denselben geschützten Checks vor Integration.

Die finalen lokalen Web-/Worker-Images wurden zusätzlich mit Trivy vuln,secret geprüft: keine eingebetteten Secretfunde und keine behebbaren HIGH/CRITICAL-Schwachstellen. Aktueller Composebetrieb und Queueprobe sind gesund; unautorisierter Zugriff auf /api/work liefert 401. Das Altprojekt und main blieben unverändert; der temporäre Datenbanktestbestand wird ausschliesslich im eigenen Test-Compose entfernt.

### Nicht blockierende Qualitäts-/Werkzeughinweise

SonarCloud meldet noch 47 offene CODE_SMELL-Wartbarkeitshinweise, keine offenen BUG-Befunde. Darunter sind verschachtelte UI-Ausdrücke, sequentielle SQL-await-Schleifen und ein auf generierte PostgreSQL-Migrationen angewandter PL/SQL-Duplikatliteralhinweis. SQL-Schritte auf demselben Transaktionsclient bleiben bewusst geordnet; eine bereits angewandte Migration wird für einen solchen Stilhinweis nicht umgeschrieben. Kein Befund wurde akzeptiert/ausgeblendet und keine Gatebedingung verändert.

Die automatische Sonar-Analyse importiert derzeit keinen LCOV-Bericht und zeigt deshalb keine belastbare prozentuale Testabdeckung. Die oben dokumentierten tatsächlichen Testausführungen sind davon getrennt nachgewiesen; eine Coverage-Prozentzahl wird nicht behauptet. Bestehende Warnungen zu älteren GitHub-Action-Hauptversionen, ESLint 9 und esbuild-kit bleiben Wartungsthemen aus E1.2, keine Scan-Ausnahmen. Die CI-Pins und Supply-Chain-Altersgrenzen wurden nicht abgeschwächt.
