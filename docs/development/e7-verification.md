# E7 – Morgenroutine und Review: Prüfbericht

Stand: 15. Oktober 2026. Umsetzung auf feat/e7-morning-routine von develop 4835adf. Technische Abnahme läuft; kein vollständiger E7-Abschluss oder Merge behauptet. Manuelle E3–E6-Abnahmen bleiben offen.

## Grundlagen

E7-Auftrag samt bestätigter Reviewregel, AGENTS, README, Implementierungsplan, technische Architektur, E5-/E6-Berichte und bestehende Aufgaben-/Planungs-/KI-Verträge gelesen. Lastenheft, ADRs und Entwicklungsrichtlinien erneut abgerufen; Sites-Projekt bestätigt weiterhin Version 2. Relevante Regeln LH-050–058/060–061/096–097/105, F2/F5, AT-05/12. Neuere bestätigte Anweisungen übersteuern historische Sperrvermerke. [Reviewentscheidung und Architektur](../architecture/morning-routine-review.md).

## Aktueller Implementierungsstand

Persistente globale Tage, freie Kontextwahl, kontextgetrennte Schritte, Skip/offen und Wiederaufnahme; native Einzelkarten-Eingangssortierung ohne KI; letzte relevante bestätigte Reviewquelle; explizites Instanzfeedback, persistente Sammelentscheidungen und E4-Einzelergebnisse; wiederverwendeter E6-Fortschrittsdialog mit zusätzlichem Instanzschutz; dynamische Anreicherung; vorhandener E3–E5-Planer; optionale zentrale Problemprüfung. Vier additive Tabellen, geschützte Routine-Endpunkte, keine zweite Schreibpipeline. [API](../integrations/routine-api.md).

## Tatsächlich ausgeführte Prüfungen

Erste E7-PostgreSQL-Risikosuite: 18 Tests bestanden auf isolierter synthetischer E7-Datenbank. Darunter serverseitiger Neustart-/Revisionsstand, Tageswechsel nach regulärer Neuanmeldung, Eingang ohne KI/Projektvorauswahl, fremdes zugängliches Zielprojekt, failed/unknown ohne Erfolgszählung, letzter bestätigter Kontexttag statt gestern, unveränderte ältere Historie, explizite Sammelrückmeldung, Teilerfolg, veränderte Wiederholungsinstanz, MFA/Origin, DB-Historienschutz, Arbeitgeberdeaktivierung, Wiederaufnahme gespeicherter Entscheidungen und vorhandener verifizierter E4-Abschluss. Produktionsbuild und Typprüfung bestanden. Vollständige Regression, Browser, Docker, Restore und CI folgen; noch nicht als bestanden behauptet.

## Korrekturen und Grenzen

Der Tageswechseltest muss mit echter erneuerter MFA-Sitzung ausgeführt werden; abgelaufene Authentifizierung wird nicht für Tests abgeschaltet. Privat bleibt gemäss E2 immer aktiv, deshalb prüft der Deaktivierungsfall einen echten Arbeitgeberkontext. Native Abschlussnachweise werden nicht aus fehlenden Aufgaben abgeleitet. Auswahl in Review und Kontextwahl darf nicht still auf fremde Revisionen neu basiert werden.

E7 nutzt bestehende verifizierte E4-Todoist-Schreiboperationen; neue Tests bleiben synthetisch. KI bleibt auf dem vorhandenen Ubuntu-LAN-Endpunkt. Kein E8, main-Merge, Release, Docker-Hub-Push, Produktivdeployment oder NAS-Erfordernis. Die spätere gemeinsame manuelle E3–E7-Abnahme bleibt ausstehend.
