# E9 – Kalenderorientierung und Snapshot-Entscheid

Die fachlichen Ergänzungen wurden am 15. Oktober 2026 ausdrücklich bestätigt. Sie konkretisieren LH-004 und die bestehende Kontext-/Planungsarchitektur; es entsteht kein neuer Dienst und keine zweite Kalenderwahrheit.

## Autorität und Zuordnung

TermiHub bleibt Quelle der Arbeits- und Kalenderdaten. Der bestehende Node-Worker liest ausschliesslich externe Bearer-GET-Routen. Die Webanwendung nimmt bewusste Einstellungen und Leseaufträge entgegen. Organisationsnamen sind Darstellung, Organisations-IDs die Referenz. Kalender sind explizit kontextgebunden, gemeinsam oder ausgeschlossen. Nicht entschiedene aktive Quellen verhindern ein verlässliches Budget. Gleiche Namen lösen keine Zuordnung aus. Das Fehlen einer Organisation in einem Tagesfenster löscht ihre vorhandene Referenz nicht.

Token- oder Serverwechsel erzeugen eine neue Credentialgeneration. Frühere Quellenzuordnungen bleiben sichtbar, benötigen für diese Verbindung aber eine erneute Verifikation. Die bisherige freie E2-Referenzeingabe kann diese Prüfung nicht umgehen. Kontextnamen, Projekte, Farben und Aktivierung werden durch Synchronisation nicht geändert.

## Datenmodell und Lebensdauer

Additive Migrationen 0011–0014 erweitern integrations um den TermiHub-Typ, Origin, Claimfrist, letzten Vollabruf, persistente Leseabsicht und monotone Leseversion. Vier Tabellen speichern den Quellkatalog, bewusste Kalenderzuordnungen, abgeleitete Tages-Snapshots und lokale Entscheidungen über bewusst fehlende Arbeitszeit. daily_plans.calendar_basis hält nur die aggregierte Entscheidungsgrundlage der ausdrücklichen Vorschauerstellung.

Snapshots sind versioniert und gegen UPDATE geschützt. 15 Minuten gelten als frisch, exakt danach als veraltet. Die Anzeige darf ältere Werte ausdrücklich als frühere Orientierung zeigen; budget und freie Intervalle werden dann nicht als zuverlässige aktuelle Grundlage ausgegeben. Unvollständige oder nicht zugeordnete Daten liefern ebenfalls kein verlässliches Budget. Nach 30 Tagen sind Snapshot-Versionen nicht mehr lesbar und werden in begrenzten 200er-Chargen gelöscht. Die Bereinigung greift ausschliesslich auf calendar_snapshots zu. Quellenkatalog, Zuordnungen, Credentials, lokale Tagesentscheidungen, bestätigte Pläne und ihre unveränderliche Historie bleiben erhalten. Snapshotrevisionen werden auch nach vollständiger Bereinigung nicht wiederverwendet.

Termintitel, Beschreibungen, Teilnehmer, Adressen und vollständige Quellantworten werden an der Vertragsgrenze entfernt. Persistiert werden kontextbezogene Intervalle, Aggregate, Quellreferenzen und neutrale Warncodes. Es gibt keine Kalenderdatenweitergabe an KI. Gemeinsame Kalender übertragen nur die ausdrücklich freigegebene Belegungsrelevanz.

## Intervall- und Auswahlregel

Lokale Tage werden mit Luxon als Kalendertage berechnet, einschliesslich 23-/25-Stunden-Tagen. Ganztagsintervalle verwenden Quelldatum und Quellzeitzone mit exklusiver Endgrenze. Getrennte Arbeitsfenster bleiben getrennt; Homeoffice und physische Anwesenheit beeinflussen nicht die freie Kontextwahl.

BUSY und OUT_OF_OFFICE blockieren. FREE und WORKING_ELSEWHERE blockieren nicht automatisch. TENTATIVE, UNKNOWN und neue Werte sind unsicher. Die obere freie Grenze zieht die vereinigte feste Belegung ab, die untere zusätzlich die vereinigte unsichere Belegung. Überlappungen und zugeordnete Reiseintervalle werden gemeinsam vereinigt. Nicht sicher zugeordnete relevante Reisen ergeben keinen zuverlässigen Freizeitraum. Helios berechnet keine Route.

Die ausgewiesene Orientierung gilt für den ganzen gemeldeten Plantag, einschliesslich bereits vergangener Tageszeit. Sie behauptet keine ab jetzt verfügbaren Uhrzeitblöcke und wird je Kontext betrachtet, nicht über mehrere Arbeitgeber aufsummiert. Die ausdrückliche Vorschauerstellung berücksichtigt bekannte positive native Minutendauern vorsichtig anhand der unteren Grenze. Unbekannte Dauer bleibt unbekannt; keine künstliche Null oder genaue Schätzung. Wenige passende Aufgaben werden nicht aufgefüllt. Eine erreichte echte Deadline kann mit deutlichem Passungshinweis sichtbar bleiben. Die vollständige Aufgabenansicht und bewusste manuelle Aufnahme bleiben verfügbar.

Eine neue Kalenderfassung mutiert niemals einen vorhandenen Entwurf oder bestätigten Plan. Ein Hinweis vergleicht die aktuelle Kalendergrundlage mit der bei der Vorschau gespeicherten Fassung. Die Datenbank friert diese Grundlage ab Beginn der Bestätigung ein; die Planhistorie bleibt unabhängig von der Snapshotaufbewahrung erhalten.

## Ausführung und Schutz

Manuelle Leseabsichten binden die tatsächlich geprüfte Sitzung; geplante Reads benutzen den internen Guard für ein weiterhin aktives, MFA-geschütztes Konto, ohne Sitzungserneuerung oder Todoist-Schreibbefugnis. Externe Reads erfolgen ausserhalb des zentralen Identitätslocks. Vor atomarer Übernahme werden Sitzung beziehungsweise Kontostatus, Credentialgeneration, Konfigurationsrevision, aktive Kontextrevisionen und Claim erneut geprüft. Überholte Ergebnisse werden verworfen.

Pro Leseabsicht maximal drei Versuche mit Backoff und begrenztem Retry-After. Auth-, Rechte-, URL- und Vertragsfehler benötigen bewusste erneute Prüfung. Nach ausgeschöpften vorübergehenden Fehlern frühestens nach 15 Minuten eine neue Hintergrundabsicht. Queuepayloads enthalten nur Integrations- und Request-ID. RESTORE_MODE sperrt Leser und Bereinigung. Todoist-Operationsjournal und KI-Worker bleiben eigenständig bedienbar.

[Verifizierter externer Vertrag und offene Live-Nachweise](../integrations/termihub.md), [Bedienung](../runbooks/termihub.md), [E9-Prüfbericht](../development/e9-verification.md).

Ein vorgemerkter oder laufender Leseversuch ist kein Erfolgsnachweis. Insbesondere während Wiederholungen nach einem Fehler wird kein verlässliches Budget aus der alten Fassung freigegeben. Erst nachgewiesener erfolgreicher Abruf und passende Quellrevisionen erlauben wieder die frische Orientierung; manuelle Planung bleibt verfügbar.
