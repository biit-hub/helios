# Helios – Designsystem

Stand E9.1, Phase A. **Bestandskatalog und Umsetzungsziel; noch keine vollzogene Konsolidierung.** Visuelle V2-Details werden erst nach tatsächlicher Einsicht festgelegt. Siehe [Audit](e9.1-ui-audit.md).

## Bestehende Grundlage

Systemschrift Arial/Helvetica/sans-serif; dunkler Text `#24303d`, sekundärer Text `#617083`, helle Kartenfläche `#fffef9`. Bestehende Karten: 22px Rundung, dezenter Schatten. Buttons und Felder derzeit überwiegend 10px. Diese Werte beschreiben den Bestand, keine neu behauptete V2-Vorgabe.

| Kontextpalette | Kontrastakzent | Weiche Fläche | Hintergrund | Rahmen  |
| -------------- | -------------- | ------------- | ----------- | ------- |
| Kupfer         | #9c4f18        | #f4ead7       | #f6f3ec     | #dfd3bf |
| Meerblau       | #2d5e75        | #e5eef2       | #f0f4f7     | #ccd8e0 |
| Waldgrün       | #365940        | #e8eddf       | #f0f4ec     | #ccd8c7 |
| Pflaume        | #754a72        | #f0e5ed       | #f6f0f4     | #e0ccda |
| Terrakotta     | #984d36        | #f4e8df       | #f9f0eb     | #e0cabe |
| Gold           | #835f1d        | #f6edda       | #f8f5ed     | #e2d7bd |

V2-Paletten früher verifiziert; dunkle Akzentvarianten für lesbare Texte/Buttons bereits im Bestand verwendet. Kontextnamen sind dynamisch. Keine feste Zuordnung einer Palette zu einem konkreten Arbeitgeber. Aktive Pills verwenden `aria-pressed` und sichtbare Umrandung; Farbe allein genügt nicht.

## Konsolidierungsziel für Phase B

- Gemeinsame semantische Tokens für Flächen, Rahmen, Fokus, Fehler, Status, Schatten sowie Abstände/Rundungen. Keine feste Kupferfläche in kontextspezifischen Reservekarten.
- Karten und Abschnittsüberschriften für Fokus, Routine, Plan, Aufgaben und Epics teilen dieselbe Skala; die Fokuskarte behält ihre prominente Rolle.
- Primäre Aktion gefüllt, nachrangige Aktionen ruhig umrandet; ausgewählter KI-/Formularmodus sichtbar und semantisch unterscheidbar. Keine bestehende Aktion entfernen.
- Alle Textfelder, Selects, Textareas und Datumfelder teilen Schrift, Rand, Padding, Oberfläche und Fokus. Checkboxen bleiben Checkboxen. Hilfen und Fehler bleiben ihrem Feld zugeordnet.
- Dialoge behalten Beschriftung, Fokusfang, Escape und Entwurfsverwerfen. Schmale Fenster und langer Inhalt bleiben bedienbar.
- Status mit verständlichem Text, Fehlermeldung mit erreichbarem nächsten Schritt; keine Erfolgsfarbe für ungeklärte externe Operationen.
- Vorhandene Symbolsprache vereinheitlichen; Symbole erhalten bei alleiniger Verwendung zugängliche Labels. Keine neue Icon-/UI-Abhängigkeit erforderlich.
- Einstellungsgruppen Verbindung, Kontexte und Kalenderquellen verständlich gliedern; Step-up bleibt Voraussetzung sensibler Aktionen.
- Reduzierte Animationen über `prefers-reduced-motion`; keine animierten Leistungsindikatoren. Tastaturfokus und Kontrast nach jeder Palette prüfen.

Konkrete neue Abstands-/Typografiewerte und Komponenten-API erst in Phase B anhand der zugänglichen Referenz festlegen. Backendverträge, Datenbank, Prompts und Fachregeln sind kein Bestandteil dieser Konsolidierung.
