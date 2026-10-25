# UX-034 / UX-035 / F-001 UX-Runde A – Verifikation

Ausgangspunkt: `develop` einschliesslich PR29–31 (`bdee837e0d76f7d7601e604e1c87742fcc41f004`). Branch `feat/ui-consistency-loading-ai-jobs`. Grundlage ist der ausdrückliche aktuelle Auftrag; [Audit](../design/ui-consistency-audit.md) und [Designsystem](../design/design-system.md#ux-034--ux-035--gemeinsame-react-primitives) dokumentieren die Konsolidierung. Die endgültigen Pflichtgates werden versionsgebunden vor Integration im PR geführt; ein laufender oder fehlgeschlagener Test ist kein bestandener Nachweis.

## Änderungen

Originale HeliosSphereLoader-Geometrie integriert, einschliesslich 32 Kurven/5200 ms, Originalprops, Reduced Motion und sauberem Lifecycle. Gemeinsame Buttonvarianten mit Ladezustand, gezieltem Adapter für geteilte Busy-Flags und Screenreader-Ankündigung. Native Input-/Textarea-/Select-/FormField-, Checkbox-/Switch-, Card-, Accordion-, Dialog- und Badge-/Status-Primitives. Breite Frontend-Übernahme bei erhaltenen Request-/Formular-/Entwurfsschutzabläufen; spezielle Aufgabenlisten und der gesicherte Editor behalten ihre geeigneten Strukturen.

KI-Details erhalten Ergebniskarten mit sicher lesbarem Markdown, unverändertem Kopieren und zugänglichen älteren Versionen. Nachbearbeitung steht separat mit breiter Eingabe und Einreichen darunter. Status verbindet Text, Symbol und Farbe; abgeschlossene Karten zeigen den Prompt und bleiben öffnbar, ohne Ergebnisvorschau. Die paginierte Owner-geprüfte Suche liest den vollständigen Originalprompt, kombiniert Status/Datum und behandelt Sonderzeichen wörtlich.

## Umfang und Erhalt

Keine Datenbankmigration, neue Abhängigkeit, Workeränderung oder externe Schreibpipeline. Die einzige Backendergänzung ist die angeforderte begrenzte Lesesuche. Authentifizierung, Modellkonfiguration, serielle Ausführung, Fragezyklen, Versionierung, E4-Journal, Todoist-Referenzabschluss, SearXNG und alle bestehenden Fachregeln bleiben erhalten. Keine produktiven Todoist-Aufgaben/Zugangsdaten in automatisierten Tests.

## Prüfungen und Abnahmenachweise

- Unit/UI: 364 Tests in 34 Dateien erfolgreich, einschliesslich Canvas-Geometrie, RAF-/Visibility-/Reduced-Motion-Lifecycle, normalem Disabled, gezieltem ActionButton, Hydrationsschutz und Erfolg/Fehler/Unknown/Partial. Die beschriftete Canvas-Statusrolle ist zusätzlich zur dekorativen Verwendung innerhalb eines Ladebuttons verfügbar.
- Vollständige PostgreSQL-Regression: 302 Tests in 16 Dateien erfolgreich, einschliesslich fünf neuer Fälle für vollständigen Originalprompt, Gross-/Kleinschreibung, wörtliche Sonderzeichen, kombinierte Filter/Datumssortierung, 20er-Pagination und Owner-/Session-Grenzen. Ausschliesslich getrennte synthetische `_test`-Datenbanken.
- Lint, Typprüfung, Web-/Worker-Produktionsbuild, Secretprüfung und Produktionsabhängigkeitsprüfung erfolgreich; keine bekannte Abhängigkeitsschwachstelle gemeldet.
- Die Browserregression umfasst alle bisherigen Fachfälle und den zusätzlichen Desktop-/Mobilablauf für Anlage, Loader-Geometrie im Button, Kontrast, reduzierte Bewegung, Switch-Abmessungen/Tastatur, Suche/Filter, Kopieren, Nachbearbeitung, Ergebnisversionen, bewussten Abschluss und weiterhin lesbare Details. Bestehende Assertions und Schutzfälle bleiben erhalten.
- Versionsgebundene Ergebnisse der vollständigen Browserregression, CI, CodeQL, Sonar ohne offene Befunde, exakten Image-/Secret-Scans und des isolierten Compose-Smokes werden im [PR32-Prüfprotokoll](https://github.com/biit-hub/helios/pull/32) geführt. Diese Gates sind verbindliche Voraussetzung für die Integration, auch bei grünem Teilcheck.

Die Originaldatei hat SHA-256 `e2a00404d374eb80568d4ade3afacdaad832d105554d1548cd5baeb0ecb894c4`; der normalisierte mathematische Zeichenausdruck stimmt überein (SHA-256 `342018b926c21a64430cfeaf6f01eac7002222bcee5103b6fcaef135c6e8cea4`). Die JSX-Statussemantik und sichere TypeScript-Ref-Aliase ändern keine Kurven, Phasen oder Zyklusparameter.

Synthetische Screenshots bleiben lokal. Die visuelle Nachprüfung umfasst Hauptansichten und Dialoge bei Desktop, 1024 Pixeln und Mobilgrössen; daraus wird keine vollständige externe WCAG-Abnahme abgeleitet. Die besondere native Aufgabenlisten-Kopfstruktur bleibt erhalten, anstatt ihre Informationen in einen unpassenden Standardtitel zu pressen.

## Kontrolliertes lokales Update

Erst nach sämtlichen finalen Gates und dem nachgewiesenen develop-Merge werden die exakt gescannten Images lokal übernommen. Der Ablauf wartet auf ruhende E4-/E6-/F-001-Arbeit, stoppt Web/Worker kontrolliert und erstellt eine frische verschlüsselte Datenbank- und Konfigurationssicherung. Die Sicherungen werden authentifiziert entschlüsselt, das Archivverzeichnis geprüft und die Konfiguration bytegleich verglichen; Klartext bleibt nur in kurzlebigen Puffern.

Es wird keine Migration ausgeführt. Alle 43 vorhandenen öffentlichen Tabellen werden vor dem Neustart auf unveränderte Zeilenzahl und Inhaltshashes geprüft; das 17-stufige Migrationsjournal bleibt identisch. Nach dem Neustart werden geschützte Fachdaten einschliesslich sämtlicher KI-Auftragstabellen, Credential-/Verbindungsreferenzen und Unknown-/Partial-Journale erneut verglichen. Image-IDs, Queue-Smoke, Bereitschaft, anonyme Zugriffssperren und der private Ollama-Endpunkt werden geprüft. Der konkrete Installationsnachweis gehört zum PR-Prüfprotokoll. Keine Datenvolumes werden gelöscht; vorhandene Images bleiben für einen kontrollierten Rückweg erhalten.

## Menschliche Nachtests und offene Grenzen

1. Einstellungen und Hauptansichten auf ruhige gemeinsame Rahmen, Abstände, Felder und umrandete Karten prüfen. Bestehende zweispaltige Kapitelwahl und kompakte Navigation bleiben erhalten.
2. Freiwillig / Spass und Ausgabe aktivieren mit Maus, Space und Touch bedienen; Checklisten und ausdrückliche Sicherheitsbestätigungen bleiben Checkboxen.
3. Kommentare, technische Details, SMART und Informationsabschnitte am Rand der gesamten Kopfzeile öffnen. Hover, Fokus und Chevron vergleichen.
4. Eigene synthetische Aufgabe im separaten Testkonto erstellen/bearbeiten, verschieben und kommentieren. Nur die ausgelöste Aktion animiert; Nachweis und Entwurfsschutz bleiben verbindlich. Unknown/Partial ausschliesslich im isolierten Fehlerbestand nachtesten.
5. Original-Sphäre bei normaler und reduzierter Bewegung ansehen. Fenster während der Anfrage verbergen und wieder anzeigen. Kein doppelter Loop und kein Spinner auf bloss deaktivierten Buttons.
6. Spontanen synthetischen KI-Auftrag anlegen. Die Anlage endet nach Bestätigung; Hintergrundstatus bleibt getrennt sichtbar. Ergebnis, Kopieren, Nachbearbeitung und alle Versionen prüfen. Bewussten Abschluss und die kompakte weiter öffnbare Karte prüfen.
7. Originalprompt mit anderer Gross-/Kleinschreibung und Teilbegriffen suchen, Status und Sortierung kombinieren, Nulltreffer und Zurücksetzen prüfen.
8. Bei 1024 und 390 Pixeln Text-/Canvas-Abstände, Dialogscrollen, Aktionsleisten und Fokus kontrollieren.

Die menschliche Design-/Funktionsabnahme bleibt offen. Die positive SearXNG-Liveabnahme und bereits offene berechtigungspflichtige Todoist-Liveprüfungen gehören weiterhin zu ihren eigenen Integrationsgrenzen. Kein main-Merge, Release, Docker-Hub-Push, Produktivdeployment oder E10.
