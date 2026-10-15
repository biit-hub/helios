# KI-Entwürfe und Fortschritt bedienen

## E6 einrichten

1. Vorhandenen Ubuntu-Ollama-Server aus dem privaten LAN prüfen; auf Windows wird nichts installiert. URL und vorhandenes Modell nach [Ollama-Konfiguration](../integrations/ollama.md) in der privaten Umgebung setzen.
2. Konfiguration separat verschlüsselt sichern. Worker stoppen, additive Migration 0008 kontrolliert ausführen, passende E6-Images starten. Readiness E6 prüft Persistenz und Worker, keine Ollama-Erreichbarkeit.
3. Modell/Netz sowohl vom Windows-PC als auch aus dem Worker prüfen. Keine echten Inhalte für Benchmark, Screenshots oder öffentliche Fehlerberichte verwenden.

## Erfassen

Aufgabe erfassen öffnen, Formular oder KI-Modus wählen. Manuelle Formularwerte bleiben erhalten und haben Vorrang. Im KI-Modus Gedanken eingeben und Auswertung bewusst starten. Danach jeden Vorschlag prüfen, bearbeiten, auswählen oder ablehnen; Entscheidungen lassen sich ohne externen Write speichern. Erst Ausgewählte Änderungen bewusst speichern erzeugt die Aufgabe. Ein Projekt muss separat gewählt und ausdrücklich bestätigt werden; sonst gilt nativer Eingang. Die reine KI-Auswertung erzeugt keine Aufgabe.

## Klären und Fortschritt dokumentieren

Aufgabe öffnen → Aufgabenklärung zeigt vorhandene Hintergrundanalyse mit konkreten Fragen und Unsicherheit. Eine Antwort erzeugt einen neuen bearbeitbaren Entwurf. Ist klar bestätigt genau diese unveränderte Aufgabenfassung; Änderungen am Inhalt oder relevanten Kommentaren können neue Prüfung erfordern. Ein altes Planungsdatum wird gesondert angezeigt und ist keine Deadline.

Neben Aufgabe abschliessen steht Fortschritt dokumentieren. Zwischenstand eingeben, lokale KI starten und einzelne Kommentare, Checklistenpunkte oder Restminuten prüfen. Ein vorhandener Checkboxpunkt lässt sich gezielt wählen; fremde Markdown-Abschnitte bleiben erhalten. Eine neue Unteraufgabe braucht ein eigenständig planbares Ergebnis und ausdrückliche Auswahl. Kein automatischer Gesamtabschluss und keine erfundenen Fortschrittsprozente.

Vorschläge einzeln bearbeiten/ablehnen und Entscheidungen speichern. Beim Anwenden wird jeder externe Schritt nachgelesen. Annahme ist noch kein Erfolg. Bei Teilerfolg bleiben bestätigte Schritte und offene Änderungen sichtbar. Dialog kann geschlossen und über Gespeicherte Entwürfe wieder öffnen fortgesetzt werden; offener Fortschritt geht serverseitig nicht verloren.

## Fehler und Wiederaufnahme

- KI nicht verfügbar/Timeout/ungültige Antwort: Originaltext bleibt; Formular und bestehende Tagespläne weiterverwenden. Modell-/Netzkonfiguration prüfen, dann KI bewusst erneut versuchen.
- Quelle verändert: aktuellen Todoist-Inhalt prüfen und neuen Entwurf erstellen. Einen alten Beschreibungsvorschlag nicht blind übernehmen.
- Unknown nach Kommentar/Create: zuerst externe Wirkung prüfen und dieselbe E4-Operation bewusst fortsetzen. Keine neue identische Aufgabe oder Kommentarserie starten.
- Mehrdeutige Checkliste: vorhandene Beschreibung bewusst korrigieren; Helios formatiert sie nicht pauschal neu.
- Kontext/Token/Sitzung geändert: erneut anmelden beziehungsweise Zuordnung prüfen; alte Jobs verleihen keine Berechtigung.
- Technische Probleme erscheinen in der Problemübersicht. Geprüft ist weiterhin nicht gleich behoben.

## Spätere gemeinsame manuelle E3–E6-Abnahme

Manuelle E3-/E4-/E5-Abnahmen bleiben ausdrücklich offen. Automatisierte Tests ersetzen sie nicht. Zuerst [Plan-/Fokus-/Reserveablauf](planning.md) und [Aufgabenoperationen](tasks.md) mit dem getrennten Testkonto prüfen.

Anschliessend ausschliesslich synthetisch: Freitext erfassen, manuelle Werte priorisieren, keine autonome Anlage nachweisen, Projektwahl separat bestätigen und einmal ohne Projekt im Eingang speichern. Verwaltete klare/unklare Aufgabe ansehen, Ist klar bestätigen, unverändert erneut laden. Eingang/fremdes Projekt darf keine automatische Analyse erhalten. Fortschritt mit Kommentar und bestehender Checkliste auswählen; fremde Markdown-Abschnitte vergleichen, Restaufwand prüfen und Vorschläge ablehnen. Reload/Neustart mit offenem Entwurf testen. Kontrollierten KI-Ausfall sowie externen Quellenkonflikt prüfen; Teilerfolge dürfen nicht als vollständig gespeichert erscheinen. Wiederholungen und native Hierarchie nach E4 erneut prüfen. Kein vollständiger Aufgabenabschluss allein durch KI-Freitext.

E7/Morgenroutine ist nicht implementiert; ihr Review wird denselben E6-Dialog verwenden. NAS-Ziel wird erst zur Produktivinstallation festgelegt, lokale verschlüsselte Backups bleiben für diese Entwicklung freigegeben.
