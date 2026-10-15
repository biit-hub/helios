# Helios – Arbeitsregeln

- Aufträge, freigegebenes Lastenheft und ADRs beachten; aktuelle Ergänzungen gehen historischen Planungsmarkierungen vor. E1.1 und E1.2 sind getrennte Etappen; E2 ist separat beauftragt; E3 benötigt einen neuen Auftrag.
- Eigenständiges öffentliches Repository. Keine echten Secrets, privaten Pfade, Dumps, produktiven Konfigurationen oder realen Daten veröffentlichen. Altprojekt und dessen Container/Volumes unverändert lassen.
- develop integriert; feat/_, fix/_, docs/_, chore/_ über PR nach develop. Conventional Commits. Keine Featurecommits auf main. Keine stabilen Releases ohne ausdrücklichen menschlichen Auftrag.
- Fachlogik im frameworkfreien packages/backend; Browser nur contracts/ui. Next ist UI/HTTP-Adapter, Worker führt lange Arbeit aus. Keine unnötigen Dienste.
- Todoist bleibt führend; Eingang ohne KI; keine autonomen Inhaltsänderungen. Kontexte behalten getrennte Pläne/Reserve/Review. Fortschrittsworkflow ist gemeinsam. Ollama ausschliesslich lokal.
- E1.2: ein lokales Konto, keine offene Registrierung, Passwort+TOTP obligatorisch, widerrufbare DB-Sessions. Vertrauenswürdig maximal 30 Tage absolut, sonst 12 Stunden absolut/30 Minuten idle; Step-up fünf Minuten.
- SQL-Migrationen reviewen, kein Produktions-Schema-Push. Tests nur mit isolierter \_test-Datenbank und synthetischen Daten. Restore blockiert Jobs bis kontrollierter Freigabe.
- Vor PR: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm test:e2e, pnpm security:secrets, pnpm audit --prod und Compose-/Imagesmoke. Nicht ausführbare Checks ehrlich im Prüfbericht dokumentieren.
- Dokumentation/Changelog gehören zu jeder Änderung. Keine unbegründeten Erfolgsaussagen. Keine automatische Merge-/Release-/Produktionsaktion bei riskanten Änderungen.

- Better Auth 1.7.7 wird ausschliesslich intern über die Helios-Fassade aufgerufen; den rohen Handler niemals mounten. Signup ist nur im lokalen Bootstrap aktiviert. Kein öffentliches MFA-Abschalten, Passwortreset oder TOTP-Generator.
- Alle Fachzugriffe müssen createIdentityService(...).requireActive(...) bzw. die internen zentralen Guards benutzen; MFA-/Trust-/Fristfelder niemals aus Clientdaten übernehmen. Guardobjekte oder rohe Better-Auth-Antworten niemals an Browser serialisieren.
- Beim Enrollment-Cookiewechsel die tatsächlich neu validierte Sitzung verwenden, nicht ein möglicherweise veraltetes Tokenfeld der Bibliotheksantwort.
- Jede Identitätsmutation nutzt dieselbe PostgreSQL-Transaktion samt Single-User-Advisory-Lock. Erwartete Authfehler müssen Fehlversuchszähler persistieren; unerwartete Fehler rollen zurück.
- Tests verwenden künstliche Zugangsdaten und \_test-Datenbanken; kontrollierte Testuhr statt deaktivierter Replay-/Fristregeln. Browserfixtures dürfen niemals auf Dev/Prod zurückfallen.
- Admin-CLI nur interaktiv; Passwörter nicht als Argumente/Env/Logs. Einmaligen Setupnachweis nur lokal zeigen. Für Einmal-Admincontainer compose.admin.yaml mit Logtreiber none verwenden, niemals diesen Override mit up starten.

- E2: Todoist-Adapter bleibt GET-only mit festem Origin und Redirectverbot. Nie Eingang/fremde Tasks analysieren oder beim Verbinden Cloudinhalte verändern. Unvollständiges Paging darf keinen vollständigen Cache ersetzen. Fehlender Active-Task ist unknown, kein nachgewiesener Abschluss.
- Domainmutationen über identity.withActive in derselben Transaktion autorisieren; externe Reads ausserhalb des Locks. Vor Übernahme Session, Revisionen, Credentialgeneration, Claim und Kontextscope erneut prüfen. Keine überholten Antworten nach Tokenwechsel/Deaktivierung/Widerruf speichern.
- INTEGRATION_KEY separat von AUTH_SECRET und DB sichern; Token nur authentifiziert/mit Step-up entgegennehmen, nie zurückgeben. Testorigin nur unter test/\_test und Loopback; keine produktiven Fixture-Endpunkte.
- E2-Unit/Integration/E2E ausschliesslich synthetisch. Live-Verträge mit einem separaten Testaccount bewusst freigeben und Ergebnisse von Dokumentations-/Fixtureprüfungen unterscheiden. TermiHub-Referenzen sind lokal; keine erfundenen Endpunkte.

- E3-Backupfreigabe vom 14.10.2026: lokale verschlüsselte Sicherungen und isolierte Restore-Proben genügen. Synology erst bei Produktivinstallation; logischer Ordner Backups/Helios, tatsächlicher Zielpfad konfigurierbar, keine NAS-Zugangsdaten voraussetzen.
- E3 ist beauftragt: unabhängige Tagespläne, revisionsgeschützte Bestätigung, persistenter Fokus ohne Reorder. E4 ist seit 15.10.2026 ausdrücklich beauftragt; manuelle E3-Abnahme bleibt bewusst verschoben und offen. E5 ist seit 15.10.2026 ausdrücklich beauftragt; manuelle E3-/E4-Abnahmen bleiben offen. E6 ist seit 15.10.2026 ausdrücklich beauftragt; manuelle E3–E5-Abnahmen bleiben offen. E7 ist seit 15.10.2026 ausdrücklich beauftragt; manuelle E3–E6-Abnahmen bleiben offen. E8 ist seit 15.10.2026 ausdrücklich beauftragt; manuelle E3–E7-Abnahmen bleiben offen. E9 ist ausdrücklich beauftragt; manuelle E3–E8-Abnahmen bleiben offen. E10 bleibt gesperrt.
- E3-Hierarchieausnahme bestätigt: Unteraufgaben bleiben planbar und behalten ihren Todoist-Abschnitt. Container mit aktiven Kindern nicht still verschieben. Lokale Tagesauswahl ist kein zweiter Kanbanstatus.
- Planmoves nur über persistentes Operationsjournal und Worker, Sitzung/MFA/Scope vor noch nicht gestarteten Schritten prüfen. Nach Timeout/crash zuerst reconciliieren; unknown nicht automatisch replayen. Historie append-only, kein false confirmed bei Teilerfolg.

- E4: dasselbe Operationsjournal und derselbe Workerlock; keine zweite Schreibpipeline. Unbekanntes Create/Comment/Recurring-Close niemals automatisch replayen. Wartedetails nach ausdrücklicher Freigabe nur im abgegrenzten Beschreibungsabschnitt „## Helios – Wartedetails“, fremden Text verlustfrei erhalten.

- E6: ausschliesslich vorhandenes Ollama im privaten LAN über konfigurierbare OLLAMA_BASE_URL, keine Installation auf Windows, Cloudanbieter, Downloads oder öffentliche Portfreigabe. Modellresultate sind validierte Vorschläge. Eingang und fremde Projekte an Enqueue/Ausführung/Statuswrite ausschliessen. Inhaltliche Patches nur nach Einzelentscheidung über E4-Journal.
- E6-Aufbewahrung ausdrücklich bestätigt: erledigte und abgelehnte Entwürfe samt Rohtext nach 30 Tagen löschen; offene/fehlgeschlagene bis bewusster Bereinigung erhalten.

- E7: Routinezustand serverseitig und revisionsgesichert. Skip bleibt offen und mutiert keine Tasks. Review schlägt nur den letzten relevanten bestätigten früheren Kontextplan vor; ältere unbekannte Rückmeldungen historisch erhalten. Eingang bleibt ohne KI und Projektvorauswahl. Alle externen Schritte verwenden das bestehende Journal.

- E8: Epic bleibt native Todoist-Aufgabe mit epic-Label; Ziel und Checkliste sind Markdownabschnitte in Todoist. Benutzerkorrekturen und KI-Verständnis sind abgeleitete Daten mit Quellfassung, keine zweite Aufgabenwahrheit. Fehlende Aufgaben beweisen keinen Abschluss; F1 nur nach verifiziertem nativen Vertrag und ausdrücklicher Entscheidung.

- F1 nach Live-Nachweis ausdrücklich bestätigt: bei offenen Epic-Kindern nur bewusste Trennung aller offenen Teilbäume oder Abbruch. Vollständigen Trenn-/Inhalts-/Kommentar-/Hierarchienachweis vor Epic-Close verlangen; partial/unknown/conflict stoppen. Keine offene Behalten-Variante durch lokale Sonderwahrheit.

- Deadline-Präzisierung vom 15.10.2026: Erstellen/Ändern/Entfernen bleiben verbindlich. Separates Todoist-Testkonto ist nach Auftraggeberangabe Free, Produktivkonto kostenpflichtig mit Deadlines. Erfolg/Ablehnung automatisch nur synthetisch testen; niemals produktive Zugangsdaten/Aufgaben verwenden. HTTP 403 ist keine sichere Tarifdiagnose. Erfolgreiche berechtigungspflichtige Live-Deadline-Abnahme bleibt offen; keine Architekturänderung.

- E9: TermiHub nur über nachgewiesene externe Bearer-GET-Verträge; keine Änderungen am separaten TermiHub-Projekt und keine persönlichen Login-/Tokenbeschaffungen. Kontexte/Zuordnungen nur bewusst ändern, keine automatische Kontextaktivierung oder Umplanung bestätigter Pläne.
- E9 bestätigt: Snapshots 15 Minuten frisch, danach bei Bedarf aktualisieren; nach 30 Tagen ausschliesslich abgelaufene Snapshot-Versionen bereinigen. Keine Kalenderquellen, Zuordnungen, Credentials oder Planhistorien durch Cleanup ändern. Titel/Beschreibungen/Teilnehmer nicht dauerhaft speichern. Stale/partial/unmapped liefert kein zuverlässiges Planungsbudget.
- E9 bestätigt: BUSY/OUT_OF_OFFICE fest, FREE/WORKING_ELSEWHERE nicht automatisch blockierend, TENTATIVE/UNKNOWN/neue Werte unsicher. Budget-Spanne aus Intervallunion; keine doppelte Reise-/Terminbelegung. Manuelle Planung jederzeit.

- E9-Nachweis: sichere TermiHub-GET-Integration, explizite Quellenzuordnung, vorsichtige Intervallbudgets und Snapshot-Aufbewahrung implementiert; lokale E9-Installation mit verschlüsseltem Backup und Datenerhalt geprüft. Positive reale TermiHub-Reads ohne bereitgestellten Token sowie manuelle E3–E9-Abnahmen bleiben offen. Finaler Integrations-/Checknachweis in PR20 und E9-Prüfbericht; E10 weiterhin gesperrt.
