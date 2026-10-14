# E3 – Prüfbericht

Stand: 14. Oktober 2026. E3 ist **in Implementierung und Abnahme**. Branch: feat/e3-planning-focus, Ausgangspunkt aktuelles develop nach E2. Die Planungsimplementierung und additive Migration 0005 liegen vor. Persönliche Entwicklungsdaten wurden noch nicht migriert; PR-/CI-Integration stehen aus. Kein main-Merge, Release, Docker-Hub-Push, Produktivdeployment oder E4.

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

Plan-/Revisionsschema, deterministische Auswahl, Operationsjournal, Fokusansicht und Beobachtungen sind implementiert. Bisher tatsächlich bestanden: Lint/Typecheck, 42 Unit-/UI-/Vertragstests und 70 PostgreSQL-Integrationstests, Produktionsbuild, Secretprüfung und Produktionsaudit ohne bekannte Schwachstellen. Der gezielte E3-Browserablauf mit eigenem neuen Browserprozess und die vollständige Browsersuite sind bestanden: 7 bestanden, 3 bewusst übersprungene Wiederholungen im Mobilprojekt. E3 ist ein Desktoppilot; die mobile Morgenroutine folgt später. Beide Images wurden mit Trivy auf Secrets und behebbare HIGH/CRITICAL-Befunde geprüft: jeweils null Funde. Gitleaks prüfte 31 Commits ohne Leaks. CI steht noch aus. Rate Limits, Timeouts, unbekannte Ergebnisse und konkurrierende Planbestätigungen wurden nicht live provoziert. Diese Fälle sind mit kontrollierten Fakes und persistenter Wiederaufnahme geprüft; ein Timeout führt nicht zu blindem Replay.

Für echte lokale Pläne bleibt das Backupminimum aus O-10 relevant. Der bestehende verschlüsselte lokale E2-Sicherungsstand ersetzt keine bestätigte externe Backupablage.

Der bisherige Worker hatte nur das interne Docker-Netz und konnte Todoist nicht per DNS erreichen. Für die beaufsichtigten Vertragstests wurde er vorübergehend an das vorhandene ausgehende Webnetz angeschlossen. E3 verwendet stattdessen ein eigenes ausgehendes Worker-Netz ohne andere Dienste oder Hostports. Der temporäre Testanschluss ans Frontendnetz wurde zurückgenommen.

## Implementierung und zusätzliche Nachweise

- daily_plans, plan_history, plan_operations, plan_operation_steps und planning_observations; Unique Kontext/Tag, serverseitige Revisionen und DB-Trigger für unveränderliche bestätigte Quellen sowie append-only Historie. Eine leere Vorschau ist erlaubt, eine leere Bestätigung nicht.
- GET /api/plans und geschützte POST-Fassade für propose/confirm/focus/resume. Externe Writes ausschliesslich durch das dauerhafte Workerjournal; HTTP 202 ist keine vollständige Speicherung.
- Geprüft: drei unabhängige Kontexte, zwei lokale Tage, wenige Aufgaben, bewusste Teilmengen/Idempotenz, Fokus ohne Reorder, Historie, neue dringende Tasks ohne Umplanung, MFA/Origin/Scope, abgelaufene/widerrufene Ausführungsberechtigung, Teilerfolg/Backoff, unbekannte Wirkung, Reconciliation nach Absturz und konkurrierende Worker.
- Bereits nachgewiesene Wirkung bleibt auch nach Logout oder Token-/Kontextänderung erhalten; weitere Writes starten nicht. Hintergrundausführung erneuert keine Idleaktivität. Quellen mit Datums-/Dauerobjekten werden kanonisch verglichen: JSONB-Schlüsselreihenfolge führt nicht zu falschen Konflikten.
- Die erste Browserprüfung deckte einen unpassenden exakten Labelselektor im neuen Test auf; dieser wurde auf die tatsächliche Combobox-Rolle korrigiert. Kein Sicherheitsguard wurde für Tests abgeschaltet.
- Beide Linuximages wurden gebaut. Eigene synthetische Compose-Umgebung mit separatem Projekt, \_test-Datenbank und Loopbackport 3103: Migration, drei gesunde Dienste, pg-boss-Smokejob, Readiness E3 und anonymer Plan-GET HTTP 401 erfolgreich. Die persönliche Entwicklungsumgebung blieb dabei erhalten.

## Einschränkungen und verbleibende Abnahme

Keine native Exactly-once-Garantie oder gemeinsame Todoist-/PostgreSQL-Atomarität. Direkte Cloudänderungen zwischen Lesen und Schreiben können nur nachgeprüft werden. Ein grundlegend geänderter Quellenstand wird nicht durch Überschreiben einer teilweise extern wirksamen Revision repariert. Historie bleibt nachvollziehbar.

Die Hauptauswahl ist bewusst klein und deterministisch; keine KI-, Fortschritts- oder Abhängigkeitsinformationen werden erfunden. E4/E5/E8 und mobile Morgenroutine bleiben ausserhalb des Umfangs. E3 bietet keine zeitblockbasierte Planung und keine prozentuale Tagesfüllung.

Für echte lokale Pläne wurde ein NAS als externes verschlüsseltes Backupziel gewählt; der genaue Zielpfad ist noch angefragt. Bis zur Einrichtung und Prüfung der externen Sicherung gilt keine Freigabe zur Nutzung mit echten Tagesplänen. Synthetische Tests und die separate Compose-Abnahme sind davon unabhängig.

Die synthetische Fokusaufnahme wurde visuell geprüft: Kontext-Pills, aktive Kontextfarbe, klare Fokusaufgabe, Heute im Blick und getrennte Bestätigungsstände. Die Hierarchieausnahme wird im Einzeljournal ausdrücklich angezeigt.

Zusätzlicher Absturzfall: Auch ein bereits als unknown persistierter Einzelschritt darf nach einem Workerabsturz vor dem Abschluss der Journaltransaktion nicht automatisch erneut mutiert werden. Wiederanlauf liest zuerst nach; nur ausdrückliche Wiederaufnahme erlaubt nach erneuter Quellenprüfung einen noch nötigen Move. Beide Marker sending/unknown sind durch PostgreSQL-Tests abgedeckt.
