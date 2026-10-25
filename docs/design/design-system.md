# Helios – Designsystem

E9.1 verwendet die lokal verifizierte Sites-V2-Referenz (Version 2, Quellcommit `f01316c03f04ae64db38dac8b8ccd654d045ef50`). Der [Audit](e9.1-ui-audit.md) ordnet Referenz, vorherige Oberfläche und bewusste Weiterentwicklungen ein. Originalquellen und ZIP sind kein Bestandteil des öffentlichen Repositorys.

## Zuständigkeiten

- `packages/ui/src/index.tsx`: gemeinsame Marke mit CSS-Sonnenkugel, Kicker und Tagline.
- `packages/ui/src/icon.tsx`: kleine gemeinsame SVG-Linienicons; rein dekorativ mit `aria-hidden`, Beschriftungen stehen daneben.
- `apps/web/components/workbench-navigation.tsx`: kompakte Hauptnavigation und Einstellungs-Kapitelwahl; E9.3 ergänzt die geschützte Präsentationsroute /problems mit vorhandenen Daten.
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

## E9.2 – gezielte Stabilisierung

Gemeinsame Icons verwenden jetzt das etablierte [Lucide-React-System](https://lucide.dev/guide/packages/lucide-react), exakt gepinnt, benannte Importe, 18px und 1,8px Strichstärke. Rein dekorative Icons sind aria-hidden; Text beziehungsweise explizite Aktionslabels bleiben erhalten. Navigation, Erfassung, Öffnen, Sortierpfeile und Labelauswahl teilen dieses System.

Bestehende Navigation ist sichtbar in aktiven Kontext und allgemeine Ansichten gruppiert, ohne neue Hauptziele. Kopfbereich zeigt die zentrale Kontextwahl; Routinecursor und allgemeine Einstellungen verändern sie nicht. Kürzere Standardtexte, maximal 34px Hauptüberschrift und gezielt 20px Einstellungskarten/16px Abschnittsabstände. Body-Schrift und Sicherheits-/Bestätigungshinweise bleiben lesbar.

Abbrechen schützt ungespeicherte Eingaben. Labels verwenden eine Tastatur-/Maus-Mehrfachauswahl mit entfernbarem Chip; neue Labels werden nicht erzeugt. Kanban liegt bei der jeweiligen Projektzuordnung. Der am 23.10.2026 ausdrücklich [freigegebene KI-Dialog](e9.2-ai-dialog-proposal.md) verwendet drei Schritte mit sichtbarer aktueller Stufe. «Vorschlag erstellen» ist die Hauptaktion der Klärung; die beendende Aktion heisst dort «Klärung beenden». Im Bearbeitungsschritt bleiben Einzelwahl, Texte und Ablehnung erhalten. «Auswahl prüfen» führt ohne Todoist-Schreibzugriff zur separaten Bestätigung. Originale, Quellenbelege und technische Nachweise sind standardmässig eingeklappt. Kompaktere Patchkarten und umbrechende Aktionszeilen erhalten die Grundschrift. Die Testzustandsnavigation des Prototyps ist nicht Bestandteil der Anwendung.

## E9.3 – Bestätigte Übernahme

Der separat visuell freigegebene E9.3-Prototyp konkretisiert V2. Seine acht Lieferprüfsummen wurden vor der Übernahme geprüft; Originalquellen und synthetische Anwendung verbleiben ausserhalb dieses Repositorys. Fachkomponenten werden weiterverwendet.

- `ux-redesign.css` komponiert die bestehenden Tokens: warme orange Grundgestaltung auf allen Ansichten; die sechs vorhandenen Paletten kennzeichnen Kontext-Pills und Farbvorschauen. Allgemeine Ansichten erhalten keine Kontext-Hintergrundfarbe.
- 78px-Kopfzeile mit Marke und zusammenhängender Navigation; 218px-Seitenleiste mit Kontexten und verfügbaren Aktionen. Keine Auswahl-Häkchen; Namen, Farbe, Rahmen und `aria-pressed` kennzeichnen die Auswahl.
- Kleine Fenster stapeln die Seitenleiste oberhalb des Inhalts; die Navigation scrollt innerhalb ihrer eigenen Zeile. Zweispaltige Einstellungen wechseln auf eine Spalte. Fokus/Hauptauswahl bleiben in sinnvoller Lesereihenfolge.
- Umrandete Karten, kompakte Zeilen und native Details für Informationsstufen. Bearbeiten ist ausdrücklich. Planung und zusätzliche Bearbeitungsaktionen sind im echten Formular aufklappbar; sämtliche Fachaktionen bleiben vorhanden.
- `InfoTip` bietet Fokus, Maus und Tap sowie Escape. `UiDialog` verwendet native Modalität, Fokus-Rückgabe und gesperrtes Schliessen während einer laufenden Bestätigung. Sicherheitswarnungen und ungeklärte Mutationsergebnisse bleiben sichtbar.
- `/problems` ist eine neue geschützte Präsentationsroute. Sie verwendet bestehende Problem- und Operationsdaten; kein weiteres Journal. Sicherheit bleibt in den Einstellungen, die bisherige Sicherheits-URL funktioniert weiter.

Abweichungen und Abnahmegrenzen: [E9.3-Verifikation](../development/e9.3-verification.md).

## E9.4 – Gezielter Feinschliff

Keine neue Gestaltung: umrandete Karten, warme Palette, feste Seitenleiste und zweispaltige Einstellungen bleiben. Rechts steht das heutige Zurich-Datum als dd.mm.yyyy; der ausgewählte Plantag bleibt eine eigene Steuerung. Die redundante Kontextzeile entfällt. Nur die Farbhilfe wird entfernt; Farbvorschau und gemeinsame Labelabstände bleiben. Fortschritt verwendet eine kurze Suchliste mit begrenzter Höhe, Listensemantik und sichtbarem Tastaturfokus. Gleichnamige Quellen erhalten unterscheidbare Namen, IDs stehen in technischen Details. Die Tagesauswahl hat zwei klar gestaltete Aktionen mit gemeinsamer Mindesthöhe und 12px Abstand. Feldnachweise und Unknown-Warnungen bleiben sichtbar. [Prüfbericht](../development/e9.4-verification.md).

## E9.5 – Aufgabeninformationen und Aktionen

Die bestehende warme Gestaltung bleibt. `task-detail.css` ist auf Aufgabenkomponenten begrenzt: responsive Eigenschaftsfelder, eigenständiger Beschreibungsbereich, native Accordions mit durchgehendem Header/Chevron sowie getrennt scrollender Formularinhalt und dauerhaft sichtbare untere Leiste. Auf kleinen Fenstern umbrechende Icon-Buttons verdecken keine Felder. Der private fun-Schalter ist eine native Checkbox mit Switch-Semantik und sichtbarem Tastaturfokus. Abschluss ist eine normale bestätigte Aktion; Löschen besitzt einen eigenen kontrastreichen Gefahrenbutton und Dialog. Technischer Quell-Reload bleibt sekundär im Detailsbereich und schützt offene Eingaben. [Verifikation](../development/e9.5-verification.md).

## UX-034 / UX-035 – Gemeinsame React-Primitives

Die aktuelle Konsolidierung führt das bestätigte E9.3–E9.6-Bild weiter. Die [Audit-Matrix](ui-consistency-audit.md) hält Ausgangsbefunde und Zuständigkeiten fest. Keine neue UI-Bibliothek und keine andere Fach- oder Schreibpipeline.

### Komponenten und Zuständigkeiten

Alle Primitives werden aus `@helios/ui` importiert. Neue Funktionen sollen diese Bausteine wiederverwenden; native HTML-Semantik, Formularwerte, Eventhandler und Refs bleiben erhalten.

| Komponente                                 | Verwendung                                                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                                   | Primär-, Sekundär-, Gefahren- und Icon-Aktionen; optional kontrollierter Ladezustand                                                    |
| `ActionButton`                             | Dünner Adapter desselben Buttons für vorhandene gemeinsame Busy-Flags; nur die tatsächlich aktivierte Aktion animiert                   |
| `Input`, `Textarea`, `Select`, `FormField` | Native Felder mit einheitlichen Klassen; Labels weiterhin explizit oder einschliessend zuordnen                                         |
| `Switch`                                   | Binäre Einstellungen; insbesondere Freiwillig / Spass, Kontext aktiv und KI-Ausgabe aktivieren                                          |
| `Checkbox`                                 | Checklisten, Mehrfachauswahl und ausdrückliche Sicherheitsbestätigungen                                                                 |
| `Accordion`                                | Natives details/summary, gemeinsamer Chevron, voller Header, Fokus/Hover und eingerückter Inhalt                                        |
| `Card`                                     | Umrandete Fläche mit passendem semantischem Element über `as`                                                                           |
| `Badge`, `StatusMessage`                   | Beschriftete Zustände, optionale Symbole beziehungsweise Status-/Fehlertexte; Farbe nie allein                                          |
| `Dialog`, `DialogSurface`                  | Gemeinsame Modaloberfläche; `DialogSurface` erhält den vorhandenen Fokusfang und die feste Aktionsleiste des speziellen Aufgabeneditors |
| `HeliosSphereLoader`                       | Ausschliesslich die bereitgestellte Originalanimation mit unveränderter Zeichengeometrie                                                |

`TaskAccordion` ist nur noch ein kompatibler Adapter des gemeinsamen Accordion. Native Toggle-Ereignisse aus verschachtelten Details werden nicht als erneutes Öffnen des Elternabschnitts behandelt. Besondere Aufgabenlisten behalten ihren fachlich passenden Kartenkopf; Klickfläche, Chevron, Hover und Fokus folgen denselben Regeln. Noch ungeklärte Operationsnachweise bleiben unmittelbar sichtbar und werden nicht hinter einem geschlossenen Erfolgs-Accordion versteckt.

### Buttonvarianten und Loading-API

```tsx
import { Button } from "@helios/ui";

<Button
  type="submit"
  loading={isSaving}
  loadingText="Aufgabe wird gespeichert …"
>
  Speichern
</Button>
<Button type="button" variant="secondary">Abbrechen</Button>
<Button type="button" variant="danger">Aufgabe löschen</Button>
```

Icon-Buttons verwenden `variant="icon"`, ein vorhandenes dekoratives `Icon` und ein eindeutiges `aria-label`. Neue Buttons in Formularen erhalten einen bewussten `type`.

Ein Ladebutton zeigt die originale 24-Pixel-Sphäre, konkreten lesbaren Text, `disabled` und `aria-busy`. Die höfliche Live-Region liegt ausserhalb des busy-Bereichs. Der hellere Ladehintergrund behält volle Deckkraft und kontrastreiche Schrift. Gewöhnliches `disabled` zeichnet keinen Canvas.

Besteht bereits ein gemeinsames Busy-Flag für mehrere Aktionen, verwendet `ActionButton busy={busy}` denselben Button und merkt nur die aktivierte Schaltfläche beziehungsweise den nativen Form-Submitter. Andere wegen derselben Anfrage gesperrte Aktionen zeigen keine Animation. Der Adapter sendet keine Requests, erfindet keinen Erfolg und erzeugt keine Idempotenzschlüssel. HTTP-/Journalzustände bleiben vollständig beim vorhandenen Fachworkflow.

Für native Aufgabenaktionen umfasst der tatsächliche laufende Zustand Anfrage und nachzuweisende queued/running-Schritte. Unknown/Partial/Fehler beenden die Animation und behalten ihre bestehenden Schutzsperren, Eingaben und Nachweise. Allgemeines `pending`, das auch ungeklärte Ergebnisse umfasst, darf nicht ungeprüft als endloser Ladezustand verwendet werden. KI-Auftragsanlage endet nach persistenter Annahme; die minutenlange Verarbeitung bleibt anschliessend als Auftragsstatus sichtbar und blockiert keine weitere Anlage.

### Originalanimation und Lifecycle

Die bereitgestellte Datei hat SHA-256 `e2a00404d374eb80568d4ade3afacdaad832d105554d1548cd5baeb0ecb894c4`. Integriert unter `packages/ui/src/helios-sphere-loader.tsx`: 32 Kurven, 360 Stützstellen, 5200 ms, Radius-/Phasen-/Wellenform unverändert. Der mathematische Zeichenausdruck wurde zusätzlich über einen normalisierten TypeScript-Syntaxbaum abgeglichen. Die ursprünglichen Props für Grösse, Farbe, Linienzahl, Zyklus, Strichbreite, Klasse und zugängliche Beschriftung bleiben erhalten.

Technische Anpassungen betreffen sichere Ref-Typisierung und Lifecycle: jeweils höchstens ein RAF-Loop, Cleanup bei Unmount und Propwechsel, statische Original-Sphäre bei reduzierter Bewegung, Pause im verborgenen Dokument und sichere Fortsetzung. Keine permanent animierten Platzhalter für normale Navigation und keine Animationen auf bloss gesperrten Aktionen.

### Tokens, Dialoge und Responsive-Regeln

`ui-primitives.css` fasst die gemeinsamen Regeln nach den historischen E9-Stilen zusammen. Es verwendet bestehende Farb-/Abstandstokens und ergänzt `--ui-radius`, `--ui-control-radius`, `--ui-control-height`, `--ui-content-gap`, `--ui-inset`, `--ui-hover`, `--ui-focus` sowie semantische Lade-, Fehler-, Erfolgs-, Hinweis- und Warnfarben. Feature-CSS bleibt für Anordnung und besondere Karteninhalte zuständig. Neue Ausnahmen für einzelne Spinner, Switches und Standard-Accordions sind zu vermeiden.

Ein Formularfeld hält Beschriftung und Eingabe zusammen. Switch-Zeile und Checkbox-Mehrfachwahl sind bewusst andere Semantiken. Echte Switches besitzen tastaturbedienbare native Inputs, sichtbare Fokusspur, ausreichende Touch-Zeile und Namen. Kleine Fenster lassen Felder und Aktionszeilen umbrechen; Textareas bleiben in der verfügbaren Breite.

Dialoge haben Titel, optional Beschreibung, Inhalt und klaren Aktionsbereich. Lange Inhalte bleiben scrollbar; der Aufgabeneditor behält die dauerhaft erreichbare Leiste. Schliessen während laufender Änderungen bleibt gesperrt. Entwurfsschutz, Escape, Fokus-Rückgabe, Kontextwechsel und Unknown-Nachweise werden nicht durch das Designsystem ersetzt.

### KI-Aufträge – Präsentation und Suche

Status-Badges verbinden verständliche Beschriftung mit Symbol und semantischem Farbton. Erledigt ist ein prüfbares Ergebnis, Abgeschlossen eine bewusste Nutzerentscheidung. Abgeschlossene Karten bleiben öffnbar, erhalten eine dezente graue Fläche und zeigen keine Ergebnisvorschau; sämtliche Daten bleiben unverändert gespeichert.

Ergebnisse stehen als versionierte umrahmte Karten bereit. Lesbare Inhalte verwenden den vorhandenen sicheren Markdown-Renderer ohne ausführbares HTML oder externe Medien. Kopieren verwendet weiterhin den unveränderten Ergebnistext. Nachbearbeitung hat einen eigenen Formularbereich mit Beschriftung über der breiten Textarea und Einreichen darunter; Abschluss und Löschen stehen getrennt.

Die Originalpromptsuche ist serverseitig, auf 200 Zeichen begrenzt, ohne Gross-/Kleinschreibung und als wörtlicher Teiltext umgesetzt. `%` und `_` sind keine Wildcards. Status, Datumssortierung, stabile Zweitsortierung und bestehende 20er-Pagination wirken auf dieselbe Owner-geprüfte Ergebnismenge. Zurücksetzen der Suche erhält bewusst die übrigen Filter. Die Suche durchsucht keine fremden Aufträge und ändert weder Queue, Aufträge noch Ergebnisse.
