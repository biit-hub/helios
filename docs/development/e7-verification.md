# E7 – Morgenroutine und Review: Prüfbericht

Stand: 15. Oktober 2026. Umsetzung auf feat/e7-morning-routine von develop 4835adf. [Pull Request #18](https://github.com/biit-hub/helios/pull/18). Lokale Schlussprüfung erfolgreich auf dem Code-Stand d405650. Integration ausschliesslich nach erfolgreichen Pflichtprüfungen desselben finalen PR-Heads. Manuelle E3–E7-Abnahmen bleiben offen.

## Grundlagen und Umfang

E7-Auftrag, AGENTS, README, Implementierungsplan, technische Architektur, E5-/E6-Berichte und bestehende Aufgaben-/Planungs-/KI-Verträge gelesen. Lastenheft, ADRs und Entwicklungsrichtlinien erneut abgerufen; Sites-Projekt bestätigt weiterhin Version 2. Relevant: LH-050–058/060–061/096–097/105, F2/F5, AT-05/12. Neuere bestätigte Anweisungen übersteuern historische Sperrvermerke.

Persistente globale Tage, freie Kontextwahl, kontextgetrennte Schritte, Skip/offen und Wiederaufnahme; native Einzelkarten-Eingangssortierung ohne KI; letzte relevante bestätigte Reviewquelle; explizites Instanzfeedback, persistente Sammelentscheidungen und E4-Einzelergebnisse; derselbe E6-Fortschrittsdialog mit Instanzschutz und erhaltenem Originaltext; dynamische Anreicherung; unveränderte E3–E5-Planung; optionale gemeinsame Problemprüfung. [Reviewentscheidung und Architektur](../architecture/morning-routine-review.md), [Bedienung und spätere manuelle Abnahme](../runbooks/morning-routine.md).

## Datenbank und API

Additive Migration 0009 ergänzt routine_days, routine_contexts, review_feedback und routine_events; insgesamt 31 Tabellen. Eindeutige Benutzer-/Tages- und Kontextstände, erwartete Revisionen, idempotente Kommandos, append-only Ereignisse und unveränderliche eingefrorene Reviewquelle. Bestehende Migrationen und bestätigte Planhistorien bleiben unverändert. Kein Schemadrift bei db:generate.

Neue geschützte GET-/POST-Routineadapter; zentrale Backendguards prüfen Sitzung/MFA, Origin, Besitz, Revisionen, Taskinstanz und Credentialgeneration erneut. Asynchrone Leseantworten und native Abschlussnachweise dürfen bei Token-/Kontextwechsel nicht übernommen werden. Ein Abschluss wird erst nach geeignetem nativen Nachweis oder verifiziertem E4-Ergebnis behauptet. Rückmeldungen können vorhandene Belege desselben historischen Plans verwenden; ältere Pläne werden nicht zusammengeführt. [API-Vertrag](../integrations/routine-api.md).

## Ausgeführte Prüfungen

- Lint, Typprüfung, Produktionsbuild, Secretprüfung und Produktions-Audit erfolgreich. Keine bekannten produktiven Abhängigkeitslücken. db:generate: 31 Tabellen, keine Schemadrift.
- 87 Unit-/Vertragstests bestanden, einschliesslich verspäteter Antworten, Netzausfall und Navigation während Speichern/Reload.
- Vollständige PostgreSQL-Regression nach dem Infrastruktur-Neustart sauber bestanden: 184 Tests in neun Dateien. Darin 30 E7-Risikotests; diese ausserdem separat auf frisch migrierten isolierten Datenbanken geprüft. Native Nachweise, Tokenwechsel, lokale Rückstellung, Idempotenz und abgewiesene Entscheidungen werden ausdrücklich geprüft.
- Vollständige Browserregression: 11 bestanden, 7 mobile Fälle mit dokumentiertem späterem Etappenumfang ausgelassen. E7 separat nach der letzten Fachbestätigung erneut erfolgreich: zwei native Zuordnungen plus ein serverseitig bestätigtes Liegenlassen ergeben drei Erfolge. Ausserdem E6-Teilfortschritt mit Einzelpatchauswahl, Nichtbeginn, Planbestätigung, offene Skips, Browserneustart und konkurrierende Revisionen. Synthetischer Screenshot visuell geprüft.
- Finale lokale Web-/Workerimages mit bestätigter Zählregel gebaut und mit Trivy geprüft: null Secrets, null behebbare HIGH-/CRITICAL-Befunde. Kein Imagepush.
- Isolierter E7-Compose-Smoke erfolgreich: drei gesunde Dienste, zehn Migrationen, tatsächlicher persistenter Queuejob, E7-Readiness; unautorisierte Routine-/Work-/Protected-Zugriffe 401. Windows und finaler Worker erreichen den konfigurierten privaten Ollama-Endpunkt; vorhandenes Modell ist verfügbar. Keine Inferenzdaten oder Downloads dafür erforderlich.
- Verschlüsselte isolierte E6-zu-E7-Upgrade-/Restore-Probe zweimal erfolgreich, zuletzt nach dem Docker-Neustart: zehn SQL-Migrationen, 13 Tabellen verglichen. Reserveordnung/-pause, unknown-Abschluss mit Request-ID, Original-KI-Text/Edits/Zeitzone/Teilerfolg/Klarheitssignal sowie Cursor, Auswahl, Skips, Reviewquelle, Feedback und Sammelentscheidung erhalten. Historien-, Agenda-, Beobachtungs- und Reviewguards nach Restore wirksam. Kein Workerstart, keine externen Aufrufe, keine Klartext-Dumpdatei.
- Lokale Entwicklungsinstallation kontrolliert auf E7 aktualisiert. Vorher Datenbank und Konfiguration erneut verschlüsselt gesichert; Hashvergleich bestätigt unveränderte vorhandene Identitäten, Integrationen, Kontexte, vollständige Pläne/Historien, Operationen und KI-Entwürfe/Klarheitssignale. Danach gesunde E7-Readiness und tatsächlicher Queue-Smoke. Keine Produktion geändert.
- CI, CodeQL und Sonar auf Code-Head 043893a erfolgreich; Sonar-Gate OK, null Bugs/Vulnerabilities und keine offenen neuen Komplexitätsbefunde nach der begrenzten Modulaufteilung. Für die abschliessende Zählregel und Dokumentation sind die [Prüfungen am aktuellen PR-Head](https://github.com/biit-hub/helios/pull/18/checks) massgeblich. Der Mergeguard verlangt alle Checks erfolgreich auf exakt demselben finalen Head, beide CI-Ereignisse push/pull_request, Sonar-Gate OK, strikten Branchschutz und unverändertes main.

## Behobene Fehler

Der Tageswechseltest erneuert die MFA-Sitzung regulär. Privat bleibt aktiv; Deaktivierung wird an einem echten Arbeitgeberkontext geprüft. Die Routine friert beim direkten Übergang von Kontextwahl zu Review bereits die richtige historische Quelle ein. Bekannte Rückmeldungen desselben Plans bleiben nutzbar. Laufende Kontext-/Fortschrittsoperationen verhindern vollständige Erfolgsanzeigen. Aus fehlenden Tasks wird kein Abschluss abgeleitet; veränderte Wiederholungsinstanzen werden nicht abgeschlossen.

Die Auswahl in Review und Kontextwahl wird nicht still auf eine fremde Revision übertragen. Neue Eingangskarten übernehmen keine Projektwahl der vorherigen Karte. Der gemeinsame Fortschrittsdialog bindet den historischen Einstieg an die tatsächliche Instanz. Teilfeedback verlangt einen eigenen passenden E6-Entwurf.

Die Regression fand einen Speicherwettlauf: sofortiger Seitenwechsel konnte den neuen Aufgabenbereich vor Abschluss der Kontextspeicherung laden. Hauptnavigation bleibt nun bis zum Speichern und massgeblichen Reload gesperrt; ein eigener UI-Test prüft beide Wartephasen. Die alte E2-Browserassertion berücksichtigt jetzt alle tatsächlich aktiven verwalteten Kontexte, die der vorhandene E6-Worker lesen darf. Der Test schliesst Eingang und fremde Projekte weiterhin aus. Die Typoption im neuen UI-Test wurde an Testing Library angepasst.

Sonar-Komplexität wurde fachlich begrenzt reduziert: Kontextwahl, Schrittwechsel, Reviewrückmeldung und Einzeloperationen liegen in kleinen Helfern. Keine zweite Planungs-, KI-, Schreib- oder Problemverwaltung.

## Infrastrukturunterbrechung und Wiederherstellung

Wiederholte Imagebuilds unter gleichzeitig hoher Last verbrauchten den freien Windows-Systemspeicher. Ein Docker-Dateisystemfehler führte zum Engineausfall und unterbrach einen lokalen Testlauf. Dieser Lauf wird nicht als bestanden gezählt. Zuvor war ein laufender Sammeltest während der neu bestätigten Fachregeländerung noch mit einem alten Modul geladen worden; auch dessen gemischter Stand zählt nicht als Schlussnachweis.

Bereinigt wurden nur der erzeugbare Helios-Next-Build sowie eindeutig identifizierte ungenutzte E7-Helios-Buildcaches nach ID. Keine Datenvolumes, Quelltexte, Schlüssel oder verschlüsselten Sicherungen wurden gelöscht. Docker wurde kontrolliert neu gestartet; die bestehende E6-Installation war danach wieder vollständig gesund und wurde zusätzlich verschlüsselt gesichert. Anschliessend wurden konsistente Images ohne parallelen schweren Hostbuild erstellt, freier Speicher überwacht und vor dem weiteren Workerbuild mindestens 8 GiB verlangt. Rund 20 GiB blieben frei. Die abschliessende vollständige 184-Fälle-Regression, Restore und Smoke bestanden nach Wiederherstellung erneut.

## Verifizierte Verträge und Grenzen

Neue E7-Verträge wurden ausschliesslich synthetisch geprüft. Native Move/Delete/Close, Teilerfolg, Wiederholungsinstanz und Unknown-Reconciliation verwenden die bereits in E4 verifizierte Pipeline. Es gab für E7 keine neuen schreibenden Live-Todoist-Vertragstests. Verfügbare native added_at-Metadaten dürfen zur Priorisierung dienen; fehlende Daten werden nicht erfunden. Drei-Aktionen-Hinweis zählt nachgewiesene Zuordnungen/Löschungen und gemäss ausdrücklicher Bestätigung erfolgreich serverseitig gespeichertes Liegenlassen. Letzteres bleibt ohne Todoist-Mutation und KI; idempotente Wiederholungen und abgewiesene Entscheidungen zählen nicht zusätzlich.

KI bleibt auf dem vorhandenen Ubuntu-LAN-Endpunkt über konfigurierbare OLLAMA_BASE_URL. Keine Cloud-KI, Installation auf Windows, Modelldownloads oder öffentliche Portfreigabe. Lokale verschlüsselte Sicherungen genügen; späteres Synology-Ziel bleibt konfigurierbar und benötigt heute keine Zugangsdaten.

Manuelle E3–E7-Abnahme bleibt ausdrücklich offen; die konkrete gemeinsame Prüfanleitung steht im [Runbook](../runbooks/morning-routine.md). Smartphone-PWA folgt in E11. Kein E8, main-Merge, stabiles Release, Docker-Hub-Push oder Produktivdeployment.
