# Sicherheit

## Unterstützter Stand

Helios ist eine unveröffentlichte Entwicklungsgrundlage (E2). Authentifizierung und lesende Todoist-Konfiguration sind implementiert; weiterhin keine produktive Freigabe. Nur localhost verwenden. Stabile unterstützte Versionen werden beim ersten ausdrücklich beauftragten Release benannt.

## Vertrauliche Meldungen

Sicherheitslücken über [GitHub Private Vulnerability Reporting](https://github.com/biit-hub/helios/security/advisories/new) melden. Keine Secrets, Exploits mit privaten Daten oder sensitive Details in öffentliche Issues stellen. Falls die Funktion nicht verfügbar ist, zunächst ein neutrales Issue zur Einrichtung eines privaten Kontaktwegs eröffnen, ohne Schwachstellendetails. Es gibt derzeit keine verbindliche Reaktionszeit.

Echte Tokens nie in Git, Images, Logs oder Browserstorage speichern. Bei versehentlicher Veröffentlichung sofort widerrufen/rotieren, Zugriffswege prüfen und den Vorfall privat bearbeiten. Historienbereinigung ersetzt keine Rotation.

Automatisierte Abhängigkeits-, Secret-, CodeQL- und Imagescans ergänzen Review und Tests. Produktionsfreigabe braucht in E1.2 echte Passwort/TOTP-/Session-/Recoveryabnahme.

Todoist-Credentials sind mit separatem INTEGRATION_KEY authentifiziert verschlüsselt. Der Reader verwendet ausschliesslich GET und einen festen HTTPS-Origin. Nach Verlust/Rotation des Schlüssels ist eine bewusste neue Tokenhinterlegung erforderlich; keine Klartextausgabe oder automatische Migration. Siehe [E2-Sicherheitsarchitektur](docs/architecture/contexts-todoist.md).
