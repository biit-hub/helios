# Tagesplanung und Fokus prüfen

1. In E3 lokal verschlüsselte Backups von Datenbank und separat geschützter Konfiguration/Schlüsseln erstellen und die Wiederherstellung mit isolierten synthetischen Daten prüfen (O-10, Entwicklungsfreigabe vom 14. Oktober 2026). Keine NAS-Anbindung erforderlich. Worker stoppen, additive Migration 0005 ausführen, passende Web-/Workerimages starten.
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

## E5 bedienen und später manuell abnehmen

Die manuellen E3-/E4-Abnahmen bleiben ausdrücklich aufgeschoben und offen. Technische Automatisierung ersetzt diese Abnahmen nicht. Für die spätere gemeinsame E3–E5-Abnahme ausschliesslich eigene synthetische Aufgaben im getrennten Testkonto verwenden.

1. Aufgaben im gewählten Kontext aktualisieren, Tagesvorschau prüfen und wie bisher bewusst bestätigen. Neue dringende Aufgaben dürfen den Plan nicht von selbst ändern.
2. Hauptaufgaben mit dem sichtbaren Ziehgriff sortieren. Tastatur: Griff fokussieren, Leertaste, Pfeile, Leertaste; Escape bricht ab. Alternativ Hoch-/Runterpfeile. Nach Reload dieselbe Reihenfolge prüfen, auch im zweiten Browser. Gleichzeitige Änderungen müssen einen klaren Konflikt erzeugen.
3. Aus Heute im Blick eine andere verfügbare Hauptaufgabe als Fokus wählen. Reihenfolge und Todoist-Abschnitte bleiben gleich. Kontext wechseln und zurückkehren, Browser neu öffnen; Fokus muss erhalten bleiben.
4. Aufgaben bewusst in die Reserve verschieben; Fokuskarte vorher durch eine andere Fokuswahl freigeben. Unter Tagesplan die Reserveverwaltung öffnen und dort per Griff oder Pfeil sortieren. Im Fokusbereich bleibt nur eine Reservekarte prominent.
5. Zwei Reservekarten durch Überspringen umlaufen lassen, optional Grund eingeben. Todoist darf sich dadurch nicht verändern. Bei einer einzigen ausführbaren Karte pausiert die Reserve, auch nach Reload; erst Reserve wieder aufnehmen zeigt sie erneut.
6. Reserveaufgabe abschliessen lädt vorher den aktuellen Todoist-Stand. Abschluss und bekannte Hierarchiewirkung ausdrücklich bestätigen. Bis zum echten Nachweis bleibt die Karte erhalten. Normale Aufgabe und Wiederholung getrennt prüfen; eine nachgewiesene Folgeinstanz bleibt in Offen und darf nicht versehentlich nochmals abgeschlossen werden.
7. Über Weitere Aufgabe bewusst aufnehmen die Aufgabenliste mit richtigem Kontext und Rückweg öffnen. Hauptauswahl oder Reserve wählen und genau eine geeignete Aufgabe bewusst aufnehmen. Vorhandene Reihenfolge erhalten, keine Duplikate oder Gesamtneuplanung. Unteraufgaben und Container mit Kindern behalten den nativen Abschnitt.
8. Fehler-/Unknown-/Konfliktfall im Journal prüfen. Kein falsches Erledigt, keine doppelte Anlage oder doppelter Close. Originaleingaben behalten, aktuellen Plan laden und bei erlaubter Wiederaufnahme zuerst nachlesen lassen.
9. Anderen Kontext und anderen Kalendertag separat prüfen. Historische Planstände sind lesbar; eine vergangene Tagesordnung lässt sich nicht nachträglich umsortieren.

Vor E5-Images Migration 0007 kontrolliert ausführen, nach verschlüsseltem Backup und gestopptem Worker. Sie ergänzt Spalten und Schutztrigger; alte bestätigte Quellen und Historien werden nicht migriert oder ersetzt. Readiness E5 prüft agenda und Beobachtungsfelder. Lokale verschlüsselte Sicherungen genügen weiterhin; Synology-Ziel erst zur Produktivinstallation konfigurieren.

## Kalenderorientierung ab E9

[TermiHub einrichten](termihub.md). Die Orientierung gilt für den ganzen gemeldeten Plantag, einschliesslich vergangener Zeit; kein ab jetzt freier Stundenplan. Frische/vollständige Daten unterstützen bewusste Vorschläge, stale/partial/unmapped bleiben ohne zuverlässiges Budget. Kalenderänderungen ersetzen keine bestehenden Pläne. Eine neue Vorschau erfordert weiterhin die ausdrückliche Aktion; manuelle Aufnahme bleibt verfügbar.

## E9.3 – Kompakte Orientierung

Fokus und Hauptauswahl stehen vor Kalenderdetails. «Arbeitszeit & Kalender» aufklappen, um Quellen und Zeitbudget zu prüfen. Bestätigte Einzelnachweise sind separat aufklappbar. Partial-/Unknown-Warnungen bleiben sichtbar; Aktualisieren verändert keinen bestätigten Plan automatisch.
