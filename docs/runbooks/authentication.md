# Lokale Konto- und TOTP-Einrichtung

## Voraussetzungen und Upgrade aus E1.1

Auf develop aktualisieren, vorhandene private .env erhalten. pnpm install --frozen-lockfile, pnpm config:auth und docker compose build ausführen. Worker vor Migration stoppen; die neuen SQL-Migrationen sind additiv und verändern technische Proben nicht.

```sh
docker compose stop worker
docker compose run --rm --no-deps worker node_modules/.bin/tsx packages/backend/src/migrate.ts
docker compose up -d --wait web worker
```

Gesunde Readiness verlangt nun Authkonfiguration und Authschema zusätzlich zu DB/Worker. Der Betriebszustand ohne Benutzerkonto ist normal; es existieren keine Default-Zugangsdaten.

## Bootstrap

```sh
docker compose -f compose.yaml -f infra/compose.admin.yaml run --rm --no-deps -it worker node_modules/.bin/tsx packages/backend/src/identity/cli.ts bootstrap
```

Dieser Override ist nur für run, nicht für up: der einmalige Admincontainer protokolliert keine Terminalausgabe über einen Docker-Logtreiber. Namen mit 3–30 ASCII-Buchstaben/Ziffern/Punkt/Bindestrich/Unterstrich wählen; Anmeldung ist normalisiert. Passwort 12–128 Zeichen verborgen eingeben und wiederholen. Kein Passwort in Kommandoargumenten/Umgebungsvariablen; CLI lehnt nicht-interaktive Ausführung ab.

Den einmalig gezeigten zehn Minuten gültigen Nachweis direkt im Formular unter http://127.0.0.1:3100/setup eingeben, nicht in URL oder Browserstorage. Anschliessend das gewählte Passwort eingeben. Andere Hosts/Ports funktionieren nur, wenn AUTH_ORIGIN exakt entsprechend konfiguriert und die Anwendung neu gestartet wurde.

Authenticator-App öffnen, neues TOTP-Konto hinzufügen, QR-Code direkt aus Helios scannen. Alternativ lokalen manuellen Schlüssel verwenden: sechs Stellen, 30 Sekunden, standardmässig SHA-1-TOTP. Server und Telefon müssen korrekte automatische Zeit haben. Kein externer QR-Webdienst.

Gültigen Code eingeben. Erst jetzt werden zehn zufällige Recovery-Codes einmalig gezeigt. Im Passwortmanager oder sicher offline speichern, Sicherung ausdrücklich bestätigen und Konto aktivieren. Vorher werden Shell, Sicherheitseinstellungen und Fach-API verweigert.

## Abbruch und Sitzungen

Bei Unterbruch vor Ablauf mit derselben Einrichtungssitzung /setup öffnen und mit Passwort neu beginnen; dabei wird ein neuer Secret erzeugt. Nicht abgesicherte Codes werden ersetzt. Nach Ablauf nicht erneut bootstrap ausführen: es wird kein zweites Konto erstellt. [Lokale Recovery](identity-recovery.md) verwenden.

Login: Benutzername/Passwort → neuer TOTP-Code → ursprünglich angeforderter erlaubter Pfad. Diesem Gerät vertrauen erlaubt maximal 30 Tage absolute Sitzung, keine TOTP-Umgehung bei erneuter Anmeldung. Normale Sitzung endet spätestens nach zwölf Stunden oder 30 Minuten ohne geschützten Serverzugriff.

Unter /settings/security Sitzungen anzeigen, per Passwort plus neuem TOTP-Code Step-up bestätigen und Passwort/TOTP/Recovery ändern oder Sitzungen widerrufen. Step-up gilt maximal fünf Minuten; nach Login den nächsten Authenticator-Code abwarten, da Replay abgewiesen wird. Logout beendet die aktuelle Sitzung sofort.
