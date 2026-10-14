# Sicherheit

## Unterstützter Stand

Helios ist eine unveröffentlichte Entwicklungsgrundlage (E1.2). Authentifizierung ist mit E1.2 implementiert; weiterhin keine produktive Freigabe. Nur localhost verwenden. Stabile unterstützte Versionen werden beim ersten ausdrücklich beauftragten Release benannt.

## Vertrauliche Meldungen

Sicherheitslücken über [GitHub Private Vulnerability Reporting](https://github.com/biit-hub/helios/security/advisories/new) melden. Keine Secrets, Exploits mit privaten Daten oder sensitive Details in öffentliche Issues stellen. Falls die Funktion nicht verfügbar ist, zunächst ein neutrales Issue zur Einrichtung eines privaten Kontaktwegs eröffnen, ohne Schwachstellendetails. Es gibt derzeit keine verbindliche Reaktionszeit.

Echte Tokens nie in Git, Images, Logs oder Browserstorage speichern. Bei versehentlicher Veröffentlichung sofort widerrufen/rotieren, Zugriffswege prüfen und den Vorfall privat bearbeiten. Historienbereinigung ersetzt keine Rotation.

Automatisierte Abhängigkeits-, Secret-, CodeQL- und Imagescans ergänzen Review und Tests. Produktionsfreigabe braucht in E1.2 echte Passwort/TOTP-/Session-/Recoveryabnahme.
