# E6 – Lokale KI und Fortschritt: Prüfbericht

Stand: 15. Oktober 2026. Umsetzung auf feat/e6-local-ai-progress von develop 0644360. Technische Abnahme läuft; kein Merge oder vollständiger E6-Abschluss behauptet. Manuelle E3–E5-Abnahmen bleiben ausdrücklich offen.

## Quellen und Infrastruktur

E6-Auftrag samt Ergänzung zur verteilten Infrastruktur, AGENTS, README, Implementierungsplan, technische Architektur, E4-/E5-Berichte, bestehende Aufgaben-/Operations-/Workerverträge gelesen. Freigegebenes [Lastenheft](https://app.notion.com/p/3f77667a045981c0b688c82885b82ca1), [ADRs](https://app.notion.com/p/3f87667a04598161aae9f9f5550b59cf) und [Entwicklungsrichtlinien](https://app.notion.com/p/3f97667a045981ff8a59eba6c4780050) erneut abgerufen. Sites-Projekt bestätigt weiterhin V2; vorhandene Shell-/Dialoggestaltung fortgeführt. Relevant: LH-011/017/034–035/040–045/047/053/063/092–093 und AT-01/02/03/11/12 im E6-Umfang.

Windows-PC und Helios-Worker erreichen den vorhandenen Ubuntu-KI-Server im privaten LAN; Ollama meldet 0.40.4. Kein Ollama installiert, kein Modell heruntergeladen, kein öffentlicher Port freigegeben und keine Cloud-KI verwendet. Konkrete LAN-Adresse bleibt privat. Benutzer hat die 30-Tage-Bereinigung erledigter/abgelehnter Entwürfe ausdrücklich bestätigt.

## Tatsächliche Modellprüfung

[Ausführliche Konfiguration und Modellwahl](../integrations/ollama.md). Vorhandene Kandidaten llama3.2:3b, qwen2.5:7b-instruct, qwen3-vl:8b-instruct, qwen3-vl:8b und mistral-small3.1:24b wurden mit synthetischen Erfassungs-, Klarheits-, Aufwands-, Fortschritts-, Checklisten-/Unteraufgaben-, Mehrdeutigkeits-, Injection- und veralteten-Datum-Fällen untersucht. Frühere unzureichende Schemata und fachliche Fehler wurden nicht als erfolgreiche Modellqualität gewertet.

Gewählt: ein Profil qwen3-vl:8b-instruct. Neun abschliessende Aufrufe mit tatsächlichem Worker-Datenvertrag, jeweils ein Versuch bis zu strukturell/semantisch validiertem Ergebnis: 2,399–10,853 Sekunden, Median 3,949 Sekunden. Gemeldete Modellresidenz 8,09 GB, davon 6,16 GB VRAM. Keine allgemeine Qualitätsgarantie: das Modell kann unnötige Rückfragen, zu sichere Schätzformulierungen und überflüssige verwandte Schritte vorschlagen. Felder/Termine werden nicht automatisch geschrieben; die Prüfung durch den Benutzer bleibt zwingend.

## Implementierung

[Architektur](../architecture/local-ai-progress.md), [API](../integrations/ai-api.md). Additive Migration 0008 ergänzt Entwürfe und Klarheitssignale; E3-Pläne und ihre Historie werden nicht geändert. Persistente Originaleingaben und manuelle Werte, Modell-/Prompt-/Schemaversionen, Quellenfingerprints, typisierte Einzelpatches und E4-Verknüpfungen. Der bestehende pg-boss-Worker verarbeitet KI mit begrenzter Konkurrenz und Prioritäten. Keine zweite externe Schreibpipeline.

KI-Erfassung, managed-only-Analyse, Aufgabenklärung/ Ist klar und ein gemeinsamer wiederverwendbarer Fortschrittsdialog sind implementiert. Inhaltsänderungen nur nach Einzelentscheidung über E4-Journal; native Hierarchien, Recurrence und Unknown-Regeln gelten unverändert. Checklisten werden verlustarm gepatcht, keine Gesamtneuformatierung. Automatische Rechte sind ausschliesslich auf die enge need_context-Policy beschränkt.

## Bisher tatsächlich bestandene Prüfungen

Aktuelle Unit-/Vertragssuite: 84 Tests bestanden. Frühere Gesamtregression: 150 PostgreSQL-Tests bestanden; die finale erweiterte Suite läuft. E6-Risikofälle prüfen unter anderem echter pg-boss-Outbox-/Prioritätsnachweis, Abbruch, unterbrochener Worker, begrenzte Aufrufe, Sessionwiderruf, Scopewechsel, Quellenkonflikte, manuelle Felder, einzelne Checkboxziele, Follow-up und Unknown-Kommentar ohne Doppelwrite. Build/Typprüfung mehrfach bestanden; keine Schemadrift, Produktions-Audit ohne bekannte Schwachstellen. Verschlüsselte E5→E6-Restore-Probe mit neun synthetischen Tabellen bestanden: bestehende Pläne/Historie/Reserve, unbekannter Request sowie KI-Rohtext, Benutzerwerte, Zeitzone und Signale erhalten; keine Worker oder externen Aufrufe, kein Klartextdump. Finale Browser-/Docker-/CI-/Security-Abnahme läuft.

## Behobene Fehler und Grenzen

Gemessene Modellfehler führten zu getrennten Schemas, konkreten Beispielen, Beleg-/Ziel-/Datumsprüfung und begrenzten Retries. Wortgleiche doppelte Checkboxergänzungen werden als nachvollziehbarer No-op verworfen. Remote-/Cloudmodellmetadata wird vor Chat abgewiesen. Enqueue-/Commitrennen bei Kontext/Credentials/Sitzungen werden konservativ behandelt. Dispatcher darf ein inzwischen fertiges Ergebnis nicht durch einen alten Jobstatus überschreiben.

Bestehende E4-Live-Verträge wurden wiederverwendet, keine neuen realen Todoist-Schreibtests in E6 behauptet. Deadline-Schreiben war im separaten E4-Testkonto mit HTTP 403 gesperrt; E6-Vertragstests sind dafür synthetisch. Keine Exactly-once-/CAS-Garantie gegenüber Todoist. Ein einzelner bereits laufender lokaler Modellaufruf ist nicht präemptiv. Offene Patches werden nach Schliessen des Dialogs bewusst fortgesetzt. Modellresidenz ist kein vollständig gemessener System-Ressourcenverbrauch; physische Mobilabnahme fehlt. Keine E7-Implementierung, kein main-Merge, Release, Docker-Hub-Push oder Produktivdeployment.

[Bedienung, Fehlerfälle und spätere gemeinsame manuelle E3–E6-Abnahme](../runbooks/ai-progress.md).
