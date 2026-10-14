# Technische Architektur

Next.js/React/TypeScript und pnpm-Workspace, drei Dienste: Web, separater Node-Worker, PostgreSQL. Keine Redisinstanz. Drizzle verwaltet Anwendungstabellen; pg-boss besitzt sein eigenes Schema und Queue-Lifecycle. Bibliotheksmigrationen und Appmigrationen werden getrennt nachvollzogen.

Webadapter importieren server-only vor dem Node-Kern. Backend importiert weder React noch Next. contracts/ui enthalten keine serverseitigen Datenbank-/Secretmodule; ESLint prüft diese Importgrenze. Konfiguration wird serverseitig per Zod validiert. HELIOS_ENV trennt fachliche Umgebungen unabhängig von NODE_ENV.

Der technische Testjob enthält nur eine UUID. Sein Handler schreibt mit eindeutiger ID und ON CONFLICT DO NOTHING. Queueeinreihung nutzt denselben pg-Client/SQL-Transaktionskontext; Integrationstests belegen Commit und Rollback. Das ist kein Nachweis einer Exactly-once-Wirkung bei externen APIs.

Workerheartbeat wird alle zehn Sekunden geschrieben. Web-Readiness prüft migriertes Appschema und Heartbeat jünger als 35 Sekunden; Liveness braucht keine DB. Shutdown stoppt Polling geordnet. Logs geben Ereigniscodes statt Rohfehler/Payloads aus.

[Zielarchitektur](helios-technical-architecture.md), [Gesamtplan](helios-implementation-plan.md) und [offene Entscheidungen](helios-open-decisions.md) sind bereinigte historische Planungsgrundlagen. Ihre früheren Repository-/Branch-/Implementierungsverbote sind durch den E1.1-Auftrag und ADR-005 bis ADR-008 übersteuert. Auth und Fachfunktionen bleiben für die Folgeetappen geplant.

## Aktuelle ADR-Ergänzungen

- ADR-005: Produkt Helios, eigenes öffentliches Repository und eigene Historie. Altcode nicht migrieren/archivieren.
- ADR-006: Lokal entwickeln/testen, Produktion später getrennt mit HTTPS/NPM; mobile Pushabnahme braucht HTTPS-Testumgebung.
- ADR-007: 30 Tage absolut für vertrauenswürdige Sessions; sonst zwölf Stunden absolut/30 Minuten idle, fünf Minuten Step-up. Umsetzung E1.2.
- ADR-008: PRs nach develop, main nur stabile Releases, expliziter menschlicher Releaseauftrag, Docker Hub, kein automatisches Produktionsdeployment.

## Designstand

[Bestätigter Sites-Prototyp V2](https://helios-2-prototyp.greenbream.chatgpt.site) ist die Desktopreferenz. E1.1 übernimmt die warme Helios-Marke mit cremefarbenen Flächen und Orange, zeigt aber keine erfundenen Aufgaben/Anmeldung. Mobile ist nur ein vorbereiteter eigener Bereich; endgültige Routinegestaltung folgt in E11. Keine Behauptung vollständiger Designkonformität des Gerüsts.

## E1.2

Die [Authentifizierungsarchitektur](authentication.md) implementiert Better Auth, Argon2id, obligatorisches TOTP, Recovery und die festgelegten Sitzungsfristen. Die Shell ist jetzt geschützt. Öffentlicher HTTPS-Betrieb bleibt bis zur separaten Abnahme gesperrt.
