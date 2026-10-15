# E8 – Prüfbericht

Stand: 15. Oktober 2026. Branch feat/e8-epics-smart-goals von develop 77e2ce2. E1/E2 abgenommen; manuelle E3–E8-Abnahme bleibt ausdrücklich offen. E9, main, Releases, Docker-Hub-Push und Produktion nicht freigegeben.

## Grundlagen

E8-Auftrag, AGENTS/README, Architektur/Implementierungsplan, E4-/E6-/E7-Berichte und vorhandene Aufgaben-/Todoist-/KI-/Markdown-Verträge gelesen. Lastenheft, ADRs und Entwicklungsrichtlinien frisch aus Notion abgerufen. Sites weiterhin Version 2, Quellcommit f01316c03f04ae64db38dac8b8ccd654d045ef50. Bestehende warme Shell, Kontextfarben und Karten fortgeführt. Relevant: LH-006/030–037/040–046, AT-04, F1, LH-062/063 im E8-Umfang; keine vorgezogene E10-Lern-/Rankingpipeline.

Der Auftraggeber bestätigte nach Live-Nachweis ausdrücklich **Trennen oder Abbrechen**. [Architekturentscheid](../architecture/epics-smart-goals.md), [API](../integrations/epics-api.md), [Bedienung/manuelle E3–E8-Abnahme](../runbooks/epics-smart-goals.md).

## Reale isolierte Todoist-Verträge

Vor jedem Lauf Kontoidentität und eindeutig vorhandenes aktives Nicht-Eingangsprojekt gegen die bereits freigegebenen Testangaben geprüft. Token nur serverseitig entschlüsselt. Nur eigene synthetische Aufgaben/Kommentare angelegt und vollständig bereinigt. Keine privaten IDs, Kontodaten oder Rohantworten im Repository.

| Probe                                                       | Tatsächliche Beobachtung                                                                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Parent mit offenem Kind und Enkel nativ schliessen          | HTTP 204; alle drei checked=true, Hierarchie erhalten.                                                                                  |
| Kind des abgeschlossenen Parents wieder öffnen              | HTTP 204; Kind und Parent offen, Enkel weiterhin abgeschlossen. Offenes Kind unter geschlossenem Epic ist damit nicht sicher abbildbar. |
| Parent öffnen                                               | HTTP 204; keine Annahme, dass alle Enkel wieder offen werden.                                                                           |
| Kind im selben Projekt auf Projektebene verschieben         | HTTP 200; Kind parent_id=null, Enkel bleibt am Kind. IDs, Beschreibung und Kommentar unverändert nachgelesen.                           |
| Nach ausdrücklichem Öffnen von Kind/Enkel Parent schliessen | Parent geschlossen, getrenntes Kind und Enkel bleiben offen.                                                                            |
| Bereinigung                                                 | Alle ausschliesslich selbst erzeugten synthetischen Aufgaben entfernt.                                                                  |

Verlorene Antworten/Unknowns kontrolliert in Fixtures geprüft, statt Netzwerkfehler auf echten Kontodaten zu erzwingen. Keine Exactly-once-Zusage aus X-Request-Id. E4-Replay-/Wiederholungsgrenzen bleiben verbindlich.

## Implementierung

Native Epic-Übersicht/-Hierarchie; Ziel, vollständige Checklistenbearbeitung und sichere Links; SMART-Fragen/-Entwürfe, semantische Zerlegung, abgeleitetes Verständnis und vorrangige Korrekturen. Derselbe Worker, dieselben E6-Entwürfe und dasselbe E4-Journal. Migration 0010 ergänzt nur epic_correction/correction_revision in ai_task_signals, weiterhin 31 Tabellen. Kein kanonisches Epic-/Ziel-/Checklistenmodell in PostgreSQL.

## Bisher ausgeführte Prüfungen

- 109 Unit-/Vertragstests bestanden. Darunter AST-Erhalt/CRLF, mehrdeutige Abschnitte, Checklisten-CRUD, gefährliche Links und aus realen Modellfehlern abgeleitete SMART-Regressionen.
- Vollständige PostgreSQL-Regression: 202 Fälle im ersten Gesamtlauf bestanden; anschliessend 24 E8-Fälle auf frisch migrierter separater Datenbank bestanden. Native Mehrstufigkeit, Abschlussnachweise/Unknown, Quellenkonflikte, Einzelpatch-Journal, Korrekturen, Scope/Origin und F1-Stop bei Konflikt/unbekannter Trennung/neuen Kindern geprüft.
- Produktionsbuild und Typprüfung bestanden; Editor in Controller/Felder/Links/Vorschau/Hierarchie/Anreicherung aufgeteilt.
- Verschlüsselte isolierte E7-zu-E8-Upgrade-/Restore-Probe bestanden: elf Migrationen, 13 Tabellen verglichen, bestehende Plan-/Reserve-/Historien-/Unknown-/KI-/Routinewerte und Epic-Korrekturrevision erhalten. Geschützte Historien-/Routinequellen nach Restore unveränderlich. Keine gestarteten Worker, externen Calls oder Klartextdumpdateien.
- Weitere abschliessende Browser-, Container-, Sicherheits- und CI-Ergebnisse werden vor Merge ergänzt.

## Tatsächliche lokale KI

Windows erreicht den vorhandenen konfigurierten Ubuntu-Ollama-Server im privaten LAN. Nur synthetische Modellfälle, keine Cloud/Downloads/Windows-Installation/öffentliche Portfreigabe.

Reale frühe Fehler: Zitatpräfixe statt wortgetreuer Belege; implizit unterstellte Akzeptanz/Ressourcen/Terminierung; unabhängiges Ergebnis als Checkliste. Prompt/Gegenbeispiele und eigenständige semantische Guards nachgeschärft. Insbesondere ist fehlender Termindruck kein bekannter Termin. Formale Schemagültigkeit wurde nicht als ausreichende Qualität gewertet.

Neun abschliessende Fälle mit tatsächlichem Prompt-/Struktur-/Validierungsvertrag bestanden: vollständiges SMART-Ziel, fehlender Termin, unklares Ziel, ausdrückliche Terminkorrektur, kleiner Checklistenpunkt, unabhängig planbares Arbeitspaket, Epic-Zielbeiträge Prompt-Injection sowie ein konkreter bearbeitbarer Zielvorschlag ohne erfundenen Termin. Maximal zwei bestehende E6-Versuche; der Fall ohne Termin benötigt einen gezielten Korrekturversuch. Modellbewertungen bleiben menschlich zu prüfen, insbesondere semantische Machbarkeit und sinnvolle Zerlegung.

## Grenzen

Kein gemeinsamer atomarer Commit zwischen Todoist und PostgreSQL. Quellenrennen werden vor/nach Writes eingegrenzt; erkannte Teilwirkung bleibt im Journal sichtbar. Bekannte Projektionen sind kein vollständiges Todoist-Abschlussarchiv. Nicht verfügbare Aufgaben bleiben unknown. Hierarchie-/Promptgrössen begrenzt, kein stilles Abschneiden. Mehrdeutige Referenzlinks verlangen bewusstes Prüfen. Keine Dokumentenverwaltung, automatischer Linkabruf, TermiHub-, Lern-, PWA- oder Pushimplementierung. Lokales verschlüsseltes Backup genügt; Synology-Ziel erst bei Produktivinstallation konfigurieren.

## Zusätzliche Browserbefunde

Beim realen Browserablauf wurde der Reload nach externem Erfolg bis zur vollständigen Quellenübernahme gesperrt, damit nachfolgende Eingaben nicht überschrieben werden. Ausserdem enthielt die Checklisten-Leseantwort interne AST-Positionen; der strikte Änderungsvertrag wies diese korrekt zurück. Die API projiziert jetzt ausschliesslich text/checked, der Browser tut dies defensiv ebenfalls. Ein PostgreSQL-Lesen-/Vorschau-/Bestätigungs-Roundtrip sichert die Grenze. Keine Validierung wurde gelockert.

Die visuelle Prüfung des synthetischen Epic-Editors führte zu eigenen konsistenten Feld-/Textarea-Stilen statt ungestalteter Browser-Standardfelder. Der E8-Browserablauf mit Ziel/Checkliste/Link, Reload und sicherem Trennen/Abschluss besteht; die vollständige Browserregression läuft bis zur Schlussprüfung weiter.

Die finale E8-Risikosuite umfasst 24 bestandene PostgreSQL-Fälle. Ein zusätzlicher Test belegt, dass eine zu umfangreiche KI-Quelle die manuelle Ziel-/Checklistenansicht nicht blockiert. Historische Gesamtläufe wurden während der Erweiterung nicht als finaler Commitnachweis gewertet; CI prüft den unveränderten finalen Stand vollständig.

## Finaler lokaler Prüfstand

Code-Stand 355a27e: 109 Unit-/Vertragstests und vollständige PostgreSQL-Regression mit 208 bestandenen Fällen, davon 24 E8. Vollständige Browserregression: 12 bestanden, acht bewusst dem späteren mobilen Umfang vorbehalten. Lint, Typprüfung, Produktionsbuild, Produktions-Audit und Secretprüfung bestanden; keine Schemadrift. Gitleaks prüfte vorgemerkte Änderungen sowie vollständige Git-Historie ohne Funde.

Web-/Worker-Linuximages des oben genannten Stands aus demselben eingefrorenen Code gebaut. Trivy jeweils null Secrets und null behebbare HIGH-/CRITICAL-Befunde. Isolierter Compose-Smoke mit elf Migrationen, drei gesunden Diensten, persistenter Queueprobe und E8-Readiness bestanden. Kein Imagepush und keine Produktion geändert. Die verschlüsselte isolierte Restore-Probe über 13 Tabellen bleibt erfolgreich.

Die endgültigen GitHub-/CodeQL-/Sonar-Prüfungen werden auf dem exakten PR-Head verlangt. Der Mergeguard prüft zusätzlich beide CI-Ereignisse push/pull_request, Sonar-Gate, strikten Branchschutz und unverändertes main.

## Reviewnacharbeit

[PR #19](https://github.com/biit-hub/helios/pull/19) nach develop. CodeQL und Sonar-Gate des ersten Reviewstands bestanden. Zusätzlich gemeldete neue Komplexität wurde in Prompttabellen, kleinen Reader-/Markdownfunktionen und zentralen Writer-Vorprüfungen reduziert; keine Qualitätsregel wurde abgeschaltet. Prompt und JSON-Schema bleiben für alle sieben Arten bytegleich zum bereits real geprüften Modellvertrag. Neue UI-Listen verwenden stabile Quellschlüssel beziehungsweise rein lokale Checkbox-IDs; diese werden vor jedem API-Aufruf entfernt. Zugängliche Statusausgaben und eindeutige Labels wurden ergänzt.

Eine patchlose E8-Einschätzung kann ausdrücklich abgelehnt werden, bleibt revisionsgeschützt erhalten und fällt unter dieselbe 30-Tage-Bereinigung wie andere abgelehnte Entwürfe. Eine ältere KI-Einschätzung darf dadurch nicht wieder erscheinen. Der zusätzliche Fall erweitert die E8-PostgreSQL-Suite auf 25 bestandene Fälle; CI führt die gesamte Regression des finalen Heads aus.

Hinweise auf await in Schleifen wurden fachlich geprüft: native Teilbaum-Mutationen bleiben zwingend sequenziell, weil jeder Trennnachweis Voraussetzung des nächsten Effekts ist. Auch begrenzte Todoist-Quellen-/Kommentarabfragen vermeiden bewusst unkontrollierte Requestbursts. Der bedingte mobile Browser-Skip ist mit E11 begründet, keine ausgelassene Desktop-Abnahme.

Das Workerimage dieses Stands erreicht den konfigurierten privaten Ollama-Endpunkt und das installierte Modell. Eine echte strukturierte synthetische SMART-Inferenz aus dem Container mit nachgeschalteter semantischer Prüfung bestand im ersten Versuch. Anonyme Epic-/Work-/Protected-HTTP-Zugriffe der isolierten E8-Compose-Umgebung lieferten jeweils 401.

## Abschliessender Nachweis nach Review

Der geprüfte Fachcode 60c64d0 besteht im vollständigen GitHub-Lauf sowohl für push als auch pull_request: 109 Unit-/Vertragstests, 209 PostgreSQL-Tests (davon 25 E8), zwölf Browsertests und acht dokumentierte spätere mobile Fälle. Lint, Typprüfung, Produktionsbuild, Schemadrift, Secretprüfung und Produktions-Audit bestanden. CodeQL, beide Dockerprüfungen und Sonar-Gate sind grün. Keine neuen CRITICAL-/MAJOR-Sonarbefunde; neun MINOR-Hinweise wurden fachlich geprüft (insbesondere bewusst sequenzielle native Nachweise statt paralleler Writes). Keine Regelunterdrückung.

Web- und Worker-Linuximages wurden mit diesem Fachcode neu gebaut. Beide finalen Trivy-Prüfungen: null Secrets und null behebbare HIGH-/CRITICAL-Befunde. Der isolierte Compose-Nachweis besteht mit elf Migrationen, drei gesunden Diensten, Queueprobe, E8-Readiness und 401 für anonyme Fachzugriffe. Die echte synthetische SMART-Inferenz aus dem finalen Worker über den konfigurierten privaten Ollama-Endpunkt bestand im ersten Versuch. Windows hatte zuvor neun reale synthetische Modellfälle bestanden; keine Cloud, Downloads oder öffentliche Freigabe.

Die verschlüsselte isolierte Upgrade-/Restore-Probe wurde nach der Infrastrukturwiederherstellung erneut erfolgreich ausgeführt: elf Migrationen, 13 Tabellen, unveränderte historische Referenzen und weiterhin wirksame Schutztrigger. Während eines lokalen Speicherengpasses wurden keine Datenvolumes gelöscht. Nach einem kontrollierten Docker-Neustart waren alle 15 verglichenen geschützten Entwicklungstabellen unverändert; die vom Auftraggeber anschliessend ausgeführte Build-Cache-Bereinigung stellte ausreichend Platz für die finalen Builds bereit. Ein Windows-Neustart war danach nicht erforderlich.

Die vorhandene lokale Entwicklungsinstallation wurde nach neuer authentifizierter verschlüsselter Datenbank- und Konfigurationssicherung auf diese Images aktualisiert. Vor und nach Migration 0010 wurden Identität, verschlüsselte Integration, Kontexte, vollständige Pläne, Historien, Operationen, KI-Entwürfe/-Signale und sämtliche Routine-/Reviewtabellen verglichen: unverändert, abgesehen von den ausdrücklich additiven E8-Standardfeldern. Anschliessend Queueprobe und E8-Readiness bestanden. Keine Produktion geändert. Der letzte Abschlusscommit verändert ausschliesslich diesen Prüfbericht; der getestete Fachcode bleibt unverändert. Der geschützte PR-Merge verlangt erneut alle Prüfungen des exakten Abschlusscommits.

Keine fachliche E8-Entscheidung ist mehr offen. Die gemeinsame manuelle E3–E8-Abnahme bleibt ausdrücklich ausstehend; [Anleitung](../runbooks/epics-smart-goals.md#gemeinsame-spätere-manuelle-e3e8-abnahme). E9, main-Merge, Release, DockerHub-Push und Produktivdeployment bleiben ausserhalb des Auftrags.
