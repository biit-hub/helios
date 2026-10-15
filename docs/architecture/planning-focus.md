# E3 – Tagespläne, Fokus und Operationsjournal

Jeder aktive Kontext besitzt je lokalem Kalendertag einen eigenen Plan. PLAN_TIMEZONE ist ein IANA-Zonenname, standardmässig Europe/Zurich. Gespeicherte Pläne behalten ihre Zeitzone. Zeitpunkte liegen als timestamptz vor; Plantage als date. Nur heute ist schreibbar, historische Tage sind lesbar.

Die am 14. Oktober 2026 ausdrücklich bestätigte Ausnahme zu LH-021 erhält native Hierarchien: Unteraufgaben bleiben in ihrem Todoist-Abschnitt und werden lokal als Tagesauswahl bestätigt. Auch Container mit aktiven Kindern werden nicht verschoben, damit keine nicht ausgewählten Kinder mitwandern. Das ist kein zweiter Kanbanstatus. Geeignete eigenständige Aufgaben dürfen nach ausdrücklicher Planbestätigung nach In Arbeit wechseln. Fehlende/mehrdeutige Abschnitte werden nicht automatisch erstellt.

## Auswahl ohne KI

Nur aktive Projektionen des gewählten aktiven verwalteten Nicht-Eingangsprojekts, höchstens fünf Minuten alt, sind Kandidaten. Unbekannte/abgeschlossene/gelöschte/wartende Aufgaben, epic-Container und Kinder unter unbekannten oder blockierten Vorfahren sind ausgeschlossen. Zukünftig geplante Aufgaben bleiben draussen, ausser ihre echte Deadline ist bereits erreicht. Vergangene Planungsdaten bleiben geeignet.

Reihenfolge: frühere bekannte Deadline, früheres geplantes Datum, höhere Todoist-Priorität, bei sonst gleichen privaten Aufgaben Pflichten vor explizitem fun, bekannte kürzere Minutendauer, stabile ID. Fehlende Deadlines sortieren nach bekannten Deadlines, ohne ein Datum zu erfinden. In Arbeit allein gibt keinen Vorrang. Maximal fünf Hauptaufgaben, bei kleinerem Bestand weniger. Gründe nennen nur echte Faktoren. Keine erfundenen Fortschrittswerte, Zeitblöcke oder Tagesfüllungsprozente; kein Ollama erforderlich.

## Datenmodell und Konsistenz

Migration 0005 ergänzt daily_plans (Unique Kontext+Tag), plan_history (Unique Plan+Revision), plan_operations (Unique Benutzer+Idempotency-Key, eine Bestätigungsoperation pro Plan), plan_operation_steps und planning_observations. Geordnete Einträge sind typisiertes JSON mit Position, Task-ID, Originalquelle und Auswahlgründen. Jeder Zustandswechsel erzeugt einen historischen Snapshot.

Alle Browsermutationen verwenden identity.withActive samt bestehendem Single-User-Transaktionslock, MFA und Originprüfung. Drafts werden nur mit erwarteter Revision ersetzt. Bewusst bestätigte Teilmengen behalten ihre Vorschlagsreihenfolge. Danach sind Einträge, Datum und Quellen unveränderlich; PostgreSQL-Trigger schützen diese Daten und verbieten UPDATE/DELETE der Historie. Fokusänderung erzeugt eine neue Revision ohne Reorder. Neue dringende Aufgaben ersetzen keinen bestätigten Plan.

## Worker und externe Wirkung

Bestätigung speichert Planstatus confirming, Operation-ID, benutzergebundenen Idempotency-Key mit Requesthash, Session-ID, erwartete Revision, zehnminütige Intentfrist und Einzelschritte atomar. HTTP 202 bedeutet Annahme, keinen Todoist-Erfolg. Kein Session- oder Todoisttoken liegt im Journal. Derselbe Key mit anderem Body wird abgewiesen.

Das Journal ist zugleich die kleine transaktionale Outbox. Der bestehende Worker prüft alle drei Sekunden queued/running-Aufträge. Ein Session-Advisory-Lock serialisiert das Einzelkontosystem; beim Absturz wird er automatisch frei. Der pg-boss-Testjob bleibt erhalten. Netzwerkzugriffe halten nicht den E1.2-Transaktionslock. Der Worker erhält ein eigenes ausgehendes Netz todoist-egress ohne weitere Dienste oder Hostports und ohne Mitgliedschaft im Web-Frontendnetz.

Der interne zentrale withOperationSession-Guard prüft vor noch nicht gestarteten externen Schritten die echte erzeugende Sitzung, Ablauf, Identitätsstatus, vollständige MFA, Idlefrist sowie Plan-/Kontext-/Credentialscope. Hintergrundarbeit erneuert keine Benutzeraktivität. Logout kann bereits begonnene Wirkung nicht zurücknehmen; ein erbrachter Wirkungsnachweis bleibt dennoch erhalten.

Alle ausgewählten Quellen werden vor dem ersten Write nachgelesen. Pro Schritt werden Aufgabe, Projekt, Abschnitt und aktive Kinder erneut geprüft. Der getrennte Move-Adapter sendet ausschliesslich POST tasks/{id}/move mit section_id, festem API-v1-Origin, Redirectverbot, Timeout und stabiler X-Request-Id. Der E2-Reader bleibt GET-only. Erfolg benötigt einen GET-Nachweis des Zielabschnitts und unveränderter sinnvoller Quelle; bereits korrekt eingeordnete Aufgaben benötigen keinen neuen Move.

Nach Timeout/5xx zuerst nachlesen. Nicht nachgewiesene Wirkung bleibt unknown/partial. Nach einem Absturz mit sending-Marker wird ebenfalls zunächst reconciliiert; ohne Wirkungsnachweis braucht es ausdrückliche Wiederaufnahme. Diese liest wieder zuerst die Quelle und überspringt nachgewiesene Schritte. Rate-Limit-Pausen werden persistent für Operation und Integration geführt.

Erst bei vollständig nachgewiesenen verified- oder freigegebenen local-Schritten entsteht confirmed mit Bestätigungszeitpunkt. Andernfalls bleiben Einzelstände und ein zentraler Problemhinweis sichtbar. Geprüft bedeutet nicht behoben. Erst erfolgreicher Abschluss derselben Operation löst das Problem.

Todoist und PostgreSQL haben keinen gemeinsamen Commit und keinen hier nachgewiesenen Compare-and-swap-Vertrag. Eine direkte Cloudänderung genau zwischen Nachlesen und Move bleibt ein begrenztes Restrisiko. Keine Exactly-once- oder globale Atomaritätsgarantie.

## Oberfläche und Beobachtungen

Fokus unter /, Tagesplan unter /plan, E2-Lesesicht unter /tasks. Navigation behält den Kontext über dessen UUID. Planquellen sind als historische Quellen gekennzeichnet. Auswahl/Abwahl, Bestätigungsabsicht, erfolgreiche Bestätigung, manuelle Fokusänderung und übergangene Empfehlung werden mit Kontext, Revision und Zeitpunkt gespeichert. Keine wirksame Lernhypothese oder dauerhafte Abwertung.

Mobile Morgenroutine, E4-Aufgabenverwaltung, E5-Reserve/Reorder, Nachtplanung, KI und E8-Epicabschluss bleiben späteren Etappen vorbehalten.


## E9-Kalendergrundlage

[Kalenderorientierung](termihub-calendar.md) fliesst nur bei ausdrücklicher Vorschauerstellung ein. Bekannte positive native Dauern und vorsichtige untere Budgetgrenze, unbekannt bleibt unbekannt; wenige passende Aufgaben statt Pflichtquote. Veraltete/unvollständige Daten liefern kein verlässliches Budget. calendar_basis bleibt ab Bestätigung unveränderlich und in der Planhistorie erhalten; neue Kalenderfassungen erzeugen nur einen Hinweis.
