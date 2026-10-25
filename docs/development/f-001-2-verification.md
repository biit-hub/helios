# F-001.2 – KI-Verarbeitung und Ergebnisworkflow

Ausgangspunkt: erfolgreich integriertes [F-001.1 / PR30](https://github.com/biit-hub/helios/pull/30), `develop`-Commit `5c93737705ff1a49efe4aa0404d20edfa8b47417`. Separater Branch `feat/f-001-2-ai-processing`. E9.6 / PR29 und F-001.1 werden nicht erneut implementiert. Verbindliche Anforderungen: Gesamtauftrag und bestätigte Benutzerentscheidungen vom 25.10.2026 im [F-001-Konzept](https://app.notion.com/p/3fa7667a045981baba58f77db300d90b).

## Implementierter Umfang

Lokaler Ollama-Worker mit PostgreSQL-führendem Claim und exklusivem pg-boss-Wecksignal, serieller Prioritäts-/FIFO-Verarbeitung, Wiederanlaufsperre und bewusster Fehlerwiederaufnahme. Text, kontrollierte Recherche und genau eines der fünf Datei-Ausgabeformate. Persistente Rückfragen mit automatischer Wiedereinreihung, Nachbearbeitung derselben ID, unveränderliche Ergebnisversionen, lokale geschützte Downloads und bewusste Aggregatlöschung.

Bewusster lokaler Abschluss und getrennt nachgewiesener Abschluss ausschliesslich der referenzierten Todoist-Unteraufgabe über das bestehende E4-Journal. Kein automatischer Abschluss beim Erstellen eines Ergebnisses. Globale KI-Probleme, geschützte Eingaben, lesender Abgleich verlorener Rückmeldungen und keine aktive Benachrichtigung.

Die [Architektur und Grenzen](../architecture/ai-jobs.md) dokumentieren Hintergrundautorisierung, Speicher-/Zeitlimits, Recherchezugriffe, Renderer, HTTP-Verträge und Löschung. Migration 0016 ergänzt ausschliesslich Schutztrigger für F-001-Ausführungsnachweise und Artefaktformate; bestehende E1–E9-Schemata und frühere Migrationen werden nicht umgeschrieben.

## Prüfstand und verpflichtende Abschlussgates

Die endgültigen Ergebnisse werden vor Integration für denselben Quellstand im PR nachgewiesen. Bis alle Gates bestanden sind, ist diese Etappe nicht technisch abgeschlossen.

- Vollständige lokale Unit-/UI-Regression: 340 Tests in 32 Dateien bestanden. Vollständige PostgreSQL-Regression: 297 Tests in 16 Dateien bestanden. Lint, Workspace-Typprüfung, Build, Secretprüfung und Produktionsabhängigkeitsprüfung erfolgreich.
- Bereits gezielt geprüft: 16 synthetische PostgreSQL-Verträge für Verarbeitung, Serialisierung, Fragezyklen, Sitzungsablauf, Revisionen, Wiederaufnahme, Ergebnisse/Dateien, nativen Abschluss, Unknown-Abgleich, Elternkonflikte und Löschschutz bestanden.
- Gezielte Unit-/UI-Prüfung: 31 Datei-/Recherche-/Modellverträge und 16 bisherige KI-UI-Verträge bestanden; fünf neue Workflow-UI-Fälle bestanden.
- Verschlüsselte isolierte Restore-Probe mit 17 SQL-Migrationen und 26 fachlichen Tabellen erfolgreich: alte E1–E9-/F-001.1-Daten, zwei Ergebnis-/Dateiversionen, Frage/Antwort, Prioritätssequenz und ungeklärter nativer Close erhalten. Restaurierte Single-Running-/Single-Answer- und Historienguards erneut geprüft; kein Worker, kein externer Aufruf und keine Klartext-Dumpdatei.
- Erste exakte Image-/Layerscans ohne behebbare HIGH/CRITICAL- oder Secretbefunde; alle fünf Renderer samt Fontintegrität im tatsächlichen Worker-Image ohne Netzwerk erfolgreich. Die abschliessenden Images und der Compose-Smoke werden nach der letzten HTTP-Guard-Korrektur erneut geprüft und im PR nachgewiesen. Finale CI-/Sonar-Gates bleiben vor Integration erforderlich.
- Gezielte Browserverträge für bisherige Verwaltung und neue Rückfrage/Antwort, verlorene Rückmeldung, automatische Fortsetzung, zwei Ergebnisversionen, bewussten Abschluss, echten Word-Download und globale Probleme auf Desktop und Mobil erfolgreich: vier Fälle ohne Fehler. Vollständige Browserregression: 31 bestanden, 13 bestehende bewusste Skips, keine Fehler. Danach vier betroffene Desktop-/Mobilfälle mit dem abschliessenden Download-Guard erneut bestanden.

Alle automatisierten Todoist-Verträge verwenden isolierte `_test`-Datenbanken und synthetische Quellen. Keine produktiven Aufgaben, Zugangsdaten oder Prompts. Reale Ollama-Prüfungen dürfen ausschliesslich Metadaten oder ausdrücklich synthetische Inferenz verwenden, ohne Modellinstallation oder Downloads. Verschlüsselte Restore-Prüfungen starten keinen Worker und führen keine externen Aktionen aus.

## Offene Integrations- und menschliche Abnahme

SearXNG ist als bevorzugter selbst gehosteter Suchdienst bestätigt und wird ausschliesslich über `SEARXNG_BASE_URL` angebunden; die URL steht noch nicht fest. Ein separater Docker-Dienst ist unterstützt, wird in dieser Etappe jedoch nicht bereitgestellt. Der Such-/Webadapter wird synthetisch geprüft; eine positive reale Rechercheabnahme bleibt bis zur Bereitstellung eines geeigneten privaten Endpunkts offen. Die fehlende Verbindung wird als Fehler angezeigt, niemals durch vermeintlich aktuelle Modellfakten ersetzt.

Dateien sind einfache Text-/Tabellendokumente. PDF unterstützt die enthaltene Schrift; nicht abgedeckte Zeichen und übergrosse Dateien liefern nachvollziehbare Fehler. Dynamisch gerenderte, zugriffsgeschützte und übergrosse Webquellen sind nicht Teil des lesenden Rechercheadapters.

Die menschliche Funktionsabnahme wird nicht automatisch als bestanden markiert. Dafür Ausgabe je Modell bewusst aktivieren; mit synthetischen Aufträgen Frage/Antwort, Nachbearbeitung, Download, Priorität/Stop und Fehlerwiederaufnahme ausprobieren. Native Delegation und Abschluss ausschliesslich bewusst im separaten Testkonto prüfen: Originalaufgabe muss unverändert bleiben, nur das angezeigte Referenzkind darf geschlossen werden. Bestehende offene E3–E9-Abnahmen sowie berechtigungspflichtige Todoist-Dauer-/Deadline-Liveprüfungen bleiben offen.

Kein Main-Commit, Release, Docker-Hub-Push, Produktivdeployment oder Start von E10. Die abschliessende lokale Installation erfolgt erst nach erfolgreichen Gates, frischem geprüftem verschlüsseltem Backup und Nachweis des Datenerhalts.

Ein direkter kontrollierter Webseiten-Lesetest gegen die öffentliche IANA-Beispieldokumentation war erfolgreich (1263 Zeichen, keine Zugangsdaten, kein Suchquery und kein privater Prompt). Dies ersetzt nicht die offene Live-Abnahme des noch unkonfigurierten Suchgateways.

Reales lokales Ollama: Windows und isolierter Worker sehen denselben Katalog (sieben installierte, sechs geeignete lokale Modelle). Ein einzelner synthetischer strukturierter Textauftrag auf dem vorhandenen konfigurierten Modell war in 4,5 Sekunden erfolgreich. Keine Modellinstallation, kein Download, keine Einstellungsänderung und kein Todoist-Aufruf.

Statische Nachprüfung: Markdown maskiert HTML-Zeichen in einem Durchgang, ohne eingeführte Entities nochmals zu maskieren; Regression sichert die tatsächlichen Zeichen ab. Die unveränderte konservative Netzwerk-Sperrpolitik liegt nachvollziehbar in `research-address-policy.json` mit IANA-Quellen. Renderer, Verarbeitung und Journalzulassung sind in kleinere Funktionen gegliedert; serielle Verarbeitung, begrenzte sequenzielle Quellenabrufe und alle Berechtigungsprüfungen bleiben erhalten. Keine Regelunterdrückung oder abgeänderte Sicherheitsfreigabe.
