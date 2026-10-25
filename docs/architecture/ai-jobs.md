# F-001 – Lokale KI-Aufträge

Verbindliche Grundlage sind der ausdrückliche Gesamtauftrag und die späteren Benutzerentscheidungen vom 25.10.2026 im [F-001-Konzept](https://app.notion.com/p/3fa7667a045981baba58f77db300d90b). Das frühere separate Todoist-Kanban-Projekt ist verworfen. F-001.1 und F-001.2 sind eigenständige Etappen; E10 bleibt Lernfähigkeit und ist nicht beauftragt.

## F-001.1: Speicherung und Verwaltung

PostgreSQL führt den KI-Auftrag. Acht additive Tabellen enthalten Einstellungen, Auftrag, optionale native Referenz, Ereignisse, Ausführungsversuche, Gesprächsbeiträge, versionierte Ergebnisse und geschützte Binärartefakte. Bestehende E1–E9-Tabellen und deren Daten werden durch die Migration nicht umgebaut. Es gibt keine zweite lokale Wahrheit für gewöhnliche Todoist-Aufgaben.

Die vom Browser erzeugte UUID ist zugleich stabile Auftrags- und Erfassungs-ID, niemals ein Berechtigungsschlüssel. Originalprompt einschliesslich Formatierung, Ausgabe, Dateiformat, ausgewähltes Modell, Digest, Parameter und Erstellungszeit sind unveränderlich. Eine erneute Erfassung mit derselben ID und identischem Requesthash liest den bestehenden Auftrag. Andere Inhalte unter derselben ID werden abgewiesen. Ereignisse, Beiträge, Ergebnisse und Artefakte sind durch PostgreSQL gegen nachträgliche Änderung und einzelne Löschung geschützt. Spätere bewusste Löschung des gesamten eigenen Auftrags kann die zugehörigen Datensätze gemeinsam entfernen.

Die E6-Entwurfsaufbewahrung betrifft ausschliesslich `ai_drafts`. Für F-001 gibt es keine automatische 30-Tage-Löschung. Ergebnisse, Gesprächsverlauf und spätere Dateien gehören in die authentifiziert verschlüsselten Datenbanksicherungen; Dateien liegen als begrenzte `bytea`-Werte in PostgreSQL. Keine Modell-Dateipfade oder öffentlich erreichbaren Ergebnisordner.

## Authentifizierung und HTTP-Verträge

Alle Reads verwenden die zentrale aktive MFA-Sitzung und filtern nach Benutzer. Mutationen prüfen zusätzlich den bestehenden Origin-/CSRF-Guard und arbeiten innerhalb derselben `withActive`-Transaktion. Auftrags-IDs, Referenzen oder Downloadkennungen ersetzen keine Autorisierung. REST-Antworten sind privat und nicht cachebar. Restore-Modus sperrt neue Fachmutationen.

| Route                                    | Verhalten                                                                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/ai-jobs`                       | Eigene Übersicht, 20 Einträge je Seite, Statusfilter, neueste zuerst; optional älteste zuerst. Prompt/Ergebnis als 240-Zeichen-Auszug.    |
| `GET /api/ai-jobs?id=…`                  | Vollständiger eigener Auftrag, Original, Verlauf, Ergebnisversionen und technische Metadaten ohne Dateiinhalt.                            |
| `GET /api/ai-jobs?refTask=…&contextId=…` | Nur die eigene nachgewiesene native Referenz auflösen.                                                                                    |
| `GET /api/ai-jobs/settings`              | Gespeicherte Ausgabezuordnungen und aktuell geprüfte lokale Modelle, ohne Endpunkt oder Zugangsdaten.                                     |
| `POST /api/ai-jobs/settings`             | Revisions- und idempotenzgeschützte Konfiguration genau eines Modells je Ausgabe.                                                         |
| `POST /api/ai-jobs/create`               | Begrenzter Originalprompt, genau eine Ausgabe und nur bei Datei genau eines der fünf Formate. HTTP 202 bestätigt die persistente Annahme. |
| `POST /api/ai-jobs/prioritize`, `/stop`  | Nur noch wartende eigene Aufträge; erwartete Revision und Idempotenzschlüssel obligatorisch.                                              |

Ein unklarer Browser-Submit behält sämtliche Eingaben und dieselbe ID. Zuerst kann rein lesend der gespeicherte Auftrag abgeglichen werden. Eine bewusst erneut gesendete **identische lokale Erfassungsanfrage** verwendet dieselbe ID und dasselbe E4-Journal. Sie wiederholt keinen ungeklärten nativen Create. Neue IDs oder geänderte Inhalte werden dafür nicht automatisch erzeugt.

## Lokale Modelle

F-001 nutzt ausschliesslich `OLLAMA_BASE_URL` mit der bestehenden privaten Originprüfung. Die E6-Einstellung `OLLAMA_MODEL` bestimmt kein F-001-Modell. Die Erkennung liest `/api/tags` und prüft `/api/show`; sie startet weder Inferenz noch Pull/Download. Katalog höchstens 32 Modelle, höchstens drei gleichzeitige Metadatenabfragen, insgesamt 15 Sekunden und begrenzte Antwortkörper. Gleichzeitige Kataloganfragen innerhalb desselben Prozesses werden zusammengeführt; nach Abschluss wird wieder frisch gelesen. Installierter Digest, positive Grösse, GGUF, Completion-Fähigkeit und fehlende Cloud-/Remote-Merkmale sind Voraussetzung. Reine Einbettungsmodelle sind nicht auswählbar.

Alle Ausgaben sind zunächst deaktiviert. Fehlt ein Modell oder stimmt sein Digest nicht mehr mit der gespeicherten Wahl überein, bleibt die Ausgabe für neue Aufträge gesperrt. Ein Versionswechsel muss ausdrücklich gespeichert werden. Kein Ersatzmodell und kein Cloud-Fallback. Eine Ausgabe lässt sich auch bei ausgefallenem Ollama deaktivieren; die bisherige Auswahl bleibt nachvollziehbar. Jeder Auftrag bindet die zum Annahmezeitpunkt bestätigte Konfiguration und deren Revision; eine konkurrierende Einstellungsänderung verhindert die Annahme.

## Todoist-Referenz über E4

Spontane Aufträge haben keinen Kontext und erzeugen ausschliesslich lokale Datensätze. Delegation aus einer verwalteten Aufgabe prüft die frische E4-Aufgabenbasis. Auftrag, Referenz und E4-Create-Journal werden atomar in derselben Transaktion angenommen. Der native Auftrag enthält nur `KI Aufgabe <UUID>`, die native Eltern-/Projektzuordnung und gegebenenfalls das für die bestehende FUN-Hierarchieregel nötige Label. Prompt, Ergebnis und Gespräch erscheinen weder in Todoist noch im E4-Payload.

Unmittelbar vor dem nativen Schreiben und nach dem Nachweis werden die Ursprungsaufgabe und ihre fachlichen Felder erneut geprüft. Nur `updated_at` wird beim Elternfingerprint ausgenommen, weil das Erstellen eines Kindes diese Metadaten legitim ändern kann. Die Originalaufgabe wird nicht gepatcht, verschoben oder abgeschlossen. E4-Sitzung, Intentfrist, Credentialgeneration, Kontextrevision, Projektberechtigung, Request-ID, vorhandener Workerlock und Unknown-/Partial-Verifikation bleiben verbindlich.

`linking` gehört nicht zur ausführbaren Queue. Erst ein feldgenau nachgewiesenes natives Kind mit richtiger ID, Elternaufgabe, Projekt und Titel schaltet den lokalen Auftrag auf `queued`. Unbekannte oder partielle native Ergebnisse bleiben sichtbar gesperrt. Auch ein manueller E4-Resume darf einen Create ohne nachgewiesene Antwort-ID nicht blind wiederholen. Die verifizierte Kind-ID wird danach unveränderlich gespeichert. Eine reine Referenz darf weder erneut delegiert noch durch die unabhängige E6-Anreicherung verarbeitet werden; diese Sperre gilt auch für anhand lokaler Referenz, Elternzuordnung und exaktem ID-Titel erkennbare Kinder mit verlorener Create-Antwort. Nachgewiesene eigene Kind-IDs bleiben auch nach einem bewussten nativen Kontextwechsel als reine Referenz geschützt. Bei unbekannter Kind-ID bleibt die ursprüngliche Kontext-/Projekt-/Elternzuordnung für die Klassifikation erforderlich. Der Titel allein reicht nicht als Referenznachweis.

## Persistente Reihenfolge und Status

| Status           | Bedeutung                                                |
| ---------------- | -------------------------------------------------------- |
| `linking`        | Native Referenz noch nicht vollständig nachgewiesen.     |
| `queued`         | Wartet in der persistenten Queue.                        |
| `running`        | Genau ein aktiver F-001-Ausführungsclaim.                |
| `awaiting_input` | Rückfrage offen, kein aktiver Verarbeitungsslot.         |
| `ready`          | Ergebnis vorhanden, noch nicht menschlich abgeschlossen. |
| `closed`         | Bewusster Benutzerabschluss.                             |
| `stopped`        | Vor Beginn aus der Queue entfernt, Historie erhalten.    |
| `error`          | Prüfung/Ausführung fehlgeschlagen oder extern ungeklärt. |

Queueänderungen verwenden denselben PostgreSQL-Advisory-Lock `1748016`. Eine serverseitige Sequenz bestimmt FIFO auch bei gleichzeitigem Eingang oder gleicher Uhrzeit. Priorisierung bekommt einmalig eine eigene Sequenzposition; priorisierte Aufträge laufen vor normalen und untereinander FIFO nach Priorisierung. Erneutes Priorisieren verschiebt den Auftrag nicht. Stoppen prüft unter demselben Lock noch einmal Status und Revision. Eine partielle Unique-Constraint erlaubt global höchstens einen `running`-Datensatz; F-001.2 muss denselben Lock für Claim und Übergänge verwenden. Laufende Aufträge werden weder gestoppt noch unterbrochen. Höchstens 100 noch anzunehmende/wartende Aufträge begrenzen die Queue.

F-001.1 stellt diese persistente Verwaltung und die Grundstruktur der Ausführungs-/Ergebnisdaten bereit. **Es führt noch keine F-001-Inferenz aus.** Ollama-Worker/pg-boss-Dispatch, Fragenfortsetzung, Renderer, kontrollierte Recherche, bewusster Abschluss und globaler Problemabgleich folgen ausschliesslich in der separat geprüften Etappe F-001.2. Die bestehende E6-Verarbeitung bleibt eigenständig erhalten.
