# E9 – TermiHub: Arbeits- und Kalenderorientierung

Stand: 15. Oktober 2026. E9 ist ausdrücklich beauftragt; E1/E2 manuell abgenommen, E3–E8 technisch integriert, gemeinsame manuelle E3–E9-Abnahme weiterhin offen. E10 bleibt ausserhalb des Auftrags.

## Quellen und GET-Vertrag

Die veröffentlichte Swagger-Seite verweist tatsächlich auf /api/openapi.json. Geladen: OpenAPI 3.1.0, TermiHub API 1.2.0. Keine erfundenen Endpunkte. Ergänzende primäre Quelle: [TermiHub External Read API](https://github.com/biit-hub/TermiHub/blob/main/docs/external-api.md). Öffentliche Implementierungs-/Testreferenzen wurden ausschliesslich gelesen; TermiHub-Repository, Datenbank und Server bleiben unverändert.

| GET-Ressource                           | Scope               | Verwendung                                                                |
| --------------------------------------- | ------------------- | ------------------------------------------------------------------------- |
| /api/v1/external/calendars              | events:read         | Echte und virtuelle Kalenderreferenzen                                    |
| /api/v1/external/events                 | events:read         | Explizites Zeitfenster und wiederholte calendar_ids, include_virtual=true |
| /api/v1/external/work-locations         | work_locations:read | Arbeitsfenster und tatsächlich referenzierte Organisations-IDs            |
| /api/v1/external/work-locations/current | work_locations:read | Optionaler aktueller Arbeitsstatus; kein Arbeitgeberkatalog               |
| /api/v1/external/travel                 | travel:read         | Bestehende Reiseintervalle mit related_event                              |

calendar_ids filtert im veröffentlichten Adapter auch virtuelle Identitäten. virtual_calendar_ids würde zusätzlich schneiden, keine Vereinigung bilden. Envelope.meta.count ist die gelieferte Anzahl, keine vollständige Gesamtanzahl. Ein ausgeschöpftes Limit 500 bleibt unvollständig. Der Reader verwendet explizite begrenzte Zeitfenster; keine unkontrollierte Seitensuche oder Wiederholung. Normale sitzungsbasierte Verwaltungs-/Tokenendpunkte werden nicht verwendet.

TermiHub liefert Ganztagsdaten ohne erfundene Uhrzeit; für die Intervallrechnung gilt die exklusive Endgrenze der normalisierten Providerintervalle in der Quellzeitzone. ISO-Zeitpunkte und lokale Kalendertage werden getrennt behandelt. Ein physischer Arbeitsort bevorzugt oder sperrt keinen Kontext.

## Bestätigte Entscheidungen vom 15. Oktober 2026

- BUSY und OUT_OF_OFFICE blockieren; FREE und WORKING_ELSEWHERE blockieren nicht automatisch. TENTATIVE, UNKNOWN und neue unbekannte Werte sind unsicher. Die untere freie Grenze berücksichtigt feste und unsichere Belegungen; die obere nur feste. Beide verwenden Intervallunion innerhalb getrennter Arbeitsfenster. Unsichere und feste Überlappungen werden nicht doppelt gezählt.
- Zugeordnete Fahrten und Terminbelegungen werden gemeinsam vereinigt, keine doppelte Subtraktion und kein eigener Routingdienst. Nicht sicher zuordenbare relevante Daten erlauben kein zuverlässiges Budget.
- 15 Minuten frisch; danach Aktualisierung bei Bedarf versuchen. Veraltete Werte dürfen deutlich als vergangene Orientierung erscheinen, für neue Planung jedoch kein zuverlässig aktuelles Zeitbudget liefern. Fehlende, unvollständige oder nicht sicher zugeordnete Daten ebenfalls nicht.
- Abgeleitete Snapshot-Versionen nach 30 Tagen automatisch bereinigen. Ausschliesslich abgelaufene Snapshot-Daten löschen; Kalenderquellen, Zuordnungen, Zugangsdaten, bestätigte Pläne und unveränderliche Planhistorien bleiben erhalten.
- Termintitel, Beschreibungen und Teilnehmerdaten werden nicht dauerhaft gespeichert. Keine Kalenderinhalte in KI-Prompts. Kontextübergreifende Belegungen nur nach ausdrücklicher Kalenderzuordnung und ohne Inhaltsweitergabe.
- Keine Arbeitseinsätze bedeutet ohne zusätzliche ausdrückliche Entscheidung weder arbeitsfrei noch unbegrenzt frei. Die manuelle Kontextwahl und Planung bleiben immer verfügbar. Neue Kalenderdaten verändern bestätigte Pläne nicht automatisch.

## Verbindung und Sicherheit

URL ist konfigurierbar, Backend ohne fest codierte persönliche Instanz. Nur externe GET-Ressourcen. Token verschlüsselt serverseitig; niemals an Browser, Queryparameter oder Logs. HTTPS mit unveränderter Zertifikatsprüfung. DNS-Adressen vor jedem Request prüfen und für den TLS-Aufruf fest binden. Keine Redirectweitergabe von Credentials. Private HTTPS-Instanzen benötigen die ausdrückliche Betreiberfreigabe TERMIHUB_PRIVATE_ORIGINS; Loopback-Testumgehung ausschliesslich im Testmodus. Timeouts und Antwortgrössen sind begrenzt. Gleichzeitiger Credential-/Kontextwechsel darf verspätete Antworten nicht übernehmen.

## Tatsächlicher Nachweis / offene Live-Abnahme

Alle fünf oben aufgeführten veröffentlichten Routen wurden ausschliesslich mit GET und ohne Token sowie einem synthetisch ungültigen Token geprüft: jeweils HTTP 401. Kein echter API-Token in der Helios-Konfiguration vorhanden. Erfolgreicher Live-Abruf, Scope-403 und tatsächliche Filter-/Datenverträge am installierten Server sind daher weiterhin offen; Quell-/Fixture-Nachweise ersetzen diese Abnahme nicht. Der Benutzer erstellt einen eingeschränkten Token selbst in TermiHub und hinterlegt ihn später in Helios. Keine Beschaffung über persönliche Zugangsdaten.

Implementierungsfortschritt und Tests: [E9-Prüfbericht](../development/e9-verification.md).
