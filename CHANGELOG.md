# Changelog

## E3 – Tagesplanung und Fokus (in Abnahme)

- Persistente Tagesvorschläge und bestätigte Pläne je Kontext/Tag, Auswahlgründe und geschützte Historie.
- Operationsjournal, nachgewiesene Abschnittswechsel, Teilerfolge, Quellenkonflikte und sichere Wiederaufnahme.
- Freigegebener Hierarchieerhalt, Fokus ohne Reorder, Heute im Blick und neutrale Beobachtungen.

## E2 – Kontexte und Todoist lesen

- Tokenformular: Sicherheitsvoraussetzung und Fehler direkt am Eingabefeld anzeigen; erfolgreiches Speichern ausdrücklich bestätigen.

- Dynamische Arbeitgeber und ein Privatkontext mit sechs bestätigten Themes, Pills, revisionsgeschützten Projektzuordnungen und erhaltener Historie.
- Verschlüsselte Todoist-Credentials, GET-only API-v1-Adapter, vollständiger Projektkatalog, Aufgaben-/Kommentarlesesicht und nachvollziehbare Aktualität/Probleme.
- E1.2-Guards für alle neuen Zugriffe; Step-up, CSRF, Scope-, Generation- und Abruf-Claim-Prüfung, additive Migrationen und isolierte Vertrags-/PostgreSQL-/Browserprüfungen.

Alle relevanten Änderungen werden hier dokumentiert. SemVer gilt für ausdrücklich beauftragte Releases; GitHub generiert zusätzliche Release Notes aus PRs.

## Unreleased

### Added

- E1.2: lokaler Einzelkonto-Bootstrap, echte Passwort-/TOTP-Anmeldung und Recovery mit kontrollierter Neueinrichtung.
- Argon2id, verschlüsselte TOTP-/Recovery-Daten, harte Sitzungsfristen, unmittelbarer DB-Widerruf und gemeinsame Step-up-Guards.
- Geschützte Desktop-/Mobilshell, Login-/Setup-/Sicherheitsansichten, sichere Redirects, CSRF-/Origin-Schutz und nonce-basierte CSP.
- Echte Auth-/Konkurrenztests, Browserlebenszyklus, lokales Recovery-CLI und erweiterte Betriebsanleitungen.

- E1.1: eigenständiger TypeScript-Workspace mit Next.js, Node-Worker, PostgreSQL, Drizzle und pg-boss.
- Responsive Helios-Startseite und mobiler Grundbereich ohne vorgetäuschte Anmeldung.
- Typisierte Konfiguration, Healthchecks, Migrationen und technischer idempotenter Testjob.
- Unit-/UI-, PostgreSQL-/Queue- und Playwright-Smoke-Tests.
- Isoliertes Compose, CI-/Securityprüfungen, Communityvorlagen und manuell geschützte Releasevorbereitung.
- Betriebs-, Backup-/Restore- und Entwicklungsdokumentation.

Noch kein stabiler Tag, GitHub Release oder Docker-Hub-Image veröffentlicht.
