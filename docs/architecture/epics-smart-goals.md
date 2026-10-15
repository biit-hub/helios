# E8 – Native Epics und SMART-Ziele

Stand: 15. Oktober 2026. Todoist führt Aufgaben, Hierarchie, Status, Labels, Kommentare und Beschreibungen. Ein Epic ist eine normale Aufgabe mit Label `epic`. Ziel und Checkliste stehen menschenlesbar unter genau einem `## Ziel` beziehungsweise `## Checkliste`. Keine zweite kanonische Epic-, Ziel- oder Checklisten-Tabelle.

## Architekturentscheid F1: Trennen oder Abbrechen

Ausdrückliche Entscheidung des Auftraggebers vom 15. Oktober 2026 nach isolierten Live-Verträgen: Bei offenen Unteraufgaben gibt es ausschliesslich **bewusst trennen und danach Epic abschliessen** oder **abbrechen ohne neue Änderung**. Der ursprünglich vorgesehene Behaltenpfad entfällt. Todoist schliesst beim Parent-Abschluss Kinder und Enkel mit ab; Wiederöffnen eines Kindes öffnet den Parent wieder. Keine lokale Sonderwahrheit als Ersatz.

Vor dem Befehl zeigt Helios sämtliche betroffenen offenen Nachkommen und die Auswirkungen. Direkte offene Kinder werden im selben Projekt eigenständige Hauptaufgaben ohne Abschnitt; deren Nachkommen bleiben angehängt. IDs, Inhalte, Datumsangaben, Labels und Kommentare bleiben erhalten. Bestehende Plan-/Journalreferenzen werden nicht umgeschrieben. Geschlossene historische Kinder bleiben am Epic. Keine Kopien, stillen Zusatzabschlüsse oder automatische Aufnahme in bestätigte Tagespläne.

Der bestehende E4-Worker persistiert jeden Trennversuch vor dem Write. Danach werden Einzelaufgaben, Teilbäume und Kommentare nachgelesen. Erst wenn alle ursprünglich offenen Teilbäume getrennt nachgewiesen sind und keine neuen Kinder erschienen sind, darf das Epic nach Abgeschlossen verschoben und nativ geschlossen werden. Fehler, Teilerfolg oder unbekannte Wirkung stoppen den aktuellen Ablauf. Unbekannte Writes werden nicht blind erneut gesendet. Eine spätere bewusste Journalfortsetzung prüft zuerst den nativen Nachweis und verbleibende Quellen. Teilwirkungen lassen sich nicht atomar zurückrollen.

Ein wiederholendes Epic kann keinen dauerhaften nativen Abschluss nachweisen: E4 würde eine neue offene Instanz erzeugen. Deshalb zunächst die Wiederholung im vorhandenen Formular ausdrücklich ändern/entfernen oder abbrechen. Keine stille Regeländerung.

Kontoidentität und Testprojekt wurden vor den Live-Verträgen erneut geprüft. Nur eigene synthetische Objekte angelegt und vollständig bereinigt. [Prüfbericht](../development/e8-verification.md).

## Markdown und Links

Der gemeinsame Markdown-AST bestimmt Quellbereiche. Ziel-, Checklisten- und Linkaktionen nutzen dasselbe E4-Journal. Fremde Abschnitte bleiben erhalten; unveränderte Checklistenpunkte behalten Bullet-/Checkboxformatierung auch beim Sortieren. Doppelte Abschnitte, fremde/verschachtelte Listeninhalte, doppelte Punkte und mehrdeutige Links erzeugen Konflikte. Vorschau und Bestätigung sind an den Quellenfingerprint gebunden.

Links erscheinen als Text/Anker ohne HTML-Ausführung. HTTP, HTTPS und Obsidian-open/advanced-uri sind erlaubt, eingebettete Zugangsdaten und gefährliche Protokolle gesperrt. Keine automatische Abfrage verlinkter Inhalte. Notion ist ein gewöhnlicher HTTPS-Link, kein Dokumentenimport.

## Abgeleitete KI-Daten

Die E6-Entwürfe erhalten smart, epic und decomposition sowie einen gezielten goal-Patch. Originaltext, Modellgewichtnachweis, Prompt-/Schemaversion, Quellenfingerprint und Einzelentscheidung bleiben erhalten. Kein neuer Writer. SMART trennt fünf Bestandteile, Belege und Fragen; unbekannter Termin bleibt offen. Keine erfundene Deadline, Akzeptanz oder Ressourcen. Offensichtlich unbelegte Belege/Zahlen werden abgewiesen; menschliche Prüfung bleibt erforderlich.

Epic-Verständnis enthält Aufgabenbeiträge, ausdrücklich bekannte Abhängigkeiten und nächste Schritte mit IDs und Belegen. Einschätzungen, frische native Abschlüsse und unbekannte Aufgaben werden getrennt gezeigt. Keine Zielquote aus Kinderzahlen oder Abwesenheit. Die vorhandene Entwurfspersistenz dient als versionierter abgeleiteter Cache. Quellen-/Kommentar-/Hierarchieänderungen machen ihn veraltet. Revisionsgeschützte Benutzerkorrekturen in ai_task_signals sind vorrangig und werden auch untergeordneten Analysen mitgegeben. Kein Kontext-/Eingangsübergriff.

Kleine Schritte gehören in die Checkliste; unabhängige Ergebnisse können native Kinder werden. Keine starre Aufwandsschwelle. Vorhandene Checkliste und Kinder werden einbezogen; wortgleiche Duplikate verworfen. Jeder Vorschlag bleibt einzeln prüfbar.

Migration 0010 ergänzt ausschliesslich epic_correction und correction_revision in ai_task_signals; weiterhin 31 Tabellen. E6-Aufbewahrung bleibt bestehen: erledigte/abgelehnte Entwürfe nach 30 Tagen löschen, offene/fehlgeschlagene erhalten. Lokale verschlüsselte Backups mit isolierter Restore-Probe genügen weiterhin.
