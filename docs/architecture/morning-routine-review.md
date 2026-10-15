# E7 – Persistente Morgenroutine und Review

E7 orchestriert die vorhandenen E2–E6-Domänen im frameworkfreien Backend. Web ist HTTP-/Darstellungsadapter. Es gibt keine zweite Todoist-Schreibpipeline und keine zusätzliche Queue.

## Bestätigte Entscheidung zu O-08

Der E7-Auftrag vom 15. Oktober 2026 bestätigt Option A: automatisch nur den letzten relevanten bestätigten früheren Tagesplan je Kontext vorlegen. Massgeblich ist ein tatsächlich bestätigter Kontextplan vor dem lokalen Routinentag, nicht pauschal das Kalendervortagsdatum. Ältere offene Rückmeldungen bleiben historisch erhalten, werden nicht zusammengeführt und nicht als Nichtbeginn oder Erledigung umgedeutet. Die Regel gilt unabhängig für Privat und jeden Arbeitgeber.

Beim ersten Öffnen des Reviews wird eine bestätigte Planhistorienrevision referenziert und als unveränderliche Reviewquelle festgehalten. Ursprüngliche Pläne und Historien werden nicht geändert. Task-ID plus ursprünglicher Wiederholungsinstanzschlüssel bindet Rückmeldungen und Abschlüsse. Verifizierte E4-Abschlüsse sind Nachweise; blosse Abwesenheit in aktiven Aufgaben ist keiner.

## Persistenz und Zustände

Additive Migration 0009 ergänzt routine_days (Benutzer/lokaler Tag eindeutig, Zeitzone, started_at, globale Schritte, Cursor, Revision und heutige Rückstellungen), routine_contexts (Routine/Kontext eindeutig, Auswahl, Position, Review-/Anreicherungs-/Planungsschritte und eingefrorene Quelle), review_feedback (historische Instanz, explizite Rückmeldung, E6-Entwurf, E4-Operation, Einzelergebnis) und append-only routine_events nach dem bestehenden Beobachtungsansatz. Globale Ereignisse benötigen keinen künstlichen Tagesplan.

Schritte: open, started, done oder skipped_open. Skip führt weiter und bleibt offen; er verändert keine Aufgabe. started_at ist kein Abschluss. Lokaler Zustand wird unter aktiver MFA-Sitzung und demselben zentralen Transaktionslock revisions- und idempotenzgeschützt gespeichert. Ältere Kalendertage sind lesbar; neue Mutationen benötigen den aktuellen lokalen Tag. Keine BrowserlocalStorage-Wahrheit.

## Domänengrenzen

Der globale Eingang liest genau eine Karte, ohne KI oder Projektvorauswahl. Benutzer wählt jedes zugängliche geeignete Projekt bewusst. Bestehendes E4-Journal prüft Quelle, echten Eingang, Sitzung und Berechtigung vor Mutation. Erst eine tatsächliche aktive verwaltete Zuordnung darf durch die unveränderten E6-Guards analysiert werden. Failed, partial und unknown zählen nicht als erfolgreiche externe Eingangsmutation. Der Auftraggeber bestätigt zusätzlich: Erfolgreich serverseitig gespeichertes «für später liegen lassen» zählt als bewusste lokale Entscheidung zum freiwilligen Drei-Aktionen-Hinweis; idempotente Wiederholungen zählen nur einmal.

Sammelabschlüsse persistieren die gesamte Entscheidung vor dem Einreihen ihrer E4-Einzeloperationen. Bei Abbruch bleiben nicht eingereihte Entscheidungen wiederaufnehmbar. Teilergebnisse und unbekannte Effekte bleiben je Instanz sichtbar. E6-Fortschrittsdialog/-modelle/-validierung werden direkt wiederverwendet; ein zusätzlicher expectedInstanceKey schützt den Einstieg aus historischem Review vor einer neuen Wiederholungsinstanz.

Anreicherungsbedarf stammt aus aktuellen eigenen E6-Signalen und getrennten Hinweisen für veraltete Planungsdaten. Keine Quote, kein Eingang, keine fremden Projekte. Belegte Todoist-added_at-Daten erlauben den Hinweis auf heute erstellte Aufgaben; fehlen sie, wird kein Erstellungsdatum erfunden ([Todoist API](https://developer.todoist.com/api/v1/)). E3–E5 erzeugen und bestätigen weiterhin den Plan; die bewusste Aktualisierung betrifft nur unbestätigte Vorschläge des ausgewählten Kontextes. Probleme verwenden dieselbe zentrale Problemansicht: geprüft bleibt von behoben getrennt.

E8, automatische Lernhypothesen, TermiHub-Pflichten, Smartphone-PWA und Push sind nicht Bestandteil dieser Etappe. Die serverseitigen Verträge sind für den gemeinsamen Desktop-/Mobile-Ablauf verwendbar. Manuelle E3–E6-Abnahmen bleiben offen.
