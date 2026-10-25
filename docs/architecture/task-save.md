# E9.6 – Gemeinsames Speichern einer Aufgabe

Der zentrale Speichervorgang fasst die expliziten Grund- und Dokumententwürfe zusammen. Normale Aufgaben bleiben Todoist-führend. Weder eine zweite Aufgabenwahrheit noch eine zweite Schreibpipeline oder neue Tabelle wird eingeführt.

## Vertrag und Bestätigung

`POST /api/tasks/preview` liest mit denselben aktiven MFA-/Origin-/Grössen-/Frist-/Kontextguards die aktuelle Aufgabe. `contextId`, `taskId`, Quellenfingerprint, geänderte `fields`, begrenzte `documents` und gegebenenfalls die Wiederholungsentfernung werden geprüft. Die Antwort enthält Quelle und vollständig serverseitig abgeleitete Felder. HTTP 200 bestätigt nur diese schreibfreie Vorschau.

Nach menschlicher Bestätigung wird ein gewöhnliches E4-`update` mit ursprünglicher Basis, originalen Eingaben, Dokumentänderungen und stabilem Idempotenzschlüssel angenommen. Das additive optionale Feld `documents` akzeptiert bestehende E8-Ziel-/Checklisten-/Linkänderungen ausschliesslich für `update`; alte Kommandos bleiben kompatibel. HTTP 202 bleibt auf die persistente Journalaufnahme beschränkt.

An Annahme und Worker-Ausführung wird derselbe AST-basierte Ableiter verwendet. Er erhält unabhängiges Markdown und Formatierungen, weist Mehrdeutigkeit, unsichere Links, Grössenüberschreitungen, doppelte Abschnittsänderungen und widersprüchliche manuelle/strukturierte Änderungen ab. Wiederholung, Labels, Hierarchie und Kontext behalten ihre bisherigen Prüfungen. Ein Dokumententwurf mit anderer geladener Basis wird nicht still mit dem Grundformular vermischt.

## Eine externe Operation, nachvollziehbare Teilwirkung

Der vorhandene Worker erzeugt genau einen nativen Aufgabenpatch mit den geänderten Grundfeldern und der vollständig abgeleiteten Beschreibung. Die bestehende vor dem Senden persistierte Request-ID, Quellkontrolle, Sitzung/Intent und der Workerlock bleiben verbindlich. Es entsteht keine clientseitige Kette unabhängig neu gestarteter Schreiboperationen.

Ein HTTP-Erfolg reicht nicht: E9.4 vergleicht alle bestätigten und unbestätigten Felder. Bei abweichender Beschreibung sind auch Ziel/Checkliste/Links insgesamt nicht als erfolgreich nachgewiesen anzusehen. Unknown/Partial bewahren Eingaben und Pending-Nachweis; bewusstes Fortsetzen liest zunächst nach und sendet einen ungeklärten Schritt nicht erneut. Verlorene/unlesbare Submit-Antworten sperren eine neue Mutation und erlauben ausschliesslich den Abgleich des ursprünglichen Journalschlüssels. Fehlende Treffer beweisen keinen Fehlschlag.

Nach `succeeded` verwendet die Oberfläche das bestehende bestätigte Aufgabenereignis, liest die Liste neu und schliesst die Bearbeitung. Keine Veränderung bestätigter Tagesplanhistorien und keine automatische Datums-/Daueränderung.

## Abgrenzung

Abgeleitete Epic-Verständniskorrekturen und KI-Einzelpatchfreigaben behalten ihre eigenen E8-/E6-Verträge. Die Einzel-Dokumentvorschau ausserhalb des zentralen Aufgabeneditors erscheint ebenfalls als kompakter Dialog. Arbeitspaket F-001 beginnt erst nach erfolgreichem E9.6-Abschluss; E10 bleibt die getrennte Lernfähigkeits-Etappe.
