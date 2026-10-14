# Tagesplanung und Fokus prüfen

1. Vor Nutzung echter lokaler Pläne Datenbank und getrennte Schlüssel verschlüsselt extern sichern (O-10). Worker stoppen, additive Migration 0005 ausführen, passende Web-/Workerimages starten.
2. Mit Passwort und TOTP anmelden. Einen Kontext bewusst einem Nicht-Eingangsprojekt zuordnen. Den Abschnitt In Arbeit vorher selbst in Todoist einrichten, falls Abschnittswechsel gewünscht sind.
3. Unter Aufgaben den Kontext wählen und Aufgaben aktualisieren. Unter Fokus/Tagesplan die Tagesvorschau erstellen. Quellen dürfen höchstens fünf Minuten alt sein.
4. Aufgaben und Auswahlgründe prüfen, bei Bedarf einzelne Vorschläge abwählen. Eine leere Vorschau ist erlaubt, eine leere Bestätigung nicht.
5. Auswahl bewusst bestätigen. Bis zum tatsächlichen Nachweis bleibt Bestätigung läuft oder Teilweise bestätigt sichtbar. Unteraufgaben und Container mit aktiven Kindern behalten ihren Abschnitt; geeignete eigenständige Aufgaben wechseln nach In Arbeit.
6. Nach Erfolg eine andere Hauptaufgabe als Fokus wählen: Die Reihenfolge bleibt erhalten. Browser schliessen/neu öffnen, gegebenenfalls neu anmelden: Plan und Fokus kommen aus PostgreSQL.
7. Am selben Datum unabhängig Privat und weitere Arbeitgeber planen. Neue dringende Aufgaben ändern bestätigte Pläne nicht automatisch. Plantag ansehen zeigt vergangene Tage.

## Probleme

- Fehlenden/mehrdeutigen Abschnitt bewusst in Todoist korrigieren und danach Stand prüfen und bewusst fortsetzen. Helios erzeugt keine produktiven Abschnitte.
- Bei Timeout/unknown/Neustart keinen vollständigen Erfolg annehmen. Wiederaufnahme liest zuerst Todoist und wiederholt nachgewiesene Writes nicht.
- Angezeigte Rate-Limit-Pause abwarten.
- Bei geänderter Aufgabe, Projektzuordnung oder Token den Quellenkonflikt prüfen. Keine direkte SQL-Manipulation historischer Quellen. Eine automatische Reparatur teilweise extern wirksamer Pläne nach grundlegender Quellenänderung ist nicht Teil von E3.
- Bei widerrufener/abgelaufener Sitzung neu anmelden und bewusst fortsetzen. Alte Aufträge verleihen keine neue Berechtigung.
- Geprüft in der Problemübersicht markiert keine Behebung. Erst erfolgreicher Abschluss derselben Operation löst das Problem.

## Restore

Worker anhalten, RESTORE_MODE=true verwenden, Sitzungen widerrufen. Vor Freigabe alte queued/running/partial-Aufträge und ihre tatsächliche Cloudwirkung abgleichen. Keine blinde Wiederholung aus einem älteren Backup. Produktive Credentials sind niemals Fallback für automatisierte Tests.
