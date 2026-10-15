# Morgenroutine und Review

Öffne nach der normalen Passwort-/TOTP-Anmeldung «Morgenroutine». Erst «Morgenroutine starten» legt den heutigen lokalen Routinetag an. Der Start ist kein Abschluss. Ein erneutes Öffnen lädt den gespeicherten Cursor und die bestätigten Eingaben. Navigation oder «Fortsetzen» bleibt revisionsgesichert; «Für jetzt pausieren» führt zum Fokus. Es gibt keine Pflichtquote und keine Gesamtzahl offener Todoist-Aufgaben im Mittelpunkt.

## Eingang und Kontexte

Es erscheint eine Eingangskarte gleichzeitig. Wähle das Zielprojekt bewusst; es gibt keine Vorauswahl. Auch zugängliche fremde Projekte sind zulässig. Bestätige die Zuordnung ausdrücklich oder lasse die Karte für später liegen. Endgültiges Löschen benötigt eine eigene Bestätigung und gegebenenfalls die bestehende Hierarchiefreigabe. Nach drei erfolgreichen bewussten Zuordnungen, Löschungen oder serverseitig gespeicherten Liegenlassen-Entscheidungen erscheint ein freiwilliger Hinweis; du kannst weiter sortieren. Fehlgeschlagen, ausstehend und unknown zählen nicht. Liegenlassen zählt gemäss bestätigter Auftraggeberentscheidung mit, sobald die lokale Entscheidung gespeichert ist. Es verändert die Todoist-Aufgabe nicht; idempotente Wiederholungen zählen nicht doppelt.

Der Eingang wird niemals analysiert oder automatisch klassifiziert. Erst eine nachgelesene bewusste Zuordnung in ein aktives verwaltetes Projekt eröffnet die bestehende E6-Analyse. Wähle danach Privat und beliebige aktive Arbeitgeber unabhängig von TermiHub. Inaktive Kontexte sind erkennbar. Abwählen entfernt keine gespeicherten Kontextdaten. Jeder Kontext hat eigene Review-, Klärungs- und Planungsstände.

## Rückblick und Fortschritt

Der erste Eintritt friert den letzten früheren bestätigten Kontextplan und dessen bestätigte Historienrevision als Quelle ein. Der letzte relevante Tag ist nicht automatisch gestern. Ältere Lücken werden weder zusammengeführt noch als erledigt oder nicht begonnen ausgelegt. Feedback zum selben Plan bleibt wiederverwendbar; unbekannte neue Rückmeldungen überschreiben keinen Nachweis stillschweigend.

Wähle Aufgaben für eine Sammelrückmeldung «Nicht begonnen» oder für einen bewusst bestätigten Abschluss. Ein Abschluss verwendet das bestehende E4-Journal und zeigt je Aufgabe den tatsächlichen Stand. Eine veränderte Wiederholungsinstanz wird nicht abgeschlossen. Fehlende Aufgaben bleiben unbekannt. Ein vorhandener verifizierter Abschluss darf wiederverwendet werden.

Für «Teilweise erledigt» öffne zuerst «Fortschritt dokumentieren», beschreibe das Erledigte in eigenen Worten und prüfe die Vorschläge im vorhandenen E6-Dialog. Jede Inhaltsänderung braucht eine eigene Auswahl. Der Originaltext bleibt im Entwurf; auch bei Fehlern oder abgelehnten Vorschlägen. Danach kann die lokale Teilrückmeldung mit diesem Entwurf bestätigt werden. Eine lokale Rückmeldung bedeutet keinen nachgewiesenen Todoist-Schreibschritt.

## Klärung, Tagesplan und Probleme

Klärungskandidaten stammen aus bestehenden E6-Analysen und verwalteten aktiven Aufgaben. «Ist klar» wird respektiert. Veraltete Planungsdaten sind keine Deadlines. Tatsächliche native Erstellzeit, vorhandene Deadline und belegter Klärungsbedarf dienen der Priorisierung; es gibt keine Pflichtanzahl.

«Aktuelle Tagesvorschau nach dem Review vorbereiten» aktualisiert den Kontext und verwendet E3–E5. Haupt-/Reserveordnung, Fokus und Bewusste Planbestätigung bleiben dieselben. Bereits bestätigte Pläne werden nicht ersetzt. «Planung abschliessen» verlangt einen tatsächlich bestätigten heutigen Kontextplan ohne offene Agendaoperationen. Offene externe Kontextoperationen verhindern eine vollständige Erfolgsanzeige.

Am Ende kannst du bekannte Probleme prüfen oder den Schritt offen lassen. Dieselbe zentrale Problemverwaltung zeigt Todoist-/Aufgaben-/Planungs-/Ollama-Probleme sowie vorhandene Auth-Wiederherstellungsereignisse und veraltete Worker-Heartbeats. «Geprüft» bedeutet nicht «behoben». Ein frischer Heartbeat ist ein passender Nachweis für den wieder erreichbaren Worker; das Prüfen allein löst nichts.

## Unterbrechung und Wiederaufnahme

- «Überspringen» verändert keine Aufgabe und bleibt «Übersprungen · weiterhin offen». Öffne den Schritt jederzeit erneut.
- Nach Reload oder Browserneustart erscheint der gespeicherte Stand. Ein neuer Kalendertag bekommt erst nach bewusstem Start eine eigene Routine; der alte Tag bleibt erhalten.
- Bei einer parallelen Änderung bleibt deine Auswahl sichtbar. Lade den gespeicherten Stand, prüfe die Unterschiede und wähle bewusst erneut. Eine alte Auswahl wird nicht automatisch auf eine neue Revision übertragen.
- Bei Todoist-/Ollama-Ausfall oder abgelaufener Sitzung bleiben bestätigte Daten und gespeicherte E6-Originaltexte erhalten. Neu anmelden und den betroffenen Schritt erneut öffnen. Andere unabhängige Schritte bleiben nutzbar.
- Bei ungeklärtem Abschluss zuerst dessen vorhandenen Operationsstand prüfen und bewusst fortsetzen. Kein erneutes blindes Abschliessen. Noch nicht übergebene Sammelentscheidungen werden als fortsetzbare Entscheidungen angeboten.
- Vor Migration und lokaler Aktualisierung verschlüsselt sichern; Wiederherstellung nur isoliert mit deaktiviertem Worker prüfen. [Backup-Runbook](backup-restore.md). Keine NAS-Anbindung in der Entwicklungsphase erforderlich; späteres Synology-Ziel bleibt konfigurierbar.

## Gemeinsame manuelle Abnahme E3–E7 (offen)

1. Mit dem separaten Testkonto anmelden; Privat und mindestens zwei synthetische Arbeitgeber zuordnen. E3-Fokus und unabhängige historische Pläne prüfen.
2. E4-Bearbeitung, Wartedetails, Hierarchie und Wiederholungsabschluss sowie E5-Reserveordnung/-rotation bewusst prüfen.
3. E6-Fortschritt, Einzelauswahl, «Ist klar», Ablehnung und Wiederaufnahme bei nicht erreichbarem LAN-Ollama prüfen.
4. Morgenroutine beginnen; Eingang ohne Vorauswahl, fremdes Zielprojekt, Liegenlassen und drei native Erfolge prüfen. Einen Schritt überspringen.
5. Mehrere ausgelassene Kontexttage vorbereiten: nur den jüngsten bestätigten früheren Kontextplan automatisch anbieten; ältere Lücken unverändert lassen. Teilrückmeldung und Sammelabschluss mit Teilerfolg prüfen.
6. Zwischen Kontexten wechseln, Browser schliessen und wieder öffnen. In zwei Browsern dieselbe Auswahl bearbeiten und den verständlichen Revisionskonflikt prüfen. Sitzung und Tageswechsel prüfen.
7. Tagesplan bewusst bestätigen; keinen bestätigten Plan ersetzen. Offene Operationen dürfen keinen vollständigen Routineerfolg erzeugen. Probleme als geprüft markieren und ihren weiterhin offenen technischen Zustand ansehen.

Diese Schritte sind noch nicht menschlich abgenommen. Die smartphoneoptimierte PWA folgt in E11; E8 wird nicht automatisch begonnen.


## TermiHub ab E9

Die bestehenden Schritte bleiben erhalten. Bei der Kontextwahl erscheint [Kalenderorientierung](termihub.md) mit Aktualität, Arbeitsfenstern und vorsichtiger Spanne. Arbeitszeiten dienen als Hinweis, keine automatische Aktivierung. Alle aktiven Arbeitgeber und Privat bleiben bewusst wählbar, auch ohne Daten oder bei Ausfall. Bereits gespeicherte Routineentscheidungen und bestätigte Pläne werden durch einen Refresh nicht ersetzt.
