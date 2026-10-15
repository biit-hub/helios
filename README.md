# Helios

Helios ist eine selbst betriebene Anwendung für einen ruhigen Arbeitsalltag: Morgenroutine, überschaubare Tagesauswahl und ein konkreter nächster Schritt. Todoist bleibt für Aufgaben führend; lokale KI bietet prüfbare Vorschläge.

**Stand: E5 implementiert und lokal technisch geprüft, Tagesordnung und zyklische Reserve; kein stabiles Release.** Implementiert sind die geschützte responsive Shell, lokale Einzelkonto-Einrichtung, Benutzername/Passwort mit Argon2id, obligatorisches TOTP, einmalige Recovery-Codes, widerrufbare PostgreSQL-Sitzungen und Step-up für Sicherheitsaktionen. Hinzu kommen dynamische Privat-/Arbeitgeberkontexte, sechs Farbschemata, verschlüsselte Todoist-Verbindung, Projektzuordnung und lesende Aufgaben-/Kommentardetails.

E3 ergänzt [Tagesplanung und Fokus](docs/runbooks/planning.md) mit nachvollziehbaren Vorschlägen, bewusster Bestätigung, sicherem Operationsjournal und kontextgetrennter Historie. Unteraufgaben behalten ihre Hierarchie.

E4 ergänzt [Aufgabenverwaltung](docs/runbooks/tasks.md): Formularerfassung (ohne Projektwahl im nativen Eingang), Suche/Statusfilter, bewusste Bearbeitung, native Moves, Kommentare, Wartedetails, Abschluss und Löschung. Alle externen Änderungen verwenden dasselbe persistente Journal und den Worker aus E3. Wiederholungen werden instanzbezogen abgeschlossen; unbekannte Ergebnisse werden nicht blind wiederholt. Die manuelle E3-Abnahme bleibt ausdrücklich verschoben und offen.

Geplant: lokale Ollama-Vorschläge, Morgenroutine, Epics, lesendes TermiHub, Lernen, mobile PWA und Push. Der E2-Reader bleibt GET-only; E3 verschiebt geeignete Aufgaben erst nach bewusster Planbestätigung nach In Arbeit; persönliche Verbindungen richtet der Betreiber selbst ein. Öffentlicher HTTPS-Betrieb benötigt weiterhin eine separate Sicherheitsabnahme.

Für die aktuelle Entwicklung genügen lokale verschlüsselte Backups und isolierte Restore-Proben gemäss [Backup-Runbook](docs/runbooks/backup-restore.md). Eine NAS-Anbindung ist keine E3-Voraussetzung. Für die spätere Produktion sind automatische verschlüsselte Sicherungen auf einem Synology-NAS vorgesehen; Zielpfad und Zugang werden erst bei der Produktivinstallation konfiguriert.

E5 erweitert denselben Tagesplan um persistente Haupt-/Reserveordnung mit Drag-and-drop und Pfeilen, direkte Fokuswahl, bewusste Zusatzaufnahme sowie Reserve-Rotation mit Einzelkartenpause und nachgewiesenem E4-Abschluss. [Architektur](docs/architecture/daily-order-reserve.md), [Bedienung und manuelle Abnahme](docs/runbooks/planning.md), [Prüfbericht](docs/development/e5-verification.md). Manuelle E3-/E4-Abnahmen bleiben offen.

E4: [API-Vertrag](docs/integrations/tasks-api.md), [Prüfbericht](docs/development/e4-verification.md).

E3-Details: [Architektur](docs/architecture/planning-focus.md), [API](docs/integrations/planning-api.md), [Prüfbericht](docs/development/e3-verification.md).

## Schnellstart mit Docker Compose

Voraussetzungen: Git, Docker Engine/Desktop mit Compose v2, Node.js 22.23.2 oder 24.19.0 und pnpm 11.25.0. Linux ist das spätere Serverziel; Windows wird für Entwicklung unterstützt.

```sh
git clone https://github.com/biit-hub/helios.git
cd helios
git checkout develop
pnpm install --frozen-lockfile
pnpm config:init
pnpm config:auth
pnpm config:integrations
docker compose up -d postgres
docker compose build
docker compose run --rm --no-deps worker node_modules/.bin/tsx packages/backend/src/migrate.ts
docker compose up -d web worker
docker compose exec worker node_modules/.bin/tsx apps/worker/src/smoke.ts
```

Öffne [Helios lokal](http://127.0.0.1:3100) oder [die mobile Kontextauswahl](http://127.0.0.1:3100/mobile). Ohne Anmeldung führt die Anwendung zum echten Login. Es wird kein Defaultkonto angelegt. Die Einrichtung erfolgt wie nachstehend über das lokale CLI. Der Testjob schreibt ausschliesslich eine synthetische UUID in die neue Datenbank.

Compose verwendet das Projekt `helios-dev`, ein eigenes Volume und ein internes Netzwerk. Nur Web bindet an Loopback. PostgreSQL und Worker haben keine Hostports. Keine Helios-1.0-Volumes oder bestehenden NPM-Container verwenden.

## Lokales Konto einrichten

Nachdem alle Dienste gesund sind, in einem interaktiven Terminal ausführen:

```sh
docker compose -f compose.yaml -f infra/compose.admin.yaml run --rm --no-deps -it worker node_modules/.bin/tsx packages/backend/src/identity/cli.ts bootstrap
```

Benutzername wählen und ein Passwort mit mindestens zwölf Zeichen verborgen eingeben. Das CLI zeigt einmalig einen zehn Minuten gültigen Setupnachweis. Der Admincontainer verwendet keinen Docker-Logtreiber; den Nachweis nicht anderweitig protokollieren.

[Einrichtung öffnen](http://127.0.0.1:3100/setup), Nachweis und Passwort im Formular eingeben. In einer üblichen Authenticator-App (z. B. 2FAS, Aegis, Google oder Microsoft Authenticator) ein TOTP-Konto hinzufügen, den lokalen QR-Code scannen und den sechsstelligen Code bestätigen. Recovery-Codes werden danach einmalig angezeigt. Sicher aufbewahren und die Sicherung bestätigen; erst dann wird die Anwendung freigeschaltet. Kein QR-Webdienst, keine E-Mailregistrierung und keine Cloudverbindung erforderlich.

Normale Sitzungen enden nach maximal zwölf Stunden oder 30 Minuten ohne geschützten Serverzugriff; vertrauenswürdige Sitzungen nach maximal 30 Tagen absolut. Jede neue Anmeldung verlangt wieder Passwort und TOTP. Sicherheitsaktionen benötigen eine erneute Bestätigung innerhalb von fünf Minuten. Bereits verbrauchte Authenticator-Codes werden nicht erneut akzeptiert; nach dem Login für Step-up den nächsten 30-Sekunden-Code abwarten.

Details: [Einrichtung](docs/runbooks/authentication.md), [Recovery](docs/runbooks/identity-recovery.md), [Sicherheitskonfiguration](docs/runbooks/identity-security.md).

## Konfiguration

`pnpm config:init` legt einmalig eine ignorierte `.env` mit zufälligem Datenbankpasswort an. Es überschreibt keine Datei. [.env.example](.env.example) enthält nur Platzhalter. Unix-Dateirechte werden auf 0600 gesetzt; auf Windows den Zugriff über NTFS auf den eigenen Benutzer begrenzen. Niemals `docker compose config` mit aufgelösten Secrets veröffentlichen. Passwortänderungen aktualisieren keine bereits initialisierte PostgreSQL-Rolle automatisch.

| Variable                      | Bedeutung                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| HELIOS_ENV                    | development, test oder production; unabhängig von NODE_ENV                                        |
| DATABASE_URL                  | Private PostgreSQL-Verbindungsadresse; Compose-Hostname postgres                                  |
| POSTGRES_DB / USER / PASSWORD | Initialisierung der neuen PostgreSQL-Datenbank                                                    |
| WEB_PORT                      | Lokaler Loopbackport, Standard 3100                                                               |
| PLAN_TIMEZONE                 | IANA-Zeitzone für Plantage, Standard Europe/Zurich                                                |
| WORKER_ENABLED                | Exakt true/false, zum Anhalten der Verarbeitung                                                   |
| RESTORE_MODE                  | true blockiert Worker, geschützte Authzugriffe und Mutationen beim Restore                        |
| AUTH_SECRET                   | Privater zufälliger Signatur-/Verschlüsselungsschlüssel, nicht rotieren ohne Recoveryplan         |
| INTEGRATION_KEY               | Separater privater 32-Byte-Hexschlüssel für Todoist-Credentials; lokal generiert, separat sichern |
| AUTH_ORIGIN                   | Exakter kanonischer Browserorigin, z. B. http://127.0.0.1:3100 lokal                              |

`pnpm config:auth` ergänzt nur fehlende AUTH_SECRET/AUTH_ORIGIN in der ignorierten lokalen .env, ohne bestehende Werte zu ersetzen. AUTH_SECRET enthält mindestens 32 zufällige Bytes als Hex und schützt Cookie-Signaturen sowie TOTP-/Recovery-Verschlüsselung. Verlust dieses Schlüssels erfordert lokale Recovery. AUTH_ORIGIN ist der exakte Browserorigin; in Entwicklung HTTP nur auf Loopback, in Produktion ausschliesslich HTTPS.

Testdatenbanken müssen auf `_test` enden. Produktion braucht getrennte Konfiguration, Schlüssel und Compose-Projektnamen. Die [Produktionsvorlage](infra/compose.production.example.yaml) bereitet NPM vor; sie ist noch keine Deploymentfreigabe. Für die Entwicklung sind keine echten Todoist-, TermiHub- oder Ollama-Zugangsdaten erforderlich.

## Kontexte und Todoist

Unter Einstellungen den Privatkontext benennen und Arbeitgeber frei hinzufügen. Kupfer, Meerblau, Waldgrün, Pflaume, Terrakotta und Gold entsprechen dem bestätigten V2-Design. Sichtbare Kontext-Pills wechseln die Lesesicht; Konfiguration bleibt serverseitig gespeichert.

Todoist-Token nach frischer Passwort-/TOTP-Bestätigung hinterlegen, Verbindung prüfen, bestehendes Projekt auswählen und speichern. Pro aktivem Kontext genau ein Projekt, keine aktive Doppelzuordnung. Danach Aufgaben bewusst aktualisieren. Eingang und fremde Projekte werden nicht automatisch verarbeitet. Das Verbinden und Aktualisieren führt keine Todoist-Schreibaktionen aus; Aufgabenänderungen benötigen die bewusste E4-Bestätigung. Keine Hintergrund-KI. TermiHub ist nur als optionale Referenz vorbereitet.

Vollständige [Einrichtungsanleitung](docs/runbooks/todoist-setup.md), [API-Vertrag und Grenzen](docs/integrations/todoist.md), [Architektur](docs/architecture/contexts-todoist.md) und [E2-Prüfbericht](docs/development/e2-verification.md). INTEGRATION_KEY über pnpm config:integrations ergänzen und bei Backups separat sichern.

## Betrieb und Updates

`docker compose ps` zeigt die Healthchecks. `/api/health/live` prüft den Webprozess, `/api/health/ready` Migration und frischen Workerheartbeat. Ein gestoppter Worker macht Readiness nach spätestens 35 Sekunden rot. Fehlerantworten und JSON-Logs enthalten keine Konfiguration oder Rohfehler.

Entwicklungsupdates: alten Commit notieren, [Backup](docs/runbooks/backup-restore.md) erstellen, Worker stoppen, geprüften develop-Commit holen, Images bauen, Migration im einmaligen Workercontainer ausführen und Dienste starten. Nie ein älteres Image mit einer inkompatiblen neuen DB starten; Restore nach Runbook. Stabile Versionen/Images entstehen erst nach ausdrücklichem Releaseauftrag.

Backups, Wiederherstellung und Fehlerdiagnose: [Betrieb](docs/runbooks/operations.md), [Backup/Restore](docs/runbooks/backup-restore.md). Kein `down -v` bei einer zu erhaltenden Datenbank.

## Entwicklung und Mitwirkung

Siehe [Entwicklung](docs/development/workflow.md), [CONTRIBUTING](CONTRIBUTING.md), [Architektur](docs/architecture/README.md), [Anforderungen](docs/requirements/README.md) und [E1.1-Prüfbericht](docs/development/e1.1-verification.md) und [E1.2-Prüfbericht](docs/development/e1.2-verification.md). Normale Fehler gehören in GitHub Issues, Sicherheitslücken vertraulich in [Private Vulnerability Reporting](https://github.com/biit-hub/helios/security/advisories/new).

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

E6 ergänzt [lokale KI und gemeinsamen Fortschritt](docs/runbooks/ai-progress.md): prüfbare Erfassung, managed-only-Analyse, Ist klar und persistente Einzelpatch-Entwürfe. Die vorhandene Ubuntu-Ollama-Instanz wird über konfigurierbare OLLAMA_BASE_URL erreicht; Formular und gespeicherte Pläne bleiben ohne KI nutzbar. [Architektur](docs/architecture/local-ai-progress.md), [API](docs/integrations/ai-api.md), [Prüfbericht](docs/development/e6-verification.md). E6 ist in technischer Abnahme; manuelle E3–E5-Abnahmen bleiben offen.
