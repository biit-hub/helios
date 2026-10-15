# E6 – KI- und Entwurfsvertrag

GET /api/ai liefert höchstens 30 eigene persistente Entwürfe und die konfigurierte KI-Verfügbarkeit. Optionale Filter: id, contextId, taskId. Alle Zugriffe verlangen aktive MFA-Sitzung; Antworten sind no-store/private. Quellen-/Sessiongeheimnisse und Ollama-Adresse werden nicht an den Browser geliefert.

POST /api/ai/{action} verwendet denselben zentralen Domain-HTTP-Guard vor Parsing: kanonischer Origin, JSON, 64 KiB und fünf Sekunden Lesefrist. Unbekannte Felder werden abgewiesen. start/apply/retry liefern HTTP 202 ausschliesslich als Annahme, niemals als externen Speichernachweis.

- start: key, kind (capture/analysis/clarification/progress), contextId, optional taskId, input; bei capture optionale explizite manualFields aus dem vorhandenen Formular. Derselbe Key mit anderem Body ist ein Konflikt. Originaltext wird vor KI-Verarbeitung gespeichert. Manuelle Werte haben Vorrang.
- edit: id, revision und vollständige Liste der Patch-IDs mit value, selected, rejected und gegebenenfalls bewusst gewähltem Checkbox-target. Keine fremden IDs, doppelten Entscheidungen oder Änderung bereits ausgeführter Schritte. Ablehnung und Bearbeitung erzeugen keine Todoist-Mutation.
- apply: id, revision, key, projectId, confirmProject. Nur ausgewählte offene Patches werden angewandt. Bei Erfassung wird eine einzige Aufgabe aus den geprüften Feldern erstellt; ohne ausdrücklich bestätigtes Projekt im nativen Eingang. Ein Projektvorschlag ist keine Zustimmung. Fortschritt/Klärung verbieten Projektwechsel und verwenden die konkrete aktuelle Aufgabenbasis.
- clear: id/revision bestätigt Ist klar für die unveränderte Inhaltsfassung. Ein veralteter Entwurf darf keine neue Fassung bestätigen.
- cancel: id/revision invalidiert den KI-Claim; Originaltext bleibt erhalten. Laufende externe Schreiboperationen werden nicht als rückgängig gemacht dargestellt.
- retry: id/revision autorisiert eine neue begrenzte KI-Auswertung eines fehlgeschlagenen/abgebrochenen Entwurfs. Externe Unknown-Operationen werden ausschliesslich über /api/tasks/resume geprüft; kein neues Create/Comment/Close.

Patcharten sind strikt begrenzt: Titel und belegte Erfassungsfelder, Fortschrittskommentar, gezielte Beschreibungsergänzung, bestehendes Kontrollkästchen, neuer Checklistenpunkt, geprüfter Minutenaufwand und begründete eigenständig planbare Unteraufgabe. Kein Patch für Gesamtabschluss, Löschung oder beliebigen Integrationsaufruf. Datum und Deadline bleiben getrennt; nicht belegte Angaben werden abgewiesen.

Entwurfszustände: queued/running → ready/failed/stale/cancelled; bestätigte Einzeländerung applying → ready/applied/partial. Einzelstatus verweist auf die bestehende E4-Operation. Nur verified ist ein externer Nachweis. Originaleingaben, Vorschläge, Benutzerwerte und Teilergebnisse bleiben bei Ausfällen erhalten. Konkurrierende Entwurfsrevisionen erzeugen 409.

Die gemeinsame UI setzt weitere ausgewählte Patches nach bestätigtem Einzelergebnis fort, solange sie geöffnet ist. Nach Schliessen, Unknown oder Konflikt wird nicht blind weitergeschrieben. Manuelle Fortsetzung prüft Sitzung, Scope, Quellen und dieselbe Operation erneut.

POST /api/ai/reopen nimmt id/revision an und öffnet einen bekannten fehlgeschlagenen E4-Schritt nur dann zur erneuten Bearbeitung, wenn keine Wirkung und kein ungeklärter externer Request vorliegen. Bereits verifizierte Patches bleiben verifiziert. Bei Unknown oder Teilerfolg ist nur die sichere Wiederaufnahme derselben Operation zulässig.

Entwürfe speichern die ursprüngliche Zeitzone. Relative Angaben heute/morgen/übermorgen beziehen sich auf den lokalen Erstellungstag, auch nach einem Neustart. Eindeutige ISO-Daten und vollständige deutsche Datumsangaben sind zulässig; unbestimmtes «nächste Woche» erzeugt kein konkretes Datum. Deadline braucht zusätzlich ausdrücklichen Fristbeleg. Uhrzeiten werden nur als ausdrücklich belegter ISO-Zeitpunkt samt Offset übernommen.

E8 erweitert die bestehenden Entwürfe um smart/epic/decomposition und den goal-Patch. Kein neuer Writer; [API](epics-api.md), [SMART-/Beleg-/Korrekturvertrag](../architecture/epics-smart-goals.md).
