# E6 – Lokale KI und gemeinsamer Fortschrittsworkflow

E6 erweitert das frameworkfreie TypeScript-Backend. Windows führt Web, Node-Worker und PostgreSQL aus; der vorhandene Ubuntu-KI-Server mit RTX 4060 liefert Ollama über das private LAN. Auch eine spätere Helios-Installation verwendet denselben konfigurierbaren Endpunkt. Kein Ollama auf Windows, kein neuer Dienst und keine öffentliche Portfreigabe.

## Verträge und Grenzen

Zentrale Module unter packages/backend/src/ai: Konfiguration, Quellen, versionierte Prompts/Schemas, Ollama, semantische Validierung, Entwurfsservice/-store, pg-boss-Worker und enge Statuspolicy. Nur der Worker ruft das Modell auf. Private IPv4-/Loopback-Adressen und der Docker-Hostalias sind zulässig; Credentials, URL-Pfade, Redirects und öffentliche Ziele sind abgewiesen. Vor jedem Chat wird /api/show geprüft: lokales GGUF-Textmodell, keine remote_host/remote_model-Weiterleitung. Keine Cloudschlüssel, Tools, Downloads, Linkabrufe oder Cloudfallbacks.

Modell, Prompt und Schema sind am Entwurf gespeichert. JSON-Schema wird an /api/chat übermittelt; Zod und semantische Regeln prüfen danach unter anderem Patchart, Belegzitat, konkrete Checkboxreferenz, Datum/Deadline, Wertebereich und Quellenbezug. Ein wortgleicher bereits vorhandener Checklistenpunkt kann als No-op verworfen werden; die Validierungsnotiz bleibt sichtbar. Andere ungültige Antworten führen höchstens zu einem zweiten Versuch und danach zu einem nachvollziehbaren Fehler. KI-Signale sind keine bewiesenen Tatsachen.

## Persistenz und Jobs

Additive Migration 0008 ergänzt ai_drafts und ai_task_signals. Entwürfe halten Originaltext, Benutzer-/Kontext-/Aufgabenbezug, manuelle Formularwerte, Quellensnapshot/Fingerprints, Revision, Modell-/Prompt-/Schemaversion, Vorschläge, bearbeitete Werte, Einzelentscheidungen, Claim, Versuche und Operationsreferenzen. Signale halten die letzte Analysebasis, die ausdrücklich bestätigte Klarheitsfassung und die Herkunft der Statuslabelpflege. Keine zweite führende Aufgabenwahrheit.

Die persistente Entwurfsanlage ist zugleich ein transaktionales Outboxsignal. Der Dispatcher schreibt pg-boss-Job und Job-ID atomar; der Jobpayload enthält nur die Entwurfs-ID. Dieselbe vorhandene pg-boss-Instanz übernimmt die KI-Jobs. Priorität 20 für bewusste KI-Aktionen, 10 für Hintergrundanalyse; spätere Vorbereitung erhält niedrigere Priorität. Bestätigte Benutzeroperationen haben vor neuer Inferenz Vorrang. Ein PostgreSQL-Advisory-Lock begrenzt Modellaufrufe auch über mehrere Worker auf einen pro Anwendungsdatenbank. Während HTTP-Aufrufen bleibt keine DB-Transaktion offen. Ein bereits laufender Modellaufruf wird durch höhere Priorität nicht rückwirkend verdrängt.

Abbruch invalidiert den Claim und bricht den HTTP-Aufruf ab. Worker-Shutdown bricht aktive Aufrufe kontrolliert ab; ein unbekannter oder unterbrochener Lauf bewahrt Originaltext und Versuchszähler. Quellen-/Kontext-/Credentialänderung verwirft veraltete Ergebnisse. Interaktive Ergebnisse werden mit der weiterhin gültigen MFA-Sitzung atomar übernommen. Restore blockiert Worker und Mutationen; alte Jobs verleihen keine neue Berechtigung.

## Managed-only-Analyse und Klarheit

Eingang und fremde Projekte sind an Enqueue, Ausführung und Analysestatusmutation ausgeschlossen. Jede Stufe prüft aktive Kontextzuordnung, Projektkatalog, Credentialgeneration und natives Projekt erneut. Der Prompt enthält ausschliesslich die benötigte Aufgabe, Kommentare und zulässigen Elternkontext desselben Projekts; keine Session-/Integrationsdaten oder globalen Arbeitgeberlisten.

Ein begrenzter Worker-Scan entdeckt neue/veränderte verwaltete Aufgaben. Unveränderte Analysefingerprints werden nicht erneut eingereiht; need_context und reine Aktualisierungszeitpunkte gehören nicht zur inhaltlichen Analysebasis. Nach nachgewiesenem Fortschritt wird eine gezielte Folgeanalyse atomar vorgemerkt. Ein veraltetes Planungsdatum bleibt ein gesonderter Hinweis und ändert allein weder Deadline noch Planbarkeit.

Ist klar speichert die konkrete Inhaltsfassung einschliesslich relevanter Kommentare/Elternbasis. Derselbe Inhalt wird nicht erneut automatisch als unklar markiert. Automatisch erlaubt ist ausschliesslich need_context nach konkretem Klärungsgrund und Fragen; optionale Beschreibung/Datum/Projekt allein reichen nicht. Entfernen ohne neue Benutzerentscheidung ist auf ein von Helios gepflegtes Label beschränkt. Die enge Systempolicy kann nur diese eine Labeldifferenz über das vorhandene E4-Journal autorisieren; sie erteilt keine Inhalts-, Create-, Move- oder Abschlussberechtigung.

## Bestätigte Einzeländerungen

Alle Inhaltsänderungen verwenden E3/E4-Operationsjournal, denselben Workerlock, Quellenprüfung, Request-IDs, Checkpoints, Read-back und Unknown-Regeln. Ein Entwurfsschritt und seine E4-Operation werden atomar verknüpft. Ein HTTP 202 bedeutet nur Annahme. Erst extern nachgewiesene Einzelergebnisse markieren Patches als erledigt und aktualisieren die belegte Quellenbasis für folgende ausgewählte Patches.

Der gemeinsame Fortschrittsdialog speichert ausgewählte Schritte nacheinander. Beim Schliessen, Fehler oder Unknown bleiben offene Schritte erhalten; ein erneut geöffneter Dialog verlangt bewusste Fortsetzung. Erfolgreiche Kommentare/Creates werden nicht wiederholt. Zwischenzeitliche externe Änderungen erzeugen einen Konflikt, statt eine neuere Beschreibung zu überschreiben. Keine Exactly-once-/CAS-Garantie gegenüber Todoist. E7 verwendet denselben Dialog/Service; E7 selbst ist nicht implementiert.

Checklisten nutzen den bestehenden Markdown-Parser und gezielte Zeichen-/Abschnittspatches. Nur ## Checkliste wird ergänzt oder ein ausdrücklich gewähltes vorhandenes Kontrollkästchen verändert. Fremde Abschnitte und bestehende Punkte bleiben erhalten. Mehrdeutige, doppelte oder nicht unterstützte Strukturen sind Konflikte. Vollständige Checklist-/Epicverwaltung folgt in E8.

## Aufbewahrung

Benutzerfreigabe vom 15.10.2026: angewandte und abgelehnte Entwürfe samt Rohtext nach 30 Tagen löschen; offene/fehlgeschlagene und wiederaufnehmbare abgebrochene Entwürfe bis bewusster Bereinigung erhalten. Die vorhandenen E4-Nachweise bestätigter externer Operationen werden dadurch nicht rückwirkend gelöscht. Gespeicherte Tagespläne und Formulare hängen nicht von Ollama ab.

Das zentrale Journal vergleicht den tatsächlich eingereihten Befehl nochmals mit den ausgewählten bearbeiteten Einzelpatches. Belege müssen aus wirklichen Eingabe-/Aufgabentexten stammen; JSON-Schlüssel und leere Metadaten zählen nicht als Beleg. Der Hintergrundscan hält pro Kontext einen eigenen Cursor, damit auch unterschiedlich grosse Arbeitgeberprojekte berücksichtigt werden. Aufbewahrungsbereinigung überspringt Entwürfe mit noch offenen verknüpften Operationen.

E8 nutzt dasselbe Laufgerüst für SMART, semantische Zerlegung und abgeleitetes Epic-Verständnis. Ziele/Checklisten bleiben Todoist-Markdown. Benutzerkorrekturen und relevante Kindkommentare sind Quellenabhängigkeiten, auch für untergeordnete Analysen. [E8-Architektur](epics-smart-goals.md).
