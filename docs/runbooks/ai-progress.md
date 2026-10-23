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
- Ein bekannter fehlgeschlagener Schritt ohne externe Wirkung kann bewusst wieder zur Bearbeitung geöffnet werden; verifizierte Schritte bleiben erhalten. Unknown oder ungeklärter Teilerfolg darf diesen Weg nicht nehmen.
- Unknown nach Kommentar/Create: zuerst externe Wirkung prüfen und dieselbe E4-Operation bewusst fortsetzen. Keine neue identische Aufgabe oder Kommentarserie starten.
- Mehrdeutige Checkliste: vorhandene Beschreibung bewusst korrigieren; Helios formatiert sie nicht pauschal neu.
- Kontext/Token/Sitzung geändert: erneut anmelden beziehungsweise Zuordnung prüfen; alte Jobs verleihen keine Berechtigung.
- Technische Probleme erscheinen in der Problemübersicht. Geprüft ist weiterhin nicht gleich behoben.

## Spätere gemeinsame manuelle E3–E6-Abnahme

Manuelle E3-/E4-/E5-Abnahmen bleiben ausdrücklich offen. Automatisierte Tests ersetzen sie nicht. Zuerst [Plan-/Fokus-/Reserveablauf](planning.md) und [Aufgabenoperationen](tasks.md) mit dem getrennten Testkonto prüfen.

Anschliessend ausschliesslich synthetisch: Freitext erfassen, manuelle Werte priorisieren, keine autonome Anlage nachweisen, Projektwahl separat bestätigen und einmal ohne Projekt im Eingang speichern. Verwaltete klare/unklare Aufgabe ansehen, Ist klar bestätigen, unverändert erneut laden. Eingang/fremdes Projekt darf keine automatische Analyse erhalten. Fortschritt mit Kommentar und bestehender Checkliste auswählen; fremde Markdown-Abschnitte vergleichen, Restaufwand prüfen und Vorschläge ablehnen. Reload/Neustart mit offenem Entwurf testen. Kontrollierten KI-Ausfall sowie externen Quellenkonflikt prüfen; Teilerfolge dürfen nicht als vollständig gespeichert erscheinen. Wiederholungen und native Hierarchie nach E4 erneut prüfen. Kein vollständiger Aufgabenabschluss allein durch KI-Freitext.

E7/Morgenroutine verwendet für ihren Review denselben E6-Dialog. NAS-Ziel wird erst zur Produktivinstallation festgelegt, lokale verschlüsselte Backups bleiben für diese Entwicklung freigegeben.

## E9.2 – Laufzeit und Dialogentwurf

[Gemessene KI-Laufzeiten](../development/e9.2-ai-performance.md) trennen Queue, tatsächliche Ollama-Ausführung, Validierung und Anzeige. Ein wartender/laufender Entwurf ist kein Speichernachweis. Versteckte inaktive Panels pollen nicht; bestätigte laufende Speicherung bleibt beobachtet. Der ausdrücklich freigegebene [Schrittdialog](../design/e9.2-ai-dialog-proposal.md) gilt gemeinsam für Erfassung, Klärung, Fortschritt und E8-Anreicherung:

1. **Klären:** Angaben und Rückfragen prüfen; «Vorschlag erstellen» startet ausschliesslich die lokale KI. «Klärung beenden» beendet einen vorhandenen Entwurf, ohne die Aufgabe zu verändern.
2. **Vorschlag bearbeiten:** Jede Änderung einzeln bearbeiten, wählen oder ablehnen. Entwurfsentscheidungen können ohne Todoist-Schreibzugriff gespeichert und später wieder geöffnet werden. Die Projektwahl bei Erfassung bleibt separat ausdrücklich zu bestätigen.
3. **Änderungen bestätigen:** «Auswahl prüfen» zeigt die konkreten gewählten Werte. Erst «Ausgewählte Änderungen bewusst speichern» startet die vorhandene Journalsteuerung. Zurückgehen erhält Eingaben und Auswahl. Ändert sich die Quelle oder Entwurfsfassung, erneut prüfen.

Originaleingabe, Quellenbelege und technische Nachweise sind standardmässig eingeklappt. Abbrechen beziehungsweise Entwurfswechsel schützt ungespeicherte Eingaben mit einer Verwerfen-Bestätigung. Bei Timeout bleibt die Eingabe erhalten. Partial/Unknown bleibt als solcher sichtbar; nur den bestehenden Auftrag nachprüfen und bewusst fortsetzen, niemals aus der Schrittanzeige Erfolg ableiten. Ist-klar, Einzelpatch-, Quellen- und Unknown-Regeln bleiben verbindlich.
