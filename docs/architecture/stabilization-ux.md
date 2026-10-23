# E9.2 – Technische Präzisierungen zur Stabilisierung

Grundlage sind die bestätigten manuellen Befunde und der E9.2-Auftrag vom 23.10.2026. Keine neue Aufgabenwahrheit, Authentifizierungsarchitektur, Queue oder Datenbankmigration.

## Aktuelle Aufgaben und historische Nachweise

`GET /api/work?contextId=…` liefert `tasks` ausschliesslich für aktive, nicht gelöschte/nicht abgeschlossene Projektionen mit passender Kontext-, Projekt- und Credentialbindung und passender nativer Projekt-ID. `historicalTasks` ist ein eigener lesender Bereich für vorhandene historische/unknown-Nachweise. Unbekannt bedeutet weiterhin weder abgeschlossen noch gelöscht. Die Datenbankeinträge und bestätigte Planreferenzen bleiben erhalten.

Die Antwort enthält `projectId` und `contextRevision`. Der Browser akzeptiert sie nur zur passenden aktuellen Zuordnung; bei einer neueren Fassung wird der eigene Kontextkatalog erneut gelesen. Abgebrochene oder verspätete Antworten eines früher gewählten Kontexts ersetzen keine aktuelle Liste. Fehlende Verbindungen werden nicht als erfolgreicher Leerabruf ausgegeben.

Schreibbefugnis entsteht weiterhin durch frisches natives Nachlesen, Quellenfingerprint, aktuelle Sitzung/MFA, Projekt-/Kontext-/Credentialrevisionen und denselben Worker. Ein historischer Eintrag erhält keine Schreibaktion. Ein späterer tatsächlicher nativer Nachweis ist von der blossen Existenz im lokalen Cache zu unterscheiden.

## Nachgewiesene Aufgabenoperationen

HTTP 202 bleibt ausschliesslich Journalannahme. Erst succeeded mit vorhandenem E4-Nachweis schliesst den Formularworkflow und löst einen lokalen Listenreload aus. Der Worker legt die verifizierte Create-Projektion auch dann an, wenn zuvor keine Zeile existierte. Er behauptet damit keinen vollständigen Projektabruf; `lastSyncAt` bleibt unverändert.

Sofortiger Submitlock und derselbe Requestschlüssel sichern Doppelklicks ab. Unknown/Partial erhalten Eingaben und Operationsreferenz; Fortsetzung erfolgt ausschliesslich über das bestehende Journal. Konflikte werden nicht durch einen Reload über bearbeitete Eingaben hinweg aufgelöst.

## Zentrale Kontextwahl

Bestätigte Variante A: eine bewusste Auswahl über Fokus, Tagesplanung, Aufgaben und Epics. Nicht geheime Kontext-ID in URL und Browserpräferenz; die aktive eigene Kontextliste wird vor Verwendung geprüft. Keine Sitzung, Zugangsdaten oder Berechtigungen im Browserstorage. Die Präferenz verleiht keinerlei serverseitige Rechte.

Allgemeine Ansichten übernehmen die Auswahl, ändern sie jedoch nicht durch interne Schritte. Die mehrkontextfähige Morgenroutine führt ihren eigenen serverseitigen Cursor weiter. Eine entfernte/deaktivierte Auswahl erfordert eine neue bewusste Wahl; kein Privat-Fallback. Aktive unvollständig zugeordnete Kontexte bleiben erkennbar und führen zur Einrichtung. Laufende Formular-/Plan-/Dokumentänderungen sperren den Kontextwechsel und warnen vor einem Browserverlassen. Bestehende Journalaufträge behalten ihren ursprünglichen serverseitigen Scope.

## Labels und Projekteinstellungen

Die gemeinsame Labelauswahl liest die vollständigen persönlichen und geteilten Labelnamen über die bestehenden GET-Transportgrenzen. Sie erzeugt keine Labels. Bereits vorhandene Aufgabenlabels bleiben bei fehlendem Katalog erhalten; Hinzufügen ist nur aus dem realen Bestand möglich. Der Service und der Worker prüfen neu hinzugefügte Namen erneut. Unveränderte ursprüngliche Labels werden nicht wegen eines vorübergehend fehlenden Katalogs entfernt. Die separat autorisierte enge E6-Systempolicy für need_context bleibt unverändert.

Kanban-Vorschau liegt pro zugeordnetem Projekt in den Einstellungen. `sectionSetup` bindet neue Aufträge an `projectId`, `contextRevision` und die ausdrücklich angezeigten fehlenden Namen. Vor jeder Erstellung wird nativ nachgelesen, danach die vollständige Struktur geprüft. Mehrdeutige Abschnitte werden nicht umbenannt. Keine Aufgabe wird verändert. Bei Unknown gibt es nur Nachlesen/Wiederaufnahme desselben Auftrags.

Kompatibilität: Bereits vor E9.2 angenommene Abschnittsjournale tragen Projekt und Kontextrevision im unveränderten serverseitigen Payload; ihre ursprüngliche ausdrückliche Absicht umfasste alle vier Namen. Sie bleiben ausführbar. Neue öffentliche Aufträge ohne Vorschau-Bindung werden abgewiesen.

## Kalender und lokale KI

Kalenderhinweise nennen zur aktuellen Credentialgeneration passende offene, neu zu verifizierende oder nicht mehr verfügbare Quellen. Namen sind Darstellung und niemals Zuordnungsheuristik. Die vorsichtige Budgetregel bleibt unverändert; eine bewusste Zuordnung ersetzt keinen frischen externen Read.

[Gemessene KI-Laufzeiten](../development/e9.2-ai-performance.md): bestehende Outbox und derselbe KI-Consumer werden etwas häufiger geprüft. Konkurrenz eins, Prioritäten, Modell, Prompts, Validierung und Retrygrenze bleiben erhalten. Optionaler interner Timingbeobachter enthält keine Texte und beeinflusst den Ablauf auch bei eigenem Fehler nicht. Inaktive Panels pollen nicht; bereits bestätigtes Speichern bleibt beobachtet.

Der [Dreischrittdialog](../design/e9.2-ai-dialog-proposal.md) wurde am 23.10.2026 ausdrücklich freigegeben und im gemeinsamen E6-/E8-Panel umgesetzt. Die Bestätigungsansicht ist an Entwurf, Revision, Einzelentscheidungen und explizite Projektwahl gebunden. Änderungen während der Prüfung verlangen eine erneute Auswahlprüfung. Die bestehenden API-Verträge, Quellenprüfungen, Einzelpatchfreigaben und die sequenzielle Journalsteuerung bleiben unverändert; kein neuer Schreibpfad. Unknown/Partial zeigen Einzelstände und erlauben ausschliesslich die vorhandene Nachprüfung/Fortsetzung desselben Auftrags. Abbruch und Entwurfswechsel fragen vor dem Verwerfen ungespeicherter Eingaben; Original und technische Nachweise sind standardmässig eingeklappt.
