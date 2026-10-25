# UX-034 / UX-035 / F-001 UX-Runde A – Verifikation

Ausgangspunkt: `develop` einschliesslich PR29–31 (`bdee837e0d76f7d7601e604e1c87742fcc41f004`). Branch `feat/ui-consistency-loading-ai-jobs`. Grundlage ist der ausdrückliche aktuelle Auftrag; [Audit](../design/ui-consistency-audit.md) und [Designsystem](../design/design-system.md#ux-034--ux-035--gemeinsame-react-primitives) dokumentieren die Konsolidierung. Die endgültigen Pflichtgates werden versionsgebunden vor Integration im PR geführt; ein laufender oder fehlgeschlagener Test ist kein bestandener Nachweis.

## Änderungen

Originale HeliosSphereLoader-Geometrie integriert, einschliesslich 32 Kurven/5200 ms, Originalprops, Reduced Motion und sauberem Lifecycle. Gemeinsame Buttonvarianten mit Ladezustand, gezieltem Adapter für geteilte Busy-Flags und Screenreader-Ankündigung. Native Input-/Textarea-/Select-/FormField-, Checkbox-/Switch-, Card-, Accordion-, Dialog- und Badge-/Status-Primitives. Breite Frontend-Übernahme bei erhaltenen Request-/Formular-/Entwurfsschutzabläufen; spezielle Aufgabenlisten und der gesicherte Editor behalten ihre geeigneten Strukturen.

KI-Details erhalten Ergebniskarten mit sicher lesbarem Markdown, unverändertem Kopieren und zugänglichen älteren Versionen. Nachbearbeitung steht separat mit breiter Eingabe und Einreichen darunter. Status verbindet Text, Symbol und Farbe; abgeschlossene Karten zeigen den Prompt und bleiben öffnbar, ohne Ergebnisvorschau. Die paginierte Owner-geprüfte Suche liest den vollständigen Originalprompt, kombiniert Status/Datum und behandelt Sonderzeichen wörtlich.

## Umfang und Erhalt

Keine Datenbankmigration, neue Abhängigkeit, Workeränderung oder externe Schreibpipeline. Die einzige Backendergänzung ist die angeforderte begrenzte Lesesuche. Authentifizierung, Modellkonfiguration, serielle Ausführung, Fragezyklen, Versionierung, E4-Journal, Todoist-Referenzabschluss, SearXNG und alle bestehenden Fachregeln bleiben erhalten. Keine produktiven Todoist-Aufgaben/Zugangsdaten in automatisierten Tests.

## Prüfstand

- Unit/UI: 363 Tests in 34 Dateien erfolgreich, einschliesslich neuer Canvas-/Button-/Semantik- und KI-Darstellungsfälle. Originalzeichnung zusätzlich über normalisierten Syntaxbaum nachgewiesen; keine Geometrieänderung.
- Gezielte PostgreSQL-Verträge: 25 erfolgreiche Fälle, einschliesslich fünf neuer Such-/Scope-/Paginationfälle. Ausschliesslich separate synthetische `_test`-Datenbank.
- Vollständiger Web-/Workerbuild und Typprüfung erfolgreich; erneute Pflichtprüfung am finalen Stand bleibt verbindlich.
- Bestehende gezielte Browserfälle für Designansichten, Aufgabeneditor, Unknown/Partial und E9.6-Sammelsave: neun bestanden, drei bestehende mobile Doppelungen übersprungen. Der neue UI-Gesamttest ist noch in Bearbeitung und wird nicht als bestanden ausgegeben.
- Vollständige PostgreSQL-/Browserregression, Secret-/Dependency-Prüfung, exakte Imagescans, isolierter Compose-Smoke sowie CI/CodeQL/Sonar sind vor Integration verpflichtend. Konkrete finale Ergebnisse und Installationsnachweise werden im PR ergänzt.

Synthetische Screenshots bleiben lokal. Die gezielte visuelle Nachprüfung umfasst Desktop, 1024 Pixel und Mobilgrössen; daraus wird keine vollständige externe WCAG-Abnahme abgeleitet.

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
