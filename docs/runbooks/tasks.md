# Aufgabenverwaltung bedienen

Mit Passwort und TOTP anmelden. Unter Aufgaben einen Kontext wählen und den Todoist-Stand bewusst aktualisieren. Suche und Statusfilter reduzieren nur die vollständige Aufgabenübersicht, nicht den gespeicherten Tagesplan.

Der feste Button unten links öffnet die Formularerfassung. Ein Titel genügt. Ohne ausdrückliche Projektwahl wird im nativen Todoist-Eingang gespeichert; keine KI-Klassifikation. Für verwaltete Projekte optionale Abschnitte/Eltern bewusst wählen. Geplantes Datum/Uhrzeit und echte Deadline sind getrennt. Nur im Privatkontext gibt es fun. Kein vorgetäuschter KI-Erfassungsmodus.

Aufgabe öffnen lädt die aktuelle Quelle samt Kommentaren, Links und Hierarchie. Änderungen bewusst bestätigen, danach auf den externen Nachweis warten. Originaleingaben bleiben bei Fehlern erhalten und sind im Journal wiederauffindbar. Vor weiteren Aktionen die aktuelle Quelle bewusst neu laden; dadurch wird der angezeigte Entwurf ersetzt.

Warten erfasst Empfänger, Gegenstand und optionales Nachfassdatum in einem eigenen Beschreibungsabschnitt. Andere Beschreibungsinhalte bleiben unverändert. Nachfassdatum ist ein Hinweis; es wird keine weitere Aufgabe angelegt. Der Todoist-Abschnitt Wartet bleibt führend und verhindert eine Empfehlung als sofort ausführbarer Fokus.

Verschieben verwendet genau ein natives Ziel. Abschnitts-/Projektwechsel einer Unteraufgabe kann sie von ihrer Oberaufgabe lösen; Elternaktionen können alle angehängten Kinder betreffen. Helios zeigt die bekannten Betroffenen und verlangt ausdrückliche Zustimmung. Abbrechen erhält die Hierarchie. E3-Tagesauswahl verändert Hierarchien weiterhin nicht.

Abschluss und endgültige Löschung sind getrennt erkennbare Aktionen mit Bestätigung. Normaler Abschluss verschiebt zuerst nach Abgeschlossen und schliesst nativ ab. Bei Wiederholungen wird nach eindeutigem Terminwechsel nur die aktive Folgeinstanz nach Offen zurückverschoben. Unbekannte Ergebnisse nie als erledigt interpretieren.

## Fehler, Wiederaufnahme und manuelle Abnahme

- Konflikt: Eingaben behalten; aktuelle Todoist-Quelle prüfen und den Entwurf bewusst neu aufbauen. Keine alten Daten blind überschreiben.
- Fehlende Abschnitte: nur im angezeigten zugeordneten Projekt mit eigener Aktion einrichten. Mehrdeutige Namen zuerst direkt in Todoist klären.
- Todoist 403: Die Änderung ist mit den aktuellen Berechtigungen nicht erlaubt; Eingaben bleiben erhalten. Konto-, Projekt- und gegebenenfalls Tarifberechtigung prüfen. Aus HTTP 403 allein lässt sich der Tarif nicht sicher bestimmen. Das separate Free-Testkonto darf Deadline-Schreibversuche erwartungsgemäss ablehnen; Deadline-Erstellung/-Änderung/-Entfernung bleiben Helios-Funktionen. Die erfolgreiche Live-Abnahme mit erforderlichen Berechtigungen bleibt offen. Keine automatischen Tests mit produktiven Zugangsdaten oder Aufgaben.
- Ignorierte Felder: HTTP 200 ist kein Feldnachweis. Den zurückgelesenen Deadline-Wert prüfen; ein geplantes Datum ersetzt keine Deadline. [Deadline-Testregeln und offener Live-Nachweis](../integrations/todoist.md#verbindliche-testhinweise).
- Teilerfolg/unknown: Journal öffnen, erfolgreiche Schritte und Originaleingaben ansehen. Stand prüfen und bewusst fortsetzen liest zuerst nach. Fehlende Create-/Comment-ID bleibt ungeklärt; nicht blind ein zweites Mal anlegen.
- Rate Limit: frühesten Retryzeitpunkt abwarten. Neue Anmeldung bei Sitzungswiderruf; alte Operationen erhalten keine neue Berechtigung von selbst.
- Nach Erfolg Aufgaben aktualisieren. Native Kinder und bestätigte Tagesplanhistorie bleiben nachvollziehbar; betroffene noch ungeprüfte Projektionen sind unknown.
- Restore: Worker anhalten, RESTORE_MODE=true. Eingaben/Journal sichern, alte unklare Effekte gegen Todoist abgleichen; keine automatische Wiederholung aus einem Backup. Lokale verschlüsselte Backups genügen weiterhin für die Entwicklungsphase.

Für die spätere manuelle E4-Abnahme ausschliesslich eigene synthetische Aufgaben verwenden: Titel-only im Eingang, explizites Projekt und Felder, Bearbeiten/Feldlöschung, Elternnavigation/Kommentare, Wartedetails/Nachfassen/Filter, bewusster Move samt Hierarchiewarnung, normaler und wiederholender Abschluss, separate endgültige Löschung. Nach jeder Aktion wirklichen Todoist-Zustand und Journal prüfen. Kontextwechsel/Fokus dürfen bestätigte Pläne nicht umsortieren. Die manuelle E3-Abnahme ist weiterhin offen; E4 hebt sie nicht auf.

## Wiederholung bewusst ändern

Bei bestehenden Wiederholungen verlangt ein geändertes oder geleertes Planungsdatum zusätzlich die ausdrückliche Bestätigung „Wiederholung entfernen“ (`acknowledgeRecurrenceChange`). Alternativ einen vollständigen englischen Todoist-Wiederholungstext eingeben und die Datumsfelder unverändert lassen. Regel und normales Datum dürfen nicht gemeinsam gesendet werden. Die aktuelle native Regel wird angezeigt. GET muss die neue Regel nachweisen; blosse `is_recurring=true` genügt nicht. Ein ISO-Startdatum in `every week starting 2026-11-01` wird zusätzlich gegen das zurückgelesene Datum geprüft. Anders kanonisierte natürliche Texte bleiben konservativ ungeklärt und sind direkt in Todoist zu prüfen, statt einen falschen Erfolg zu melden. E3-Quellhashes ignorieren die neu eingelesenen menschlichen Felder `string`/`lang`, erhalten aber alle bisherigen optionalen Feldformen.

Private fun-Aufgaben oder mitbewegte fun-Kinder dürfen nicht in ein berufliches oder unzugeordnetes Projekt wechseln. Gewünschte Labeländerungen zuerst einzeln bewusst bestätigen; Helios entfernt keine Labels automatisch.

Ziel-/Checklisten-/Linkbearbeitung und manueller Epic-Abschluss: [E8-Bedienung und gemeinsame manuelle E3–E8-Abnahme](epics-smart-goals.md).
