# Helios

Helios ist eine selbst betriebene Anwendung für einen ruhigen Arbeitsalltag: Morgenroutine, überschaubare Tagesauswahl und ein konkreter nächster Schritt. Aufgaben bleiben später in Todoist führend; lokale KI bietet prüfbare Vorschläge.

**Stand: E1.1, technische Grundlage, kein stabiles Release.** Implementiert sind eine responsive Startseite und ein eigener mobiler Bereich, typisierte Verträge, PostgreSQL/Drizzle-Migrationen, separater pg-boss-Worker, ein idempotenter technischer Testjob und Healthchecks. Es gibt noch keine Anmeldung und keine produktiven Daten.

Geplant: E1.2 Benutzername/Passwort mit verpflichtendem TOTP und Recovery; danach Kontexte, Todoist-Lesesicht, Tagespläne/Fokus/Reserve, lokale Ollama-Vorschläge, Morgenroutine, Epics, lesendes TermiHub, Lernen, mobile PWA und Push. E1.1 darf bis zur Sicherheitsabnahme von E1.2 ausschliesslich lokal betrieben werden.

## Schnellstart mit Docker Compose

Voraussetzungen: Git, Docker Engine/Desktop mit Compose v2, Node.js 22.23.2 oder 24.19.0 und pnpm 11.25.0. Linux ist das spätere Serverziel; Windows wird für Entwicklung unterstützt.

```sh
git clone https://github.com/biit-hub/helios.git
cd helios
git checkout develop
pnpm install --frozen-lockfile
pnpm config:init
docker compose up -d postgres
docker compose build
docker compose run --rm --no-deps worker node_modules/.bin/tsx packages/backend/src/migrate.ts
docker compose up -d web worker
docker compose exec worker node_modules/.bin/tsx apps/worker/src/smoke.ts
```

Öffne [Helios lokal](http://127.0.0.1:3100) oder [das mobile Grundlayout](http://127.0.0.1:3100/mobile). Es wird kein Konto angelegt. Die echte Ersteinrichtung folgt in E1.2. Der Testjob schreibt ausschliesslich eine synthetische UUID in die neue Datenbank.

Compose verwendet das Projekt `helios-dev`, ein eigenes Volume und ein internes Netzwerk. Nur Web bindet an Loopback. PostgreSQL und Worker haben keine Hostports. Keine Helios-1.0-Volumes oder bestehenden NPM-Container verwenden.

## Konfiguration

`pnpm config:init` legt einmalig eine ignorierte `.env` mit zufälligem Datenbankpasswort an. Es überschreibt keine Datei. [.env.example](.env.example) enthält nur Platzhalter. Unix-Dateirechte werden auf 0600 gesetzt; auf Windows den Zugriff über NTFS auf den eigenen Benutzer begrenzen. Niemals `docker compose config` mit aufgelösten Secrets veröffentlichen. Passwortänderungen aktualisieren keine bereits initialisierte PostgreSQL-Rolle automatisch.

| Variable                      | Bedeutung                                                        |
| ----------------------------- | ---------------------------------------------------------------- |
| HELIOS_ENV                    | development, test oder production; unabhängig von NODE_ENV       |
| DATABASE_URL                  | Private PostgreSQL-Verbindungsadresse; Compose-Hostname postgres |
| POSTGRES_DB / USER / PASSWORD | Initialisierung der neuen PostgreSQL-Datenbank                   |
| WEB_PORT                      | Lokaler Loopbackport, Standard 3100                              |
| WORKER_ENABLED                | Exakt true/false, zum Anhalten der Verarbeitung                  |
| RESTORE_MODE                  | true blockiert Worker und technischen Job beim Restore           |

Testdatenbanken müssen auf `_test` enden. Produktion braucht getrennte Konfiguration, Schlüssel und Compose-Projektnamen. Die [Produktionsvorlage](infra/compose.production.example.yaml) bereitet NPM vor; sie ist noch keine Deploymentfreigabe. Keine echten Todoist-, TermiHub- oder Ollama-Zugangsdaten erforderlich.

## Betrieb und Updates

`docker compose ps` zeigt die Healthchecks. `/api/health/live` prüft den Webprozess, `/api/health/ready` Migration und frischen Workerheartbeat. Ein gestoppter Worker macht Readiness nach spätestens 35 Sekunden rot. Fehlerantworten und JSON-Logs enthalten keine Konfiguration oder Rohfehler.

Entwicklungsupdates: alten Commit notieren, [Backup](docs/runbooks/backup-restore.md) erstellen, Worker stoppen, geprüften develop-Commit holen, Images bauen, Migration im einmaligen Workercontainer ausführen und Dienste starten. Nie ein älteres Image mit einer inkompatiblen neuen DB starten; Restore nach Runbook. Stabile Versionen/Images entstehen erst nach ausdrücklichem Releaseauftrag.

Backups, Wiederherstellung und Fehlerdiagnose: [Betrieb](docs/runbooks/operations.md), [Backup/Restore](docs/runbooks/backup-restore.md). Kein `down -v` bei einer zu erhaltenden Datenbank.

## Entwicklung und Mitwirkung

Siehe [Entwicklung](docs/development/workflow.md), [CONTRIBUTING](CONTRIBUTING.md), [Architektur](docs/architecture/README.md), [Anforderungen](docs/requirements/README.md) und [Prüfbericht](docs/development/e1.1-verification.md). Normale Fehler gehören in GitHub Issues, Sicherheitslücken vertraulich in [Private Vulnerability Reporting](https://github.com/biit-hub/helios/security/advisories/new).

## Struktur

```text
apps/web          Next.js UI und HTTP-Adapter
apps/worker       Dauerhafter Queueprozess und technische CLI
packages/backend  Frameworkfreier Node-Kern, Konfiguration, DB, Queue
packages/contracts Browserfähige Zod-Verträge und Domänentypen
packages/ui       Gemeinsame Marke, Bausteine und Designtokens
infra             Images und isolierte Umgebungen
tests             Unit/UI, PostgreSQL/Queue, Browser
docs              Anforderungen, Architektur, Entwicklung, Runbooks
.github           CI, Releasevorbereitung, Community und Security
```

MIT-Lizenz. Ausschliesslich synthetische Beispieldaten.
