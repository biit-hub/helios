# Ollama im privaten Netzwerk

Helios und Codex laufen auf dem Windows-PC; Ollama läuft auf dem vorhandenen Ubuntu-KI-Server mit NVIDIA RTX 4060. Geprüfte Ollama-Version: 0.40.4. Windows- und Worker-Netzproben erfolgreich. Die private konkrete Adresse gehört ausschliesslich in die nicht eingecheckte Konfiguration.

## Konfiguration

OLLAMA_BASE_URL bezeichnet den vorhandenen privaten LAN-Endpunkt, beispielsweise http://192.168.1.20:11434. OLLAMA_MODEL ist ein ausdrücklich gewähltes installiertes Modell. OLLAMA_TIMEOUT_SECONDS liegt zwischen 5 und 180, Standard 90. Ohne URL/Modell bleiben Formular, Aufgabenverwaltung und gespeicherte Pläne nutzbar; KI-Entwürfe behalten bei Fehlern ihre Originaleingabe.

Compose übergibt die Konfiguration an Web und Worker; der Modellaufruf erfolgt im Worker. Ein Linux-Produktionshost braucht lediglich denselben erreichbaren privaten Endpunkt, keinen lokal installierten Ollama-Dienst. Keine öffentliche Portweiterleitung, kein NPM-Publishing des Ollama-Ports und kein KI-API-Key. Firewallzugang auf vertrauenswürdige Helios-Hosts im lokalen Netz beschränken; dieser Auftrag verändert den Server-/Routerbetrieb nicht.

## Geprüfte Modellwahl

Ein einziges Profil startet mit qwen3-vl:8b-instruct (bereits installiert, Q4_K_M, 8.8B laut API). Weitere tatsächlich getestete Kandidaten: llama3.2:3b, qwen2.5:7b-instruct, qwen3-vl:8b und mistral-small3.1:24b. Das Embeddingmodell wurde nicht als Textgenerator verwendet. Keine Modelle heruntergeladen oder Dienste installiert.

Die frühen gemischten Schemas zeigten erfundene Belege und unzulässige Patches. Getrennte Anwendungsfallschemas, konkrete Beispiele und deterministische Validierung verbesserten den Instruct-Kandidaten. Das 24B-Modell benötigt auf dieser Hardware CPU-/GPU-Aufteilung und war deutlich langsamer; das Thinking-Modell verbrauchte beim begrenzten Antwortbudget häufig seine Ausgabe für internes Denken. Kein nachgewiesener Nutzen mehrerer Produktivprofile.

Neun abschliessende synthetische Fälle mit tatsächlichem Worker-Datenvertrag: 2,399–10,853 Sekunden, Median 3,949 Sekunden, jeweils ein Aufruf bis zum validierten Ergebnis. /api/ps meldete rund 8,09 GB geladene Modellgrösse, davon 6,16 GB VRAM. Das sind API-Messwerte, keine vollständige System-RSS-/GPU-Telemetrie. Inhaltliche Schwankungen bleiben: gelegentlich unnötige Rückfragen, zu sichere Formulierungen oder überflüssige nahe verwandte Checklistenpunkte. Jede Inhaltsänderung bleibt einzeln prüfpflichtig; neun erfolgreiche Fälle sind keine allgemeine Genauigkeitsgarantie.

## API und Betrieb

Offizielle Grundlagen: [Chat](https://docs.ollama.com/api/chat), [strukturierte Ausgaben](https://docs.ollama.com/capabilities/structured-outputs), [Ollama API-Typen](https://pkg.go.dev/github.com/ollama/ollama/api). Der Adapter nutzt /api/show, /api/tags und /api/chat mit stream=false, JSON-Schema, Temperatur 0, begrenztem Kontext-/Ausgabebudget, begrenzten Antworten, Timeout und Redirectverbot. Remote-/Cloudmodelle werden vor Übermittlung von Aufgabeninhalten abgewiesen.

Netzprüfung zuerst vom Windows-PC, danach im Worker durchführen. /api/version und /api/tags sind lesend; /api/show prüft die vorhandenen lokalen Gewichte. Ein synthetischer Chat ist ein Inferenztest und kein Modell-Download. Fehlermeldungen und öffentliche Diagnoseausgaben dürfen keine privaten Aufgaben oder Konfiguration enthalten.

Vor jedem Aufruf wird das gewählte installierte Modell samt Digest nachgewiesen; der Digest wird im Entwurf protokolliert. Die finale synthetische Messung verwendet Prompt helios-e6-v4. Windows und der laufende Helios-Worker wurden am 15.10.2026 erneut lesend über /api/version geprüft.

## F-001.2

Die eigenständige KI-Auftragsverarbeitung verwendet die pro Ausgabe bestätigten lokalen Modelle und das vorhandene `OLLAMA_BASE_URL`. Hintergrundautorisierung, serieller GPU-Lock, Rechercheanschluss, Ausführungsgrenzen, Dateien und Recovery sind im [F-001-Vertrag](../architecture/ai-jobs.md#f-0012-verarbeitung-und-ergebnisworkflow) beschrieben. `OLLAMA_MODEL` bleibt das separate E6-Profil. Kein Cloud-Fallback oder Download. Die optionale `RESEARCH_SEARXNG_BASE_URL` ist ein vorhandener privater Suchgateway; ohne ihn ist eine positive Rechercheabnahme offen.
