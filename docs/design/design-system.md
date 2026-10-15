# Helios – Designsystem

E9.1 verwendet die lokal verifizierte Sites-V2-Referenz (Version 2, Quellcommit `f01316c03f04ae64db38dac8b8ccd654d045ef50`). Der [Audit](e9.1-ui-audit.md) ordnet Referenz, vorherige Oberfläche und bewusste Weiterentwicklungen ein. Originalquellen und ZIP sind kein Bestandteil des öffentlichen Repositorys.

## Zuständigkeiten

- `packages/ui/src/index.tsx`: gemeinsame Marke mit CSS-Sonnenkugel, Kicker und Tagline.
- `packages/ui/src/icon.tsx`: kleine gemeinsame SVG-Linienicons; rein dekorativ mit `aria-hidden`, Beschriftungen stehen daneben.
- `apps/web/components/workbench-navigation.tsx`: bestehende Hauptnavigation und lokale Einstellungsanker. Keine neuen Fachrouten.
- `apps/web/app/design-system.css`: gemeinsame semantische Tokens und V2-Komposition über den bestehenden Featurestilen. `work.css` bleibt für featureeigene Zustände/Drag-Feedback zuständig, `identity.css` für Authformulare.
- Fachkomponenten behalten ihre State-/Request-/Bestätigungslogik. Layoutwrapper in Agenda und Routine gliedern vorhandene Abschnitte.

## Farben und Kontexte

| Palette    | Kontrastakzent | Weiche Fläche | Hintergrund | Rahmen  |
| ---------- | -------------- | ------------- | ----------- | ------- |
| Kupfer     | #9c4f18        | #f4ead7       | #f6f3ec     | #dfd3bf |
| Meerblau   | #2d5e75        | #e5eef2       | #f0f4f7     | #ccd8e0 |
| Waldgrün   | #365940        | #e8eddf       | #f0f4ec     | #ccd8c7 |
| Pflaume    | #754a72        | #f0e5ed       | #f6f0f4     | #e0ccda |
| Terrakotta | #984d36        | #f4e8df       | #f9f0eb     | #e0cabe |
| Gold       | #835f1d        | #f6edda       | #f8f5ed     | #e2d7bd |

Bestehende sechs V2-Paletten bleiben erhalten. Dunkle Akzentvarianten dienen lesbaren Texten und gefüllten Aktionen. `--surface` ist #fffef9, `--text` #24303d, `--muted` #617083. `--line` und `--ink` verbinden ältere Featurestile mit den gemeinsamen semantischen Farben. Reserve, Felder, Status und Karten verwenden die aktive Palette; echte Fehler haben unabhängig davon eine eigene rote Fläche mit erklärendem Text.

Kontextnamen sind dynamisch. Farbe ist keine Arbeitgeberkennung und kein alleiniger Zustand: Pills haben einen Namen, `aria-pressed` und eine aktive Einfassung. Tastaturfokus bleibt zusätzlich zur Auswahlmarkierung sichtbar.

## Typografie, Abstände und Flächen

Trebuchet MS / Segoe UI / sans-serif wie V2, ohne externe Schriftabfragen. Seitenüberschrift 28–40px, Fokusaufgabe 25–34px, Abschnitt 24px, kompakte Abschnittsköpfe 20px, Aufgabenüberschrift 15–18px, Hilfstext 12px. Inhalt bleibt skalierbar; keine feste Seitenhöhe.

Abstandstokens: 4, 8, 12, 16, 20, 24 und 32px. Karten verwenden überwiegend 24px Innenabstand und 20px Abstand zueinander. `--radius-card` 24px, `--radius-field` 14px, `--radius-pill` 999px. `--shadow-card` ist ein dezenter 18px/50px-Schatten mit geringer Deckkraft. Maximal 1360px Shellbreite, 28px Seitenrand, schmal 20px.

## Komponenten und Zustände

- Karten: helle Oberfläche, ein gemeinsamer Rahmen und Schatten. Fokuskarte mit feinem Kontextakzent am oberen Rand. Keine Leistungs-/Auslastungsanzeige.
- Aktionen: gefüllter Kontrastakzent für die zentrale Aktion, ruhige umrandete Nebenaktionen. Gefüllte Fokusverknüpfung öffnet den bestehenden Aufgabenworkflow. Keine neue Schreibpipeline.
- Navigation: abgerundete horizontale Leiste, beschriftete Linienicons, aktiver Eintrag über `aria-current`. Vorhandener Sicherheitszugang bleibt erhalten. Kontext-Pills bleiben sichtbar.
- Formulare: Textfelder, Selects, Textareas und Datumfelder teilen Schrift, Fläche, Rand, Mindesthöhe und Fokus. Checkboxen und Radiobuttons behalten ihre native Semantik. TermiHub-Legenden ordnen Verbindung, Abruf, Arbeitsorganisationen und Kalenderquellen.
- Dialoge: maximal 860px Breite und Viewporthöhe minus 48px, eigener Scrollbereich und ruhiger Hintergrund. Der bestehende Fokusfang, Escape und explizites Entwurfsverwerfen bleiben erhalten. Formular-/KI-Auswahl erhält eine sichtbar aktive Fläche.
- Hinweise: verständlicher Text und vorhandene Status-/Alertrollen. Ungeklärte externe Operationen werden weiterhin als ungeklärt gezeigt. Fehlende Eingaben bleiben erhalten. Leere Zustände laden ohne Druck zur bewussten nächsten Aktion ein.

## Komposition und Zugänglichkeit

Ab 1151px: Fokus links, Heute-im-Blick/Reserve rechts. Bei kleineren Desktopfenstern werden diese Abschnitte in Lesereihenfolge gestapelt. Tagesordnung zeigt Hauptauswahl und Reserve nebeneinander; ab 800px darunter. Routine nutzt eine vorhandene Schrittleiste neben dem Inhalt, bei kleineren Breiten darüber. Alle vorhandenen Schritte und Zustände bleiben erhalten.

Buttons und Felder haben in der Regel mindestens 44px Höhe; Kontext-Pills mindestens 40px, Erfassung 52px. Der feste Erfassungsbutton bleibt unten links. Zeilen und Aktionen dürfen umbrechen. Der Link «Zum Inhalt» ist beim Tastaturfokus sichtbar und führt zum fokussierbaren Hauptinhalt. Fokusmarkierung verwendet 3px Akzent plus Abstand; Auswahlmarkierung ersetzt sie nicht. Bei `prefers-reduced-motion` entfallen neue Übergänge/Animationen.

E11 bleibt für die vollständige mobile PWA zuständig. E9.1 führt weder eine neue Navigation noch eine Zeitblockplanung ein. Sicherheit, Step-up, Termine, Hierarchie und alle Bestätigungsregeln bleiben Sache der bestehenden E1–E9-Funktionen.
