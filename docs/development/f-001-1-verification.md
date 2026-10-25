# F-001.1 – Datenmodell und KI-Auftragsverwaltung

Ausgangspunkt ist `develop` nach erfolgreich abgeschlossenem und integriertem [E9.6 / PR29](https://github.com/biit-hub/helios/pull/29), Commit `3985e89f9f630a1bb5ebe24c49a5eda9516703d4`. Separater Branch `feat/f-001-1-ai-delegation-management`. Fachliche Grundlage: aktueller Gesamtauftrag und bestätigte Benutzerentscheidungen vom 25.10.2026 im [F-001-Konzept](https://app.notion.com/p/3fa7667a045981baba58f77db300d90b).

## Implementierung

Die [Architektur und HTTP-Verträge](../architecture/ai-jobs.md) beschreiben acht additive PostgreSQL-Tabellen, unveränderliche Originale und Historien, die neue globale KI-Auftragsansicht, Detailverlauf, spontane Aufträge, Einstellungen mit dynamischer privater Ollama-Modellerkennung und sichere native Unteraufgabenreferenzen. Referenzen verwenden ausschliesslich das E4-Journal. FIFO, einmalige FIFO-Priorisierung und Stoppen vor Claim sind revisionsgeschützt und persistent. Ein Datenbankindex verhindert mehrere aktive F-001-Claims.

Der Erfassungsdialog schützt ungespeicherte Eingaben und behält bei verlorenen Antworten die Erfassungs-ID. Statusfilter, Datumssortierung, begrenzte Auszüge und vollständige Details sind vorhanden. Bereits verknüpfte Referenzaufgaben können zum eigenen Auftrag aufgelöst werden und sind von weiterer Delegation und E6-Anreicherung ausgeschlossen. Vertraulicher Prompt und Verlauf gelangen nicht in den nativen Auftrag oder das E4-Payload.

## Prüfstand

- Lint, vollständige Workspace-Typprüfung und Build erfolgreich.
- Vollständige Unit-/UI-Regression: 304 Tests in 30 Dateien erfolgreich; davon 17 Modell-/Vertragstests und 16 neue UI-Tests.
- Neue PostgreSQL-Vertragstests: 18 erfolgreich, ausschliesslich isolierte `_test`-Datenbank und synthetische Todoist-Fixtures. Einschliesslich gleichzeitiger Doppelanfragen, Prioritäts-FIFO, revisionsgeschütztem Stop, maximal einem laufenden Claim, Ursprungsänderung vor/nach Schreiben, verlorenem Create-Ergebnis ohne blindes Replay, E6-Referenzsperre, unveränderlichem Original/Verlauf sowie tabellenübergreifender Fragen-/Versuchs-/Artefaktzuordnung.
- Vollständige PostgreSQL-Regression: 279 Tests in 15 Dateien erfolgreich. Gezielter neuer Browservertrag auf Desktop und Mobil erfolgreich (zwei Fälle); vollständiger Browserlauf bleibt mergepflichtig und wird mit dem endgültigen Ergebnis im PR nachgewiesen.
- Verschlüsselte isolierte Restore-Probe erfolgreich: 26 fachliche Tabellen, unveränderte E1–E9-Daten nach additiver Migration, Originalprompt, Modelle, Gespräch, Ergebnisversion, Dateiinhalt, Queue-Sequenz und ungeklärte E4-/F-001-Referenzen erhalten. SQL-Schutzregeln nach Restore erneut geprüft; kein Worker, kein externer Aufruf und keine Klartext-Dumpdatei.
- Secret-Prüfung erfolgreich; Produktionsabhängigkeiten ohne bekannte Schwachstellen. Exakte Image-/Layerscans und isolierter Compose-Smoke sind weitere mergepflichtige Gates; endgültige Nachweise im PR.
- CI, CodeQL und Sonar müssen für den endgültigen PR-Head erfolgreich sein; Integration erst nach allen Gates. Endgültige Head-/Merge-Nachweise werden zusätzlich im PR geführt.

Kein produktives Todoist-Konto, keine produktiven Aufgaben und keine echten Zugangsdaten in automatisierten Tests. Keine Modellinstallation, Cloud-KI, öffentliche Ollama-Freigabe oder externe KI-Aktion.

## Abgrenzung und offene Abnahme

F-001.1 führt noch keine KI-Aufträge aus; Queue und Ergebnisstruktur werden durch F-001.2 vervollständigt. Kein F-001.1-Status wird als erfolgreicher Inferenznachweis ausgegeben. Recherche benötigt später einen kontrollierten Suchzugang; fehlende Konfiguration darf keine angeblich recherchierten Fakten erzeugen. Dateien und Verlauf werden nicht der E6-30-Tage-Bereinigung unterstellt.

Die lokale Entwicklungsinstallation wird nach den integrierten Folgeänderungen mit frischen verschlüsselten Sicherungen, Schema-/Datenerhalt und Worker-/Ollama-/Browser-Smoke kontrolliert aktualisiert. Menschliche Funktionsabnahme bleibt offen; insbesondere Modellwahl, spontane/delegierte Aufträge, kompakte Darstellung, reale Quellen-/Modellgrenzen und später Fragen/Ergebnisse bewusst ausprobieren. Kein Release, kein Produktivdeployment, kein Main-Update und kein E10.

## Zusätzliche Prüfung vor Integration

Ein gezielter Review zeigte: Auch HTTP 5xx oder ein Sitzungsfehler nach persistenter Annahme kann ein unklarer Erfassungsabschluss sein. Fünf zunächst fehlgeschlagene Tests reproduzierten die Behandlung von HTTP 401, 403, 408, 500 und 503. Der Dialog hält nun auch dort Originaleingaben und Auftrags-ID fest; zuerst lesender Abgleich, ausschliesslich identisches erneutes Senden mit derselben ID. Nach der Korrektur bestehen alle 16 KI-UI-Tests. Fehlgeschlagene Reads und native Unknown-/Partial-Journale werden dadurch nicht erneut ausgeführt.

Die konkreten Sonar-Befunde werden ohne Unterdrückung bereinigt: kleinere Erfassungsbausteine, native Status-/Gruppenelemente, eindeutige Formularbeschriftungen und unveränderte Priorität der E4-Requesthash-Ableitung. Der laufende Status wird im SQL-Claimcheck und im globalen Unique-Index durch dasselbe unveränderliche SQL-Prädikat beschrieben. Die eindeutige Antwortbindung nutzt die bestehenden NULL-/Kind-Prüfungen ohne redundantes Indexprädikat. Die noch nicht integrierte additive Migration wird erneut auf einer frischen isolierten Datenbank geprüft. Endgültiger Null-Befund-, Browser-, Image- und Integrationsnachweis im PR.
