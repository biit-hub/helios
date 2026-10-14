# E3 – Prüfbericht

Stand: 14. Oktober 2026. E3 ist **nicht abgeschlossen**. Branch: feat/e3-planning-focus, Ausgangspunkt aktuelles develop nach E2. Noch keine E3-Planungsimplementierung, Migration, lokale Datenmigration oder PR-Integration. Kein main-Merge, Release, Docker-Hub-Push, Produktivdeployment oder E4.

## Quellen

E3-Auftrag, AGENTS.md, Implementierungsplan, technische Architektur und offene Entscheidungen sowie die aktuellen Notion-Quellen Lastenheft, ADRs und Entwicklungsrichtlinien gelesen. Fachlich relevant: LH-002/003/005/021/024/061–067/070–073 und F4/F5. Der jüngere E3-Auftrag erlaubt die zuvor in E2 ausgeschlossenen bestätigten Todoist-Schreiboperationen. Der E2-Leseadapter soll weiterhin GET-only bleiben.

## Separates Testkonto und Testscope

Der bereits in Helios verschlüsselt gespeicherte Token wurde ausschliesslich im Serverprozess entschlüsselt. Die Identität aus GET user wurde mit der vom Benutzer angegebenen Testkonto-Identität abgeglichen. Der vollständige Projektkatalog enthielt genau ein aktives Nicht-Eingangsprojekt namens „Helios Integration Tests“. Dessen opake Projekt-ID wurde über GET projects/{id} erneut verifiziert. Erst danach erfolgten die ausdrücklich beauftragten Schreibtests. Kontoidentität, Token, reale Projekt-/Aufgaben-IDs und rohe API-Antworten werden hier und im Repository nicht veröffentlicht.

Zwei Live-Testläufe legten ausschliesslich neue, eindeutig synthetisch bezeichnete Aufgaben und einen eigenen Quellabschnitt im verifizierten Testprojekt an. Ein fehlender Zielabschnitt „In Arbeit“ wurde nur in diesem Testprojekt angelegt und als eigener Testdatensatz registriert. Bereinigt wurden nur die selbst erzeugten IDs. Beide Läufe meldeten vollständige Bereinigung. Bestehende Aufgaben und Abschnitte wurden nicht umgebaut.

## Tatsächlich verifizierte API-v1-Verträge

Grundlage: am Prüftag erneut geladene [offizielle Todoist API v1](https://developer.todoist.com/api/v1/) plus die beschriebenen Live-Accounttests. Ergebnisse sind Beobachtungen dieser Testläufe, keine unbelegte Garantie über alle Wiederholungs- oder Fehlersituationen.

| Vertrag                                                    | Tatsächliches Ergebnis                                                                                                                                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET user / paginierte projects / project-ID / sections     | Testkonto, eindeutiger Projektname und ID sowie projektbezogene Abschnitte erfolgreich geprüft.                                                                                                      |
| POST tasks/{id}/move mit section_id                        | HTTP 200; gewünschter Abschnitt erreicht, Aufgabe bleibt aktiv.                                                                                                                                      |
| Bereits richtig eingeordnete Aufgabe erneut verschieben    | HTTP 200; aktive Aufgabe bleibt im Zielabschnitt.                                                                                                                                                    |
| Identischer Move mit derselben X-Request-Id                | HTTP 200; beobachteter Endzustand unverändert. Dies beweist keine allgemeine Exactly-once-Garantie.                                                                                                  |
| Nicht existierender Abschnitt                              | HTTP 400; Eltern-/Abschnittsbezug blieb unverändert.                                                                                                                                                 |
| Unteraufgabe einzeln in anderen Abschnitt verschieben      | HTTP 200; **parent_id wird entfernt**. Die Aufgabe wird zur Hauptaufgabe.                                                                                                                            |
| section_id und bisherige parent_id zusammen senden         | HTTP 400; die Elternbeziehung blieb erhalten, der Abschnitt wechselte nicht.                                                                                                                         |
| Oberaufgabe mit noch angehängter Unteraufgabe verschieben  | HTTP 200; Kind bleibt angehängt und erhält ebenfalls den Zielabschnitt.                                                                                                                              |
| Nativer Abschluss / Wiederöffnung (nur synthetische Daten) | Je HTTP 204; abgeschlossene Aufgabe per GET mit checked=true lesbar. Ein Oberaufgabenabschluss schloss auch das angehängte Kind. Nur Vertragsbeobachtung für spätere Etappen, keine E4-/E8-Funktion. |
| Eigene Testaufgabe löschen / danach lesen                  | Bereinigung erfolgreich; GET danach HTTP 404.                                                                                                                                                        |

## Fachliche Entscheidung vor Fortsetzung

Die Kombination aus „jede ausgewählte Aufgabe nach In Arbeit“ und unveränderter nativer Elternbeziehung ist bei einzeln ausgewählten Unteraufgaben über den geprüften Move-Vertrag nicht erfüllbar. Das Verschieben der Oberaufgabe wäre ebenfalls kein stiller Ersatz: Dabei wechseln auch nicht ausgewählte Kinder den Abschnitt. Das Backend darf weder die Hierarchie still auflösen noch zusätzliche Cloudaufgaben ungefragt umsortieren.

Dem Benutzer wurden deshalb zwei mögliche E3-Policies vorgelegt:

1. Unteraufgaben bleiben planbar; ihr Todoist-Abschnitt folgt weiter der Oberaufgabe. Die bestätigte Tagesauswahl wird als Helios-Plan gespeichert, ohne einen abweichenden externen Kanbanstatus zu erfinden. Abschnittsmutationen sind nur dort zulässig, wo keine unbestätigten Unteraufgaben mitverändert werden. Diese Ausnahme zu LH-021 benötigt ausdrückliche fachliche Freigabe.
2. Unteraufgaben werden vorläufig nicht automatisch in E3 eingeplant. Auch Hauptaufgaben mit nicht ausgewählten Kindern benötigen einen konservativen Ausschluss oder eine gesonderte bewusste Freigabe für den gesamten betroffenen Bestand.

Die Entscheidung steht bei Erstellung dieses Berichts aus. Gemäss E3-Auftrag wird die davon abhängige Implementierung angehalten. E3 wird nicht als fertig oder abgenommen gemeldet.

## Weitere offene Prüfungen

Plan-/Revisionsschema, deterministische Auswahl, Operationsjournal, Fokusansicht, Beobachtungen und zugehörige automatisierte Unit-/PostgreSQL-/Browser-/CI-/Dockerprüfungen sind noch nicht implementiert und daher nicht als bestanden ausgewiesen. Rate Limits, Timeouts, unbekannte Ergebnisse und konkurrierende Planbestätigungen wurden nicht live provoziert. Sie müssen mit kontrollierten Fakes und persistenter Wiederaufnahme geprüft werden; insbesondere darf ein Timeout niemals einen blinden erneuten Move auslösen.

Für echte lokale Pläne bleibt das Backupminimum aus O-10 relevant. Der bestehende verschlüsselte lokale E2-Sicherungsstand ersetzt keine bestätigte externe Backupablage.

Der bisherige Worker hatte nur das interne Docker-Netz und konnte Todoist nicht per DNS erreichen. Für die beaufsichtigten Vertragstests wurde er vorübergehend an das vorhandene ausgehende Webnetz angeschlossen. Die spätere Operationsausführung benötigt ausdrücklich ausgehenden Netzwerkzugang ohne neue Hostports; dies ist noch kein implementierter E3-Worker.
