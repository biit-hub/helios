# Kontexte und Todoist einrichten

## Lokale Vorbereitung / Upgrade aus E1.2

Vorhandene private .env erhalten; E1.2-Passwort/TOTP-Konto bleibt bestehen. Vor Verwendung persönlicher Daten Backup und Schlüsselablage gemäss [Backup/Restore](backup-restore.md) einrichten. Auf develop aktualisieren und ausführen:

```sh
pnpm install --frozen-lockfile
pnpm config:integrations
docker compose stop worker
docker compose build
docker compose run --rm --no-deps worker node_modules/.bin/tsx packages/backend/src/migrate.ts
docker compose up -d --wait web worker
```

config:integrations ergänzt einmalig einen zufälligen 32-Byte-Schlüssel INTEGRATION_KEY als Hex in der ignorierten lokalen .env. Bestehende Werte bleiben unverändert. Der Schlüssel wird nicht protokolliert. Bei nativer Entwicklung müssen AUTH_SECRET, AUTH_ORIGIN, INTEGRATION_KEY und DATABASE_URL im Serverprozess gesetzt sein; Browserexports erhalten diese Werte nicht. Ohne Integrationsschlüssel funktioniert die Anmeldung weiter; Tokens lassen sich erst nach sicherer Konfiguration hinterlegen. Keine Default-Todoist-Zugangsdaten.

## Verbinden

1. Helios lokal öffnen, mit Passwort und Authenticator anmelden und Einstellungen wählen.
2. Unter „Sensible Änderungen bestätigen“ Passwort und einen neuen TOTP-Code eingeben. Die Freigabe gilt höchstens fünf Minuten; bereits verbrauchte Codes nicht nochmals verwenden.
3. In der Todoist-Webanwendung Avatar → Einstellungen → Integrationen → Entwickler → API-Token kopieren; siehe [offizielle Entwicklerhilfe](https://developer.todoist.com/). Token wie ein Passwort behandeln.
4. Token ausschliesslich im geschützten Helios-Passwortfeld einfügen und „Token verschlüsselt speichern“. Danach wird das Feld geleert; der gespeicherte Wert ist nicht erneut abrufbar. Nicht in URLs, Browserstorage, Repository, Supportlogs oder Screenshots ablegen.
   Falls die Sicherheitsbestätigung fehlt oder abgelaufen ist, zeigt das Tokenformular den Fehler direkt beim Speichern an. Über den Link oberhalb des Tokenfelds zur Passwort-/TOTP-Bestätigung wechseln und danach erneut speichern. Die Verbindungsprüfung wird erst nach erfolgreichem Speichern aktiv.

5. „Verbindung prüfen & Projekte laden“ wählen. Es erfolgen nur lesende Abrufe; bestehende Projekte und Aufgaben werden nicht umgebaut. Fehler und Abrufpause beachten.

## Privat und Arbeitgeber

Privat existiert einmalig und bleibt aktiv. Name, eines der sechs bestätigten Farbschemata und ein vorhandenes Todoist-Projekt wählen. Arbeitgeber über „Arbeitgeber hinzufügen“ mit frei gewähltem Namen anlegen. Anfangs darf die Projektzuordnung fehlen; bis zur gültigen Zuordnung ist der Kontext unvollständig. Projektkatalog zeigt Namen, IDs, belegte sowie fehlende Projekte. Eingang ist im Katalog sichtbar, aber nicht als verwaltetes Projekt zuordenbar. Niemals Namen heuristisch zuordnen.

Jedes aktive Projekt kann nur einem aktiven Kontext gehören. Projektwechsel oder Reaktivierung einer Zuordnung benötigt aktuelle Sicherheitsbestätigung und serverseitige Prüfung. Eine Deaktivierung erhält Kontext, alte Zuordnung und lokale Referenzen; kein Todoist-Inhalt wird gelöscht oder verschoben. Name/Farbe eines bestehenden Kontextes können auch bei einem Verbindungsproblem geändert werden. Bei Revisionskonflikt neu laden, Änderungen prüfen und erneut speichern.

TermiHub-Instanzreferenz und Arbeitgeber-ID sind optionale, undurchsichtige lokale Vorbereitung. „Noch nicht verfügbar“ ist der tatsächliche Stand: keine TermiHub-Endpunkte und keine Netzwerkanfragen. Die Live-Integration folgt erst E9.

## Lesen und Ausfälle

Aufgaben öffnen, Kontext über sichtbare Pills wählen und „Aufgaben aktualisieren“. Jeder Kontext lädt ausschliesslich sein Projekt. Planungsdatum und Deadline stehen getrennt; Parentverweise führen zur vorhandenen Oberaufgabe in derselben Lesesicht. Kommentare werden bewusst lesend geladen. Die Auswahl bleibt über den nicht geheimen Kontext-URL-Parameter und dieselbe bewusste Browserpräferenz über Fokus, Aufgaben, Tagesplanung und Epics erhalten. Allgemeine Seiten und die mehrkontextfähige Morgenroutine ändern sie nicht stillschweigend. Eine entfernte oder deaktivierte Auswahl erfordert eine neue bewusste Wahl; kein Privat-Fallback.

Abgerufenes Datum zeigt den letzten vollständigen Stand. Nach fünf Minuten oder Verbindungsfehler wird der Cache als veraltet gekennzeichnet. Fehlende Aufgaben bleiben unbekannt, bis eine verlässliche externe Aussage vorliegt. Nicht aus einem verschwundenen Eintrag auf Erledigung schliessen. Bei Offline-/Auth-/Rate-Limit-/Timeoutfehlern bleiben bestehende Daten erhalten. Es gibt keinen automatischen Retry-Sturm; nach angezeigter Pause bewusst erneut prüfen.

In „Verbindungen & Probleme“ bedeutet „Geprüft“ weiterhin offen. Nur ein erfolgreicher passender Abruf markiert einen Fehler als behoben. Bei Wiederauftreten wird dasselbe Problem mit erhöhtem Zähler wieder geöffnet. Technische Details sind feste Fehlercodes ohne Token oder rohe API-Fehlermeldungen.

„Verbindung deaktivieren“ hält Abrufe an und bewahrt den verschlüsselten Token. „Token entfernen“ entfernt das Credential und entwertet die aktuelle Katalog-/Cachegeneration; historische Projektionen bleiben lokal erhalten, werden aber nicht mit einem neuen Todoist-Konto vermischt. Alle drei Integrationsänderungen verlangen Step-up. Ein Tokenwechsel benötigt anschliessend einen neuen Verbindungstest und gegebenenfalls bewusste Projektkorrekturen.

Lokale Speicherung: verschlüsselte Credentials, Kontextnamen/Farben/Referenzen, Projektkatalog, abgeleitete Task-Snapshots/Fingerprints/Aktualität und reduzierte Probleme. Todoist führt weiterhin Aufgabeninhalt, Priorität, Datum, Deadline, Hierarchie, Abschnitte und Kommentare. Kommentare werden in E2 nur auf Anforderung zum Browser geliefert; keine vollständige Kommentarhistorie in PostgreSQL.

E9.2: Aktuelle Aufgaben und historische/extern ungeklärte Nachweise sind getrennt. Historische Daten bleiben erhalten, ohne daraus aktuelle Aufgaben oder Schreibbefugnis abzuleiten. Kanban-Abschnitte werden pro ausdrücklich zugeordnetem Projekt in diesen Einstellungen geprüft und nur fehlende Namen bewusst ergänzt.

## E9.3 – Neue Einstellungsnavigation

Verbindung unter Einstellungen → Verbindungen einrichten. Ein Step-up-Fehler öffnet die bestehende Sicherheitsbestätigung als Dialog und erhält den Token. Passwort und einen neuen TOTP-Code bestätigen, Dialog schliessen, die erhaltene Aktion bewusst erneut auslösen. Keine automatische zweite Mutation.

Projekt und Kanban unter Kontexte & Projekte → Privat bzw. Arbeitgeber verwalten. «Arbeitgeber hinzufügen» befindet sich im Arbeitgeber-Tab; eine Neuerstellung aktiviert keinen anderen Arbeitskontext automatisch. TermiHub-Zuordnungen sind darunter erreichbar; andere Zuordnungen bleiben erhalten. Alle sechs Kontextfarben werden mit Farbvorschau angeboten.

## E9.4 – Anzeigenamen und technische Referenzen

Projektoptionen zeigen Namen. Gleichnamige Projekte sind unterscheidbar nummeriert; vor einer Zuordnung bei Bedarf Technische Projektzuordnung öffnen. Gespeichert wird weiterhin die unveränderte eindeutige ID, niemals der Name. Fehlende Referenzen bleiben als nicht verfügbar erkennbar und werden nicht automatisch ersetzt. Die Kontextfarbe hat weiterhin eine sichtbare Vorschau, aber keine zusätzliche Farbhilfe.
