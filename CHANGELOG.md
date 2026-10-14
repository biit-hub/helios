# Changelog

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
