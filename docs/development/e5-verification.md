# E5 – Tagesordnung, Fokuswahl und zyklische Reserve: Prüfbericht

Stand: 15. Oktober 2026. Umsetzung auf feat/e5-daily-order-reserve von develop e84ff6f. Technische Abschlussabnahme läuft; noch kein E5-Merge behauptet. Manuelle E3-/E4-Abnahmen bleiben ausdrücklich aufgeschoben und offen.

## Quellen und Umfang

E5-Auftrag, AGENTS, README, Implementierungsplan, technische Architektur, E3-/E4-Prüfberichte und Planungs-/Aufgabenverträge gelesen. Freigegebenes [Lastenheft](https://app.notion.com/p/3f77667a045981c0b688c82885b82ca1), [ADRs](https://app.notion.com/p/3f87667a04598161aae9f9f5550b59cf) und [Entwicklungsrichtlinien](https://app.notion.com/p/3f97667a045981ff8a59eba6c4780050) erneut abgerufen. Verbindlich: LH-061, LH-065–069a, AT-06 und jüngere F3/F4/F5. Sites-Projekt weiterhin bestätigte V2; vorhandene V2-Referenz und E3/E4-Gestaltung verwendet.

Keine neue fachliche Regel zur impliziten Umplanung oder dauerhaften Skip-Abwertung. Reserve wird bewusst über Bereichswechsel oder Zusatzaufnahme bestückt. Keine unbestätigte automatische Reservegenerierung. Hauptvorschlag bleibt typischerweise bis fünf; bewusste zusätzliche Aufgaben bleiben erhalten.

## Daten- und API-Änderungen

[Architektur](../architecture/daily-order-reserve.md), [API](../integrations/planning-api.md): Migration 0007 ergänzt agenda und drei Beobachtungsfelder in bestehenden Tabellen. Historische Quellen/Revisionen bleiben unverändert; append-only Quellen, Retirements, Historie und Beobachtungen. Eindeutige Instanzen, atomare Permutationen, Idempotenz und Quellenrevisionen. Kein zweites unabhängiges Modell, keine neue Queue oder Schreibpipeline.

## Bisher tatsächlich bestandene Prüfungen

54 Unit-/Vertragstests. Vollständige PostgreSQL-Regression vor den letzten Zusatzfällen: 112 bestanden; gezielte endgültige E5-Suite: 21 bestanden. Darunter Konkurrenz/atomare Ordnung, Fokus ohne Reorder, Kontext/Tage, echte neue MFA nach Tageswechsel, Fehlerrollback, Skipgrund, leere Reserve, Rotation/Pause/Fortsetzung, bewusste Aufnahme und native Hierarchie, normale/wiederholende Abschlüsse, Unknown und sichere Wiederaufnahme. Zusätzliche Taskinstanz darf bewusst aufgenommen werden; unbekanntes Close wird nicht wiederholt.

Gezielter Desktop-Playwrightlauf bestanden: echte Pfeile, Keyboard-Drag, Pointer-Drag, Reload, direkte Fokuswahl, Reserve-Rotation, bestätigter Abschluss, Einzelkartenpause/Fortsetzung sowie Zusatzaufnahme/Rückweg. Synthetische Fokus-/Reserveaufnahme visuell geprüft. Vollständige Browser-/PostgreSQL-Schlussabnahme, Docker und CI noch offen.

Build und Typprüfung bestanden; Produktionsaudit ohne bekannte Schwachstellen, Secretprüfung bestanden, db:generate ohne Drift. Gepinnte dnd-kit/react 0.5.0 deklariert Kompatibilität mit React 18/19. Keine Tests mit Entwicklungsdaten oder echten Tokens gegen Fixtures.

## Behobene Probleme

- SQL-JSON-Operatorbindung in der neuen Schutzfunktion durch echte PostgreSQL-Prüfung gefunden und korrigiert; Schutzregeln bleiben aktiv.
- DOM-abhängige Sortierbibliothek benötigt eine reine Browser-Ladegrenze, damit Server-/Basistests keinen ResizeObserver voraussetzen.
- Asynchrones Laden wird sichtbar dargestellt und im E2E abgewartet.
- Unnötiger Sortier-Remount nach Erfolg verlor den Tastaturfokus; bestätigte Serverantwort wird nun direkt ohne Remount übernommen.
- Instanzverfügbarkeit unterscheidet eine retirierte Wiederholung von einer bewusst neu aufgenommenen Folgeinstanz.
- Ungeklärte Abschlüsse behalten ihre Karte auch bei vorläufig unbekannter Projektion; keine falsche Erledigtmeldung.

## Grenzen und spätere manuelle Abnahme

[Bedienungs- und gemeinsamer E3–E5-Prüfablauf](../runbooks/planning.md). Keine physische Tablet-/Smartphone-Abnahme behauptet; Desktop-E5 verwendet Pointer-/Keyboard-Sensoren und Pfeile, mobile Morgenroutine folgt separat. Keine Exactly-once-/CAS-Garantie zwischen PostgreSQL und Todoist; vorhandene konservative E4-Grenzen gelten weiter. Bei geänderter Wiederholungsinstanz wird ein alter Abschluss abgewiesen. Technische Sicherheitsgrenze 200 Instanzen pro Kontexttag, ohne Backlogzählung in der Oberfläche.

Keine automatisch wirksamen Lernhypothesen, kein E6, kein NAS vorausgesetzt, kein Release, main-Merge oder Produktivdeployment. Die bestehende Entwicklungsumgebung läuft während der isolierten Abnahme weiterhin unverändert auf E4.
