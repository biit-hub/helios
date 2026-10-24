# TermiHub in Helios einrichten

1. In TermiHub selbst einen eingeschränkten API-Token mit events:read, work_locations:read und travel:read erstellen. Helios beschafft keinen Token und verwendet keine persönliche TermiHub-Sitzung.
2. In Helios Einstellungen öffnen und unter «Sensible Änderungen bestätigen» Passwort sowie neuen Authenticator-Code bestätigen. Die Bestätigung gilt fünf Minuten.
3. Unter «TermiHub verbinden» die HTTPS-Serveradresse ohne Pfad und den Token eingeben. «TermiHub-Token verschlüsselt speichern» ausführen. Eine fehlende Sicherheitsbestätigung wird direkt im Formular angezeigt; die Eingabe bleibt für die Wiederholung erhalten.
4. «Verbindung prüfen & Kalender lesen» starten. Die Leseabsicht ist gespeichert; der vorhandene Worker übernimmt den Abruf. Status und Zeitpunkt werden nachgelesen. API-Rechtefehler sind keine sichere Tarifdiagnose.
5. Arbeitsorganisationen anhand tatsächlich gelesener IDs bewusst den Helios-Kontexten zuordnen. Fehlt eine Organisation, einen Referenztag mit entsprechendem Arbeitseinsatz lesen. Ein leerer späterer Tag entfernt die bestehende Zuordnung nicht.
6. Jeden aktiven Kalender bewusst zuordnen, ausdrücklich gemeinsam verwenden oder ausschliessen. Noch ungeklärte Quellen ergeben kein verlässliches Budget. Danach die Zuordnungen speichern. Ein Token-/Serverwechsel verlangt die erneute Quellenverifikation.

Helios benennt Kontexte nicht um und aktiviert sie nicht automatisch. Privat und alle Arbeitgeber bleiben in Morgenroutine und Planung frei auswählbar. Ein fehlender Arbeitseinsatz sperrt keine manuelle Planung. Für den heutigen Kontext kann bewusst «keine Arbeitszeit vorgesehen» gespeichert werden; das verändert TermiHub nicht.

## Kalenderorientierung lesen

Der kleine Kalenderbereich zeigt Arbeitsfenster, feste beziehungsweise unsichere Belegungen und die daraus abgeleitete Zeitbudget-Spanne für den ganzen Plantag. Er umfasst auch vergangene Tageszeit und ist keine Zeitblockplanung. Geplante Pausen bleiben erhalten. Überlappende Termine und zugeordnete Reisen werden nicht doppelt gezählt. Der Arbeitsort bevorzugt keinen Kontext.

15 Minuten frisch, danach Aktualisierungsversuch. Bei Ausfall kann die frühere Orientierung klar als veraltet angezeigt werden. Für neue Planvorschauen wird daraus kein aktuelles verlässliches Budget behauptet. Die manuelle Auswahl und Todoist-Funktionen bleiben nutzbar. Eine neue Kalenderfassung ersetzt oder sortiert keinen bestätigten Plan. Der Hinweis auf eine geänderte Grundlage fordert lediglich zur bewussten Prüfung auf.

## Betrieb und Fehler

TERMIHUB_TIMEOUT_SECONDS (Standard 10, 1–30) und TERMIHUB_MAX_RESPONSE_BYTES (Standard 2097152, 16384–8388608) gelten für Web und Worker. Für eine private HTTPS-Instanz muss der Betreiber deren exakten Origin in TERMIHUB_PRIVATE_ORIGINS freigeben. Keine Wildcards, privaten Zugangsdaten oder vollständigen Authorization-Header in URLs/Logs verwenden. Loopback und Metadatenziele bleiben gesperrt; die einzige HTTP-Ausnahme ist die isolierte Loopback-Testfixture unter HELIOS_ENV=test.

Bei ungültigem Token oder fehlenden Rechten die Verbindung bewusst prüfen und gegebenenfalls mit frischer Sicherheitsbestätigung ersetzen. HTTP 403 beweist weder einen Tarif noch einen bestimmten fehlenden Scope. Bei Netzwerkproblemen bleiben bestehende Quellenzuordnungen erhalten. Die zentrale Problemübersicht zeigt den neutralen Fehlerzustand. «Geprüft» bedeutet weiterhin nicht «behoben».

Snapshotbereinigung entfernt nach 30 Tagen ausschliesslich abgelaufene abgeleitete Versionen. Es werden keine Kalenderquellen, Zuordnungen, Credentials oder historischen Tagespläne bereinigt. Lokale verschlüsselte Backups und isolierte Wiederherstellungsproben genügen in der Entwicklung; ein NAS wird nicht vorausgesetzt. Bei Schlüsselverlust sind Token nach kontrollierter Wiederherstellung beziehungsweise Schlüsselrotation erneut zu prüfen.

[Externer API-Vertrag](../integrations/termihub.md), [Snapshotentscheid](../architecture/termihub-calendar.md), [offene Live- und manuelle Abnahme](../development/e9-verification.md).

## E9.3 – Darstellung

Zugangsdaten und bewusste Leseabrufe unter Einstellungen → Verbindungen. Kontextbezogene Arbeitsorganisationen unter Kontexte & Projekte; allgemeine Quellenzuordnung zusätzlich unter Arbeitszeiten & Kalender. Ausgeblendete Organisationsfelder bleiben im vorhandenen Mappingformular mit ihren bisherigen Werten erhalten. Gemeinsam genutzte und ausgeschlossene Kalenderquellen gelten weiterhin kontextübergreifend.

In Fokus und Tagesplan ist die Kalenderorientierung zunächst kompakt. Zum Prüfen der Quellen, Zeitzonen und früheren Orientierung aufklappen. Fehlende Aktualität oder Zuordnung liefert weiterhin kein verlässliches freies Budget. Ein geänderter Kalenderbasis-Hinweis und Lese-/Mutationsfehler bleiben sichtbar; es erfolgt keine automatische Neuplanung.

## E9.4 – Quellenbezeichnungen

Organisations- und Kalenderkennungen entfallen aus Standardbeschriftungen. Technische Quellenreferenzen bleiben ausdrücklich aufklappbar. Vorhandene unverifizierte Referenzen bleiben erhalten; Anzeigeänderungen ordnen keine Quelle neu zu und ändern weder Integrationsvertrag noch Kalenderdaten.
