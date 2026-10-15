# E9 – Prüfbericht (technische Umsetzung, Endprüfungen laufen)

Branch feat/e9-termihub-integration von develop 362129f. E1/E2 manuell abgenommen; manuelle E3–E9-Abnahmen bleiben offen. E10 ist nicht beauftragt. Kein main-Merge, Release, Imagepush oder Produktivdeployment.

## Grundlagen und Funktionen

E9-Auftrag, Arbeitsregeln, bestehende Implementierungs-/Architekturgrundlagen und E3–E8-Nachweise ausgewertet. Lastenheft, ADRs und Entwicklungsrichtlinien frisch aus Notion gelesen; relevant LH-004, LH-050–058, LH-061–066 und F4/F5. Sites-V2 bleibt die bestehende Desktopreferenz. Die zuvor ergänzte Todoist-Deadline-Präzisierung ist als eigener Vorbereitungscommit enthalten; keine E4-Neuimplementierung.

Implementiert: konfigurierbare verschlüsselte TermiHub-Verbindung, Step-up-geschützte Credential-/Zuordnungsänderungen, sichere GET-Reads, verifizierte Organisations-IDs und explizite Kalenderzuordnung. Bestehender Node-/pg-boss-Worker mit persistenter Leseabsicht, Claims, Fristen, Backoff und erneuter Autorisierung. Kontextbezogene normalisierte Tagesdaten, vorsichtige Budget-Spannen, unabhängige manuelle Planung, unveränderte Routineabfolge und aggregierte Grundlage ausdrücklicher Planvorschläge. Kein automatischer Kontextwechsel und keine automatische Planersetzung.

[Bestätigter Architektur-/Snapshotentscheid](../architecture/termihub-calendar.md), [Einrichtung und Fehlerzustände](../runbooks/termihub.md), [externer Vertrag](../integrations/termihub.md).

## Tatsächlich verifizierter TermiHub-Vertrag

Swagger-Konfiguration auf https://termihub.tech-be.at/api/docs gelesen und den dort veröffentlichten Pfad /api/openapi.json geladen: OpenAPI 3.1.0, API 1.2.0. Ergänzend öffentliche Implementierung, Tests und externe API-Dokumentation am Quellstand 9d44a822d8e2149401805eeed6762a30ca93211b ausschliesslich gelesen. Kein TermiHub-Repository, Server oder Datenbestand verändert.

| Externe GET-Route | Erforderlicher Scope | Nachweis |
| --- | --- | --- |
| /api/v1/external/calendars | events:read | OpenAPI/Quelle/Fixtures; real ohne und mit synthetisch ungültigem Token jeweils 401 |
| /api/v1/external/events | events:read | Ebenso; wiederholte calendar_ids und include_virtual=true synthetisch geprüft |
| /api/v1/external/work-locations | work_locations:read | Ebenso; tatsächlich referenzierte Organisations-IDs, kein vollständiger Arbeitgeberkatalog |
| /api/v1/external/work-locations/current | work_locations:read | OpenAPI und zwei reale 401-Proben; optional, nicht zusätzlich für die Tagesberechnung erforderlich |
| /api/v1/external/travel | travel:read | OpenAPI/Quelle/Fixtures und zwei reale 401-Proben; keine Routing-Neuberechnung |

Envelope.count entspricht der Ergebnislänge. Ein 500er-Resultat wird ohne weiteren Vollständigkeitsnachweis unvollständig. Die veröffentlichte Implementierung filtert reale und virtuelle IDs über calendar_ids; zusätzliche virtual_calendar_ids würden schneiden. Exklusive Ganztags-Endgrenzen und Quellzeitzonen sind anhand Quelle und Fixtures abgesichert; positive Live-Datenabnahme bleibt offen.

In der freigegebenen Helios-Konfiguration ist kein gültiger TermiHub-Token hinterlegt. Die zehn realen negativen Authproben beweisen keine erfolgreichen Daten-, Scope-403- oder Filterverträge des installierten Servers. Diese offene Live-Prüfung ist ausdrücklich benannt und wird durch synthetische Erfolge nicht ersetzt. Keine persönliche Anmeldung oder Tokenbeschaffung vorgenommen.

## Datenbank, HTTP und Sicherheit

Additive SQL-Migrationen 0011–0014; insgesamt 15 Migrationen und 35 Tabellen, Schema-Generierung ohne Drift. Neue Tabellen termihub_catalog, termihub_calendar_mappings, calendar_snapshots und calendar_day_decisions; nullable daily_plans.calendar_basis. Snapshot-UPDATE und Änderung der Planbasis nach Beginn der Bestätigung sind per Datenbanktrigger gesperrt. Monotone Integrationsrevision bleibt nach Snapshotbereinigung erhalten. Sämtliche alten Todoist-Abfragen wählen ausdrücklich den eigenen Integrationstyp.

GET /api/termihub liefert ausschliesslich sichere Einstellungen, GET /api/calendar die eigene Kontext-/Tagesorientierung. POST /api/termihub/{save,enable,disable,remove,mapping,refresh,decision} nutzt die zentralen Origin-/Session-/MFA-/Bodyguards. Refresh wird asynchron mit 202 angenommen. Kein Token im DTO oder Queuepayload. Kein offener roher Authhandler und kein TermiHub-Verwaltungszugriff.

HTTPS mit normaler Zertifikatsprüfung, Originvalidierung, DNS-Neuprüfung und IP-Pinning vor jedem GET, keine Redirects, begrenzte Gesamtantwort/Timeouts. Private HTTPS-Origins benötigen explizite Betreiberfreigabe; Metadaten und Loopback bleiben gesperrt. Nur isolierte Testkonfiguration erlaubt einen synthetischen HTTP-Loopbackserver. Credentialgeneration, Mapping-/Kontextrevisionen, Claim und freigebende Sitzung beziehungsweise aktives MFA-Konto werden vor Ergebnisübernahme erneut geprüft. Externe Wartezeiten halten keine Identitätstransaktion offen.

15 Minuten frisch; stale/partial/unmapped liefern kein verlässliches neues Planungsbudget. Nach 30 Tagen nur abgelaufene Snapshot-Versionen bereinigen, maximal 200 pro Charge. Keine Termintitel, Beschreibungen, Teilnehmer oder Adressen persistiert; keine Kalenderdaten in KI-Prompts. Kalenderkatalog/Zuordnungen/Credentials/Tagesentscheidungen/Planhistorie werden nicht durch Snapshotcleanup verändert.

## Bisher bestandene Prüfungen

- Lint und vollständige Workspace-/Root-Typprüfung.
- Vollständige Unit-Regression: 173 Tests vor dem ergänzten Einzeltest des unabhängig aktualisierten Änderungshinweises; erneuter Gesamtstand folgt unten nach Abschluss.
- Vollständige PostgreSQL-Regression: 232 Tests in zwölf Dateien, ausschliesslich isolierte synthetische Testdatenbank. Darin E1–E8 und neue Credential-/Mapping-/Claim-/Revisions-/Sitzungs-/Frische-/Aufbewahrungsfälle.
- Exakte Frischegrenze 15 Minuten und Aufbewahrungsgrenze 30 Tage, unveränderliche Snapshots/Planbasis, ausschliessliche Bereinigung, Restore-Sperre, idempotentes Cleanup und monotone Revision nach vollständigem Ablauf.
- Zeitfälle: geteilte Fenster, Überlappungen, feste/unsichere Union, 23-/25-Stunden-Tage, exklusive mehrtägige Ganztagsintervalle, Quellzeitzone, fremde Kalender, widersprüchliche Identitäten, Reiseunion und unzugeordnete Reisen. Unbekannte Dauer wird nicht mit null bewertet; ein voller Tag wird nicht künstlich aufgefüllt.
- Credentialrotation und Kontextwechsel während laufender Reads verwerfen Ergebnisse; widerrufene manuelle Sitzung verhindert Übernahme. Geplante konfigurierte Reads bei abgemeldetem aktivem MFA-Konto erzeugen keine Sitzung. Zwei Worker führen denselben Claim nicht doppelt aus. Maximal drei Versuche pro Absicht mit Backoff.
- Synthetische erfolgreiche und abgewiesene Todoist-Deadline-Erstellung/-Änderung/-Entfernung. Keine produktiven Todoist-Zugangsdaten oder Aufgaben für Tests verwendet; HTTP 403 bleibt ohne sichere Tarifdiagnose.
- Isolierte age-verschlüsselte E8→E9-Upgrade-/Restore-Probe: 18 Tabellen verglichen, alte Plan-/Reserve-/Fokus-/History-/Unknown-/AI-/Routineinhalte sowie neue Quellenzuordnungen, Tagesentscheidungen und Kalenderrevisionen erhalten. Schutztrigger nach Restore geprüft. Kein Worker gestartet, null externe Aufrufe, null unverschlüsselte Dumpdateien. Testdatenbanken/Volumes erhalten.
- Schema-Driftprüfung, Secret-/Privatpfadprüfung und Produktionsaudit ohne bekannte Schwachstellen. Nach Aufnahme aller neuen Dateien wird die Secretprüfung nochmals wiederholt.
- Erster Web-/Worker-Build bestanden. Aktueller Änderungshinweis-Build, Browserprüfung, Image-/Compose-/Scanprüfungen und geschützter PR-Abschluss laufen noch und werden nicht vorweggenommen.

## Offene Nachweise und Grenzen

- Gültiger eingeschränkter TermiHub-Token: erfolgreiche reale Kalender-/Arbeits-/Reise-/Filter-/Zeitzonenabnahme am installierten Server fehlt. Vor echter Alltagsnutzung bewusst nachholen, keine Zugangsdaten im Chat oder in Git.
- Berechtigte Live-Schreibabnahme der Todoist-Deadlines bleibt offen. Das separate Testkonto verwendet nach Auftraggeberangabe Free; Produktionskonto mit Deadline-Unterstützung wird niemals für automatische Tests verwendet.
- Kein vollständiger externer Arbeitgeberkatalog: Referenztag mit beobachteten Organisations-IDs verwenden. Maximales Ergebnislimit ergibt eine unvollständige Orientierung, kein erfundenes Paging.
- Zeitbudget gilt für den ganzen gemeldeten Plantag einschliesslich vergangener Tageszeit, nicht als exakte ab jetzt freie Zeit. Kontexte werden nicht zu einem globalen Stundenbudget aufsummiert. Keine Uhrzeitblöcke, Prozentpuffer, Verkehrsverbindungsauswahl oder automatische Neuplanung.
- Manuelle E3–E9-Abnahme ist ausdrücklich offen. CI/CodeQL/Sonar/Imagescan/geschützter Merge und lokale E9-Installation sind hier erst nach tatsächlichem Nachweis als abgeschlossen einzutragen.

## Spätere gemeinsame manuelle E3–E9-Abnahme

1. Anmeldung mit TOTP, Step-up, zwei Browser und Wiederaufnahme prüfen. Bestehende Kontextnamen/Farben/Projekte bestätigen.
2. E3–E5: wenige passende Aufgaben, Unteraufgabenhierarchie, bewusste Bestätigung, Fokuswechsel ohne Reorder, Haupt-/Reserveordnung, zyklische Reserve, Pause und Rückkehr prüfen. Kalenderrefresh darf bestätigte Auswahl/History nicht ändern.
3. E4: Aufgabenänderung, Wartedetails, Kommentar und Abschluss bewusst durchführen; wiederholende Termine nur mit ausdrücklicher Entscheidung ändern. Produktive Deadline-Nutzung separat mit eigenem bewussten Auftrag abnehmen, keine automatischen Produktionstests.
4. E6: bestehendes LAN-Ollama, Entwürfe bearbeiten/annehmen/ablehnen, Originaltexterhalt und gemeinsamer Fortschritt. E7: Eingang ohne KI/Vorauswahl, bewusst liegen lassen, alle Kontexte, Reviewquelle, Skip/Wiederaufnahme und Mehrgerätefortschritt. E8: native Epics, Ziel-/Checklisten-/Linkerhalt, SMART und korrigierbare Vorschläge, offene Kinder nur Trennen oder Abbrechen mit vollständiger Wirkungsvorschau.
5. E9: eingeschränkten TermiHub-Token selbst in den geschützten Einstellungen hinterlegen. Referenztag lesen, Organisations-IDs und jede Kalenderquelle bewusst zuordnen; Namen dürfen keine automatische Zuordnung auslösen. Homeoffice/physisch und geteilte Fenster kontrollieren.
6. BUSY/OUT_OF_OFFICE, FREE/WORKING_ELSEWHERE, TENTATIVE/UNKNOWN, überlappende Ganztags-/Mehrtagstermine und Reisen mit realen Quellwerten vergleichen. Nach 15 Minuten stale/Refresh; Ausfall/403 ohne vermeintlich aktuelles Budget, manuelle Auswahl weiter möglich. Keine Termininhalte in Logs/AI.
7. Kalender nach Planbestätigung verändern und in zwei Tabs neu lesen: Hinweis, gleiche Auswahl/Reihenfolge/Fokus/History. Tokenrotation/Deaktivierung/Wiederverifikation und bestehende Referenzen prüfen. Snapshotablauf nur isoliert mit synthetischen Daten testen; historische Planbasis bleibt lesbar.
8. Lokales verschlüsseltes Backup und kontrollierte isolierte Wiederherstellung mit gesperrtem Worker nachvollziehen. Synology erst bei Produktivinstallation, konfigurierbarer späterer Ordner Backups/Helios ohne vorausgesetzte NAS-Zugangsdaten.
