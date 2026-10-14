# E3 – Prüfbericht

Stand: 14. Oktober 2026. E3 ist **implementiert, automatisiert geprüft und nach develop integriert**. Die Benutzerfreigabe vom 14. Oktober 2026 erlaubt für E3 lokale verschlüsselte Backups mit isolierten Restore-Proben; eine NAS-Anbindung ist keine E3-Voraussetzung. Branch: feat/e3-planning-focus, Ausgangspunkt aktuelles develop nach E2. Die Planungsimplementierung und additive Migration 0005 liegen vor. Die lokale Entwicklungsumgebung wurde nach neuer verschlüsselter Sicherung additiv migriert. [PR #13](https://github.com/biit-hub/helios/pull/13) wurde nach erfolgreichen Pflichtchecks nach develop gemergt (398f2b990e55105cdf63a239a6f26f40cda46a44). Kein main-Merge, Release, Docker-Hub-Push, Produktivdeployment oder E4.

## Quellen

E3-Auftrag, AGENTS.md, Implementierungsplan, technische Architektur und offene Entscheidungen sowie die aktuellen Notion-Quellen Lastenheft, ADRs und Entwicklungsrichtlinien gelesen. Fachlich relevant: LH-002/003/005/021/024/061–067/070–073 und F4/F5. Der jüngere E3-Auftrag erlaubt die zuvor in E2 ausgeschlossenen bestätigten Todoist-Schreiboperationen. Der E2-Leseadapter soll weiterhin GET-only bleiben.

## Separates Testkonto und Testscope

Der bereits in Helios verschlüsselt gespeicherte Token wurde ausschliesslich im Serverprozess entschlüsselt. Die Identität aus GET user wurde mit der vom Benutzer angegebenen Testkonto-Identität abgeglichen. Der vollständige Projektkatalog enthielt genau ein aktives Nicht-Eingangsprojekt namens „Helios Integration Tests“. Dessen opake Projekt-ID wurde über GET projects/{id} erneut verifiziert. Erst danach erfolgten die ausdrücklich beauftragten Schreibtests. Kontoidentität, Token, reale Projekt-/Aufgaben-IDs und rohe API-Antworten werden hier und im Repository nicht veröffentlicht.

Zwei Live-Testläufe legten ausschliesslich neue, eindeutig synthetisch bezeichnete Aufgaben und einen eigenen Quellabschnitt im verifizierten Testprojekt an. Ein fehlender Zielabschnitt „In Arbeit“ wurde nur in diesem Testprojekt angelegt und als eigener Testdatensatz registriert. Bereinigt wurden nur die selbst erzeugten IDs. Beide Läufe meldeten vollständige Bereinigung. Bestehende Aufgaben und Abschnitte wurden nicht umgebaut.

## Tatsächlich verifizierte API-v1-Verträge

Grundlage: am Prüftag erneut geladene [offizielle Todoist API v1](https://developer.todoist.com/api/v1/) plus die beschriebenen Live-Accounttests. Ergebnisse sind Beobachtungen dieser Testläufe, keine unbelegte Garantie über alle Wiederholungs- oder Fehlersituationen.

| Vertrag                                                    | Tatsächliches Ergebnis                                                                                                                                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET user / paginierte projects / project-ID / sections     | Testkonto, eindeutiger Projektname und ID sowie projektbezogene Abschnitte erfolgreich geprüft.                                                                                                      |
| POST tasks/{id}/move mit section_id                        | HTTP 200; gewünschter Abschnitt erreicht, Aufgabe bleibt aktiv.                                                                                                                                      |
| Bereits richtig eingeordnete Aufgabe erneut verschieben    | HTTP 200; aktive Aufgabe bleibt im Zielabschnitt.                                                                                                                                                    |
| Identischer Move mit derselben X-Request-Id                | HTTP 200; beobachteter Endzustand unverändert. Dies beweist keine allgemeine Exactly-once-Garantie.                                                                                                  |
| Nicht existierender Abschnitt                              | HTTP 400; Eltern-/Abschnittsbezug blieb unverändert.                                                                                                                                                 |
| Unteraufgabe einzeln in anderen Abschnitt verschieben      | HTTP 200; **parent_id wird entfernt**. Die Aufgabe wird zur Hauptaufgabe.                                                                                                                            |
| section_id und bisherige parent_id zusammen senden         | HTTP 400; die Elternbeziehung blieb erhalten, der Abschnitt wechselte nicht.                                                                                                                         |
| Oberaufgabe mit noch angehängter Unteraufgabe verschieben  | HTTP 200; Kind bleibt angehängt und erhält ebenfalls den Zielabschnitt.                                                                                                                              |
| Nativer Abschluss / Wiederöffnung (nur synthetische Daten) | Je HTTP 204; abgeschlossene Aufgabe per GET mit checked=true lesbar. Ein Oberaufgabenabschluss schloss auch das angehängte Kind. Nur Vertragsbeobachtung für spätere Etappen, keine E4-/E8-Funktion. |
| Eigene Testaufgabe löschen / danach lesen                  | Bereinigung erfolgreich; GET danach HTTP 404.                                                                                                                                                        |

## Fachliche Entscheidung vor Fortsetzung

Die Kombination aus „jede ausgewählte Aufgabe nach In Arbeit“ und unveränderter nativer Elternbeziehung ist bei einzeln ausgewählten Unteraufgaben über den geprüften Move-Vertrag nicht erfüllbar. Das Verschieben der Oberaufgabe wäre ebenfalls kein stiller Ersatz: Dabei wechseln auch nicht ausgewählte Kinder den Abschnitt. Das Backend darf weder die Hierarchie still auflösen noch zusätzliche Cloudaufgaben ungefragt umsortieren.

Dem Benutzer wurden deshalb zwei mögliche E3-Policies vorgelegt:

1. Unteraufgaben bleiben planbar; ihr Todoist-Abschnitt folgt weiter der Oberaufgabe. Die bestätigte Tagesauswahl wird als Helios-Plan gespeichert, ohne einen abweichenden externen Kanbanstatus zu erfinden. Abschnittsmutationen sind nur dort zulässig, wo keine unbestätigten Unteraufgaben mitverändert werden. Diese Ausnahme zu LH-021 benötigt ausdrückliche fachliche Freigabe.
2. Unteraufgaben werden vorläufig nicht automatisch in E3 eingeplant. Auch Hauptaufgaben mit nicht ausgewählten Kindern benötigen einen konservativen Ausschluss oder eine gesonderte bewusste Freigabe für den gesamten betroffenen Bestand.

Der Benutzer hat Option 1 ausdrücklich bestätigt. Die Implementierung erhält Unteraufgabenhierarchien und verschiebt auch keine Container mit aktiven Kindern ungefragt. Die Ausnahme wird vor der Planbestätigung und im Einzeljournal erklärt.

## Weitere offene Prüfungen

Plan-/Revisionsschema, deterministische Auswahl, Operationsjournal, Fokusansicht und Beobachtungen sind implementiert. Bisher tatsächlich bestanden: Lint/Typecheck, 42 Unit-/UI-/Vertragstests und 70 PostgreSQL-Integrationstests, Produktionsbuild, Secretprüfung und Produktionsaudit ohne bekannte Schwachstellen. Der gezielte E3-Browserablauf mit eigenem neuen Browserprozess und die vollständige Browsersuite sind bestanden: 7 bestanden, 3 bewusst übersprungene Wiederholungen im Mobilprojekt. E3 ist ein Desktoppilot; die mobile Morgenroutine folgt später. Beide Images wurden mit Trivy auf Secrets und behebbare HIGH/CRITICAL-Befunde geprüft: jeweils null Funde. Gitleaks prüfte zuletzt 35 Commits ohne Leaks. Linux-CI, Docker, CodeQL und Sonar sind am Implementierungsstand 9da7dda erfolgreich; siehe die nachstehenden Nachweise. Rate Limits, Timeouts, unbekannte Ergebnisse und konkurrierende Planbestätigungen wurden nicht live provoziert. Diese Fälle sind mit kontrollierten Fakes und persistenter Wiederaufnahme geprüft; ein Timeout führt nicht zu blindem Replay.

O-10 wurde für E3 durch die ausdrückliche Benutzerfreigabe präzisiert: lokale verschlüsselte Sicherungen und isolierte Restore-Proben genügen. Die Produktionsanforderung an getrennten Speicher bleibt für die spätere Installation bestehen.

Der bisherige Worker hatte nur das interne Docker-Netz und konnte Todoist nicht per DNS erreichen. Für die beaufsichtigten Vertragstests wurde er vorübergehend an das vorhandene ausgehende Webnetz angeschlossen. E3 verwendet stattdessen ein eigenes ausgehendes Worker-Netz ohne andere Dienste oder Hostports. Der temporäre Testanschluss ans Frontendnetz wurde zurückgenommen.

## Implementierung und zusätzliche Nachweise

- daily_plans, plan_history, plan_operations, plan_operation_steps und planning_observations; Unique Kontext/Tag, serverseitige Revisionen und DB-Trigger für unveränderliche bestätigte Quellen sowie append-only Historie. Eine leere Vorschau ist erlaubt, eine leere Bestätigung nicht.
- GET /api/plans und geschützte POST-Fassade für propose/confirm/focus/resume. Externe Writes ausschliesslich durch das dauerhafte Workerjournal; HTTP 202 ist keine vollständige Speicherung.
- Geprüft: drei unabhängige Kontexte, zwei lokale Tage, wenige Aufgaben, bewusste Teilmengen/Idempotenz, Fokus ohne Reorder, Historie, neue dringende Tasks ohne Umplanung, MFA/Origin/Scope, abgelaufene/widerrufene Ausführungsberechtigung, Teilerfolg/Backoff, unbekannte Wirkung, Reconciliation nach Absturz und konkurrierende Worker.
- Bereits nachgewiesene Wirkung bleibt auch nach Logout oder Token-/Kontextänderung erhalten; weitere Writes starten nicht. Hintergrundausführung erneuert keine Idleaktivität. Quellen mit Datums-/Dauerobjekten werden kanonisch verglichen: JSONB-Schlüsselreihenfolge führt nicht zu falschen Konflikten.
- Die erste Browserprüfung deckte einen unpassenden exakten Labelselektor im neuen Test auf; dieser wurde auf die tatsächliche Combobox-Rolle korrigiert. Kein Sicherheitsguard wurde für Tests abgeschaltet.
- Beide Linuximages wurden gebaut. Eigene synthetische Compose-Umgebung mit separatem Projekt, \_test-Datenbank und Loopbackport 3103: Migration, drei gesunde Dienste, pg-boss-Smokejob, Readiness E3 und anonymer Plan-GET HTTP 401 erfolgreich. Die persönliche Entwicklungsumgebung blieb während der synthetischen Abnahme erhalten. Danach wurde sie gesichert und additiv auf E3 aktualisiert: bestehendes Konto und beide Kontexte erhalten, null echte Tagespläne oder Operationen angelegt; Web/Worker/PostgreSQL gesund, Readiness E3 und Worker-Smoke erfolgreich.

## Einschränkungen und verbleibende Abnahme

Keine native Exactly-once-Garantie oder gemeinsame Todoist-/PostgreSQL-Atomarität. Direkte Cloudänderungen zwischen Lesen und Schreiben können nur nachgeprüft werden. Ein grundlegend geänderter Quellenstand wird nicht durch Überschreiben einer teilweise extern wirksamen Revision repariert. Historie bleibt nachvollziehbar.

Die Hauptauswahl ist bewusst klein und deterministisch; keine KI-, Fortschritts- oder Abhängigkeitsinformationen werden erfunden. E4/E5/E8 und mobile Morgenroutine bleiben ausserhalb des Umfangs. E3 bietet keine zeitblockbasierte Planung und keine prozentuale Tagesfüllung.

Die NAS-Pfadfrage ist für E3 zurückgestellt und blockiert die Entwicklung nicht. Für die spätere Produktion sind automatische verschlüsselte Sicherungen auf Synology im logischen Ordner `Backups/Helios` vorgesehen. Vollständiger Zielpfad und Zugang werden erst bei der Produktivinstallation konfiguriert; keine Zugangsdaten werden vorausgesetzt.

Die synthetische Fokusaufnahme wurde visuell geprüft: Kontext-Pills, aktive Kontextfarbe, klare Fokusaufgabe, Heute im Blick und getrennte Bestätigungsstände. Die Hierarchieausnahme wird im Einzeljournal ausdrücklich angezeigt.

Zusätzlicher Absturzfall: Auch ein bereits als unknown persistierter Einzelschritt darf nach einem Workerabsturz vor dem Abschluss der Journaltransaktion nicht automatisch erneut mutiert werden. Wiederanlauf liest zuerst nach; nur ausdrückliche Wiederaufnahme erlaubt nach erneuter Quellenprüfung einen noch nötigen Move. Beide Marker sending/unknown sind durch PostgreSQL-Tests abgedeckt.

## CI- und Qualitätsnachweis

Implementierungsstand 9da7dda845ce8dc13d393a09eb0ffd1851257921: [PR-CI mit Tests und Docker](https://github.com/biit-hub/helios/actions/runs/38636593492), [CodeQL](https://github.com/biit-hub/helios/actions/runs/38636593993). Die Linux-Logs bestätigen dieselben 42 Unit-/UI-, 70 PostgreSQL- und 7 Browsererfolge bei 3 absichtlich ausgelassenen Mobilwiederholungen. Auch Secretprüfung, Produktionsaudit, Gitleaks, Linuximages, Trivy und Compose-Smoke bestehen. Der zusätzliche Push-Lauf ist ebenfalls erfolgreich.

Sonar Quality Gate bestanden: 0 neue Bugs, 0 neue Vulnerabilities, 0 neue Security Hotspots; neue Duplikation 2,46 Prozent. 22 nicht blockierende Wartbarkeitshinweise im PR bleiben sichtbar. Der anfängliche kritische Sortierhinweis wurde durch einen ausdrücklichen Vergleich behoben; duplizierte HTTP-Adapter und Browser-Setupabläufe wurden durch gemeinsame Bausteine ersetzt. Keine Qualitäts- oder Sicherheitsregel wurde dafür abgeschwächt. Die vollständige lokale Browsersuite bestand auch nach diesem Refactoring erneut.

Die final aktivierten lokalen Web-/Workerimages wurden nochmals separat gescannt: jeweils 0 Secret-Funde und 0 behebbare HIGH/CRITICAL-Funde. Die synthetischen PostgreSQL-/Compose-Testumgebungen und deren selbst erzeugte Daten sind nach der Abnahme entfernt; die persönliche Entwicklungsumgebung bleibt bestehen.

Die abschliessende Dokumentationsrevision von PR #13 bestand ebenfalls sämtliche Pflichtchecks vor dem Merge. Diese nachfolgende Präzisierung der Backupvorgabe ändert keine Runtimefunktion. Kein main-Merge, Release, Docker-Hub-Push, Produktivdeployment oder E4.

## Lokale verschlüsselte Restore-Probe nach Backupfreigabe

Am 14. Oktober 2026 ausschliesslich im separaten tmpfs-Testprojekt durchgeführt: zwei neue leere \_test-Datenbanken, alle sechs SQL-Migrationen bis einschliesslich 0005 und synthetische Auth-/Kontext-/E3-Daten. Der Customformat-Dump wurde mit age verschlüsselt lokal abgelegt, authentifiziert ausschliesslich im Speicher entschlüsselt und mit pg_restore in die neue Zieldatenbank eingespielt. Es wurden keine unverschlüsselten Dumpdateien geschrieben und keine persönlichen Sicherungsdaten in die Testumgebung übernommen.

Sieben Tabellen wurden vollständig vor/nach Restore verglichen: auth_user, contexts sowie alle fünf E3-Tabellen. Planreihenfolge, Fokus, Revision/Historie, Beobachtung, partielles Journal und unknown-Schritt samt stabiler Request-ID blieben identisch. Anschliessende verbotene Änderungen an Historie und nicht mehr im Entwurf befindlichen Planquellen wurden von den restaurierten DB-Triggern zurückgewiesen; der Datenvergleich blieb identisch. Kein Worker, keine Wiederaufnahme alter Operationen, keine externen Aufrufe. Die eigene flüchtige Testinstanz wurde danach entfernt; verschlüsseltes Testarchiv und getrennt verwahrte Testidentität bleiben privat.

Dies weist die lokale E3-Datenwiederherstellung nach. Es ist kein Nachweis einer NAS-Automation, einer produktiven vollständigen Auth-Recovery oder zugesicherter RPO/RTO.
