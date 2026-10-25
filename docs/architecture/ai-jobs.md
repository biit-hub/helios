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

## F-001.2: Verarbeitung und Ergebnisworkflow

Der zusätzliche pg-boss-Kanal `helios.ai-jobs` ist ein exklusives Wecksignal, keine zweite Auftragsdatenbank. Der Worker wählt unter dem PostgreSQL-Queue-Lock die nächste persistente Prioritäts-/FIFO-Zeile und bindet einen eigenen Ausführungsclaim. Der globale Running-Index verhindert einen zweiten Claim. Zusätzlich verwendet die tatsächliche Ausführung denselben Session-Advisory-Lock wie E6; eine noch laufende E6-Inferenz wird nicht unterbrochen. pg-boss wiederholt keinen Modellversuch automatisch. Nach einem verlorenen Prozess oder unklaren Inferenztransport bleibt der Running-Claim bis zum Ablauf der 270-Sekunden-Sicherheitsfrist gesperrt, wird dann als unterbrochen dokumentiert und nur auf bewusste Entscheidung erneut eingereiht. Verspätete Antworten benötigen weiterhin denselben laufenden Claim und eine gültige Frist. Browser-Schliessen beeinflusst bereits angenommene lokale Arbeit nicht.

Lokale Verarbeitung und Ergebnisübernahme verwenden den bestehenden zentralen `withBackgroundUser`-Guard: aktives lokales Konto, aktiviertes MFA und kein Restore. Dies gewährt **keine** Autorisierung für Todoist-Schreibvorgänge. Native Create-/Close-Operationen benötigen unverändert eine gültige E4-Operationssitzung und Intentfrist. Abgelaufene Sitzungen werden vom Hintergrundjob weder erneuert noch nachgebildet.

Jeder Versuch protokolliert Modell, Digest, Parameter, Prompt-/Schemaversion, Eingabehash, begrenzte Rohantwort, verfügbare Laufzeit-/Tokenmetriken und Ausgang. Ein erledigter Versuch ist unveränderlich. Vor und nach der Inferenz werden das gebundene installierte lokale Modell und dessen Digest geprüft; eine andere inzwischen konfigurierte Modellwahl ersetzt ihn nicht. Deaktivierte Ausgaben werden vor Ausführung abgewiesen. Kein Pull, kein Cloudmodell und kein Modellwechsel als Fehlerbehandlung.

Der Adapter nutzt [Ollama Chat](https://docs.ollama.com/api/chat) mit JSON-Schema, `stream=false`, Temperatur 0, Kontextbudget 8192, Ausgabebudget 4096 und `keep_alive=5m`. Laufzeit höchstens 180 Sekunden, Antwortkörper höchstens 64 KiB, serialisierte Gesprächseingabe höchstens 60.000 Zeichen. Ergebnisse werden strikt als Rückfrage oder Resultat validiert; Toolcalls und freie Dateipfade sind nicht Teil des Vertrags. Keine Codeausführung. Zu grosse Verläufe scheitern verständlich, statt historische Beiträge still zu entfernen. Pro Auftrag maximal 100 Beiträge beziehungsweise Versuche.

### Rückfragen, Nachbearbeitung und Abschluss

Eine persistierte Frage gehört zu einem bestimmten Auftrag und Versuch. Nur deren aktuelle, noch unbeantwortete Kennung kann beantwortet werden; Datenbankconstraints verhindern fremde oder doppelte Antworten. Die Antwort wird zusammen mit normaler Wiedereinreihung atomar gespeichert. Sie benötigt keinen weiteren Startklick und behält dieselbe Auftrags-ID. Priorität wird bei einem neuen Bearbeitungszyklus zurückgesetzt. Eine Frage gibt den aktiven Slot frei.

Nachbearbeitung ist nur aus `ready` möglich und speichert einen neuen unveränderlichen Gesprächsbeitrag. Vorherige Prompts, Dateien und Ergebnisse bleiben erhalten. Jede erfolgreiche neue Bearbeitung erzeugt eine neue Ergebnisversion. `ready` führt weder zum lokalen Abschluss noch zu Todoist-Schreibzugriffen.

`POST /api/ai-jobs/answer`, `/refine`, `/retry`, `/close` und `/delete` prüfen Eigentümer, aktives MFA, Origin, Revision und einen stabilen Idempotenzschlüssel. Antwort/Nachbearbeitung werden automatisch eingereiht; Retry ist eine bewusste neue lokale Ausführung. Bei unklarer HTTP-Rückmeldung bleibt die genaue Anfrage erhalten. Lesender Abgleich der gespeicherten Ereignisschlüssel kann den Erfolg nachweisen. Eine identische Wiederanfrage erzeugt keinen zweiten Gesprächsbeitrag und keinen zweiten nativen Vorgang.

Der bewusste Abschluss speichert zuerst den lokalen Abschluss. Für eine Referenz wird danach derselbe E4-Abschlussvertrag genutzt: exakte gespeicherte Kind-ID, Projekt, Eltern-ID, Titel und unveränderte reine Referenz, keine Wiederholung oder offenen Kinder. Nur diese Unteraufgabe wird nativ geschlossen. Der gewöhnliche vorgängige Abschnittswechsel entfällt ausschliesslich bei diesem internen Referenzvertrag, weil Todoist das Kind dabei von der Hauptaufgabe lösen würde. Elterninhalte werden vor und nach dem Schreiben geprüft. Ursprüngliche Hauptaufgaben werden nicht verändert. Lokaler Abschluss und noch unbestätigter nativer Abschluss bleiben getrennt sichtbar. Ein unbekanntes Close wird ausschliesslich über das vorhandene E4-Journal abgeglichen; kein blindes Replay. Ist bereits die Zulassung des nativen Journals gescheitert, kann der Benutzer dessen Vorbereitung mit demselben Schlüssel bewusst fortsetzen.

### Recherche

`RESEARCH_SEARXNG_BASE_URL` bezeichnet ausschliesslich einen bereits vorhandenen, kontrollierten privaten SearXNG-Origin. Helios installiert dafür keinen Dienst, übernimmt keine Browsercookies und verwendet keine Codex-/Cloud-KI als Backend. Die [SearXNG-JSON-Suche](https://docs.searxng.org/dev/search_api.html) muss am vorhandenen Gateway freigegeben sein. Ohne Anschluss scheitert ein Rechercheauftrag sichtbar; Helios behauptet dann keine aktuellen Fakten.

Vor der ersten Suche fragt Helios nach maximal 300 Zeichen ausdrücklich öffentlicher Suchbegriffe. Nur diese Begriffe gelangen an das Gateway. Originalprompt und vollständiger lokaler Gesprächsverlauf werden nicht an einen Suchanbieter weitergegeben. Bis zu fünf Treffer werden kontrolliert gelesen, maximal drei unterschiedliche lesbare Quellen übernommen. Such-/Quellenphase höchstens 30 Sekunden, einzelne Seiten höchstens 256 KiB, an das Modell höchstens 4500 Zeichen je Quelle. URLs, Titel und tatsächlicher Abrufzeitpunkt stammen vom Adapter und werden mit der Ergebnisversion gespeichert. Modellseitig erfundene Quellen werden nicht als technische Nachweise übernommen.

Quellzugriffe erlauben nur öffentliche HTTP(S)-Ziele auf Standardports, ohne Zugangsdaten. Alle DNS-Antworten werden auf öffentliche Adressen geprüft und die Verbindung an eine geprüfte Adresse gebunden. Jeder Redirect wird erneut geprüft, höchstens zwei Weiterleitungen. Loopback, private Netze, Link-local/Metadatenadressen, Multicast, Dokumentations- und problematische Übergangsbereiche werden abgewiesen. Keine Anmeldung, Formulare, Cookies, externen Writes oder Skriptausführung. Quelltexte sind ausdrücklich nicht vertrauenswürdige Daten im begrenzten lokalen Modellvertrag und können keine zusätzlichen Werkzeuge oder Berechtigungen freischalten. Dynamisch gerenderte, geschützte oder übergrosse Quellen können nicht gelesen werden; fehlen ausreichende Quellen, wird der Auftrag als Fehler beendet.

### Dateien, Aufbewahrung und Probleme

Dateiergebnisse enthalten genau ein ausgewähltes Format. Das lokale Modell liefert ausschliesslich begrenzte Textabsätze und gegebenenfalls eine rechteckige Tabelle. Feste serverseitige Renderer erzeugen Word mit `docx`, Excel mit `write-excel-file`, CSV, PDF mit `pdf-lib`/`@pdf-lib/fontkit` oder Markdown. Excelzellen sind ausdrücklich Strings; CSV neutralisiert Formeleinstiege und verwendet korrekt gequotete Felder. Dokumente enthalten keine Makros, frei ausführbaren Templates, fremden Einbettungen oder modellgesteuerten Dateipfade. Markdown neutralisiert aktive HTML-/Linksyntax. PDF verwendet eine mitgelieferte lokale Schrift und Seitenumbruch; nicht unterstützte Zeichen scheitern verständlich.

Die unveränderte Noto-Sans-Regular-Schrift stammt aus dem [offiziellen Noto-Archiv](https://github.com/notofonts/noto-fonts/blob/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf), SHA-256 `b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5`. Die SIL-OFL-Lizenz liegt neben dem Font. Zur Laufzeit gibt es keinen Fontdownload.

Ein Artefakt ist höchstens 10 MiB gross; PDF höchstens 100 Seiten, gesamter F-001-Dateispeicher höchstens 1 GiB. Überschreitung erzeugt einen Fehler, keine automatische Datenlöschung. Artefakte bleiben als `bytea` zusammen mit Gespräch und Ergebnissen bis zur bewussten Aggregatlöschung in der geschützten Datenbank. Backups schliessen sie ein. `GET /api/ai-jobs/artifact?job=…&id=…` prüft aktive MFA und Eigentümer, Integrität/Grösse und liefert ausschliesslich einen privaten Download mit `nosniff`, Attachment und Sandbox-Header.

Die bewusste Löschung entfernt nur den eigenen lokalen Auftrag samt Verlauf/Dateien. Laufende/wartende Aufträge und aktive native Operationen sind gesperrt; zuerst stoppen beziehungsweise klären. Todoist-Aufgaben, fremde Datensätze, Backups und das E4-Journal werden nicht mitgelöscht. Alte Create-/Close-Journale prüfen, ob die lokale Referenz noch besteht; nach Löschung ist kein nachträgliches natives Resume erlaubt. Bestehende verschlüsselte Backups folgen ihrer bisherigen Aufbewahrung und werden durch lokale Löschung nicht rückwirkend verändert.

Fehlgeschlagene Aufträge und lokal abgeschlossene Aufträge mit unbestätigtem Referenzabschluss werden in der globalen Ansicht „Probleme“ verlinkt. Dort erscheinen keine Prompts oder Rohantworten. Diagnosen verwenden feste Fehlercodes ohne Netzwerkzugangsdaten. E6-Aufbewahrung, bestehende Verbindungsprobleme, Tagespläne und Review bleiben unabhängig. Keine aktive Benachrichtigung und kein neuer Glockenstatus.
