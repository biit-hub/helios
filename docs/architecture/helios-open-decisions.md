> Historische Planungsgrundlage vom 14. Oktober 2026. E1.1-Auftrag und aktuelle ADRs gelten vorrangig; siehe [Architekturübersicht](README.md). Persönliche lokale Verweise wurden entfernt.

# Helios 2.0 - tatsaechlich offene Entscheidungen

Stand: 14. Oktober 2026. Grundlage sind Lastenheft, ADR-001 bis ADR-004 und [technische Neuplanung](helios-technical-architecture.md). Die nachstehenden Punkte sind noch nicht verbindlich festgelegt. Empfehlungen sind konkrete Startvorschlaege, keine bereits erteilte Umsetzungsfreigabe.

Externe Machbarkeitspruefungen und Bibliothekstests stehen im [Implementierungsplan](helios-implementation-plan.md); eine noch nicht getestete API-Faehigkeit ist keine vom Auftraggeber durch Zustimmung beweisbare Tatsache.

## O-01 - Ort und Identitaet des neuen Repositorys

| Punkt              | Entscheidung                                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sachverhalt        | Neue Codebasis ist beschlossen; Repositoryname, Remote/Organisation und lokaler Ablageort sind noch nicht genannt.                                                         |
| Optionen           | A: neues privates Repository mit eigener CI/Compose-Historie. B: strikt getrenntes neues Verzeichnis im bisherigen Repository.                                             |
| Vorteile/Nachteile | A trennt Releases/Secrets/Workflows klar, benoetigt neues Remote. B vermeidet Remoteanlage, erhoeht Risiko alter Imports/CI-/Compose-Verwechslung und gemeinsame Historie. |
| Empfehlung         | A, beispielsweise `helios-2`, eigenes Workspace-/Composeprojekt; Dokumente uebernehmen, kein Altcodeumzug.                                                                 |
| Auswirkungen       | Bestimmt Checkout, CI-Ziel, Rechte, Container-/Volumenpraefixe und Dokumentverweise.                                                                                       |
| Faellig            | Vor E1-Projektanlage. Auftraggeber nennt Name/Ort/Remote; jetzt wird nichts angelegt.                                                                                      |

## O-02 - Tatsaechlicher TermiHub-Lesevertrag

| Punkt              | Entscheidung                                                                                                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sachverhalt        | Instanz und verifizierter Vertrag fuer Arbeitgeber, Arbeitsbeginn/-dauer, Intervalle/Termine, Auth und Zeitzone fehlen als technische Quelle.                                                                                                                  |
| Optionen           | A: vorhandene dokumentierte lesende API mit allen benoetigten Daten. B: schmaler freigegebener Export-/Adaptervertrag, falls keine geeignete API existiert.                                                                                                    |
| Vorteile/Nachteile | A direkt und aktuell, abhaengig von vorhandenen Feldern/Rechten. B kann fehlende Felder vereinheitlichen, bedeutet Pflege in/bei TermiHub. Ein ICS-Kalender allein ist nur ausreichend, wenn auch Arbeitgeber/Arbeitsbeginn/-dauer eindeutig geliefert werden. |
| Empfehlung         | A zuerst anhand Dokumentation/Beispielantworten pruefen. B nur bei nachgewiesener Luecke; keine Endpunkte oder Datenfelder erfinden.                                                                                                                           |
| Auswirkungen       | Adapter, Mapping, Snapshotberechnung, Reminder-Vorlauf und Fehlerfallback. Nur lesende Verbindung erforderlich.                                                                                                                                                |
| Faellig            | Quelle/Instanzdaten in E2 einsammeln, Vertrag vor E9 und vor TermiHub-abhaengigem Push in E12 verbindlich.                                                                                                                                                     |

## O-03 - Kuerzere Sitzungsdauer und Step-up-Frist

| Punkt              | Entscheidung                                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Sachverhalt        | Nicht vertrauenswuerdige Geraete brauchen kuerzere Sessions; deren absolute/Idlefristen und Frische kritischer Reauth sind noch offen. |
| Optionen           | A: 12 Stunden absolut/30 Minuten idle, Step-up fuenf Minuten. B: acht Stunden/15 Minuten idle, Step-up zwei Minuten.                   |
| Vorteile/Nachteile | A angenehm im Arbeitsalltag, laengeres Risiko unbeaufsichtigter Browser. B kuerzeres Fenster, mehr TOTP-/Passworteingaben.             |
| Empfehlung         | A als messbarer Start; vertrauenswuerdig maximal 30 Tage absolut ohne endloses Sliding. Neues Login nach Sessionende immer mit TOTP.   |
| Auswirkungen       | Authsessionfelder, automatische Sperr-/Rueckkehrzustaende, PWA-Nutzung und Tests. Policy immer serverseitig.                           |
| Faellig            | Vor E1-Securityabnahme und jeglicher oeffentlichen Pilotnutzung.                                                                       |

## O-04 - Zielgeraete einer logischen Erinnerung

| Punkt              | Entscheidung                                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sachverhalt        | Es kann mehrere Pushabonnements geben; das Tageslimit sagt noch nicht, ob eine logische Erinnerung an ein oder alle Geraete zugestellt wird.                |
| Optionen           | A: ein bewusst gewaehltes primaeres Geraet. B: alle ausdruecklich freigegebenen aktiven Geraete.                                                            |
| Vorteile/Nachteile | A ruhiger, einfache Versandabnahme; anderes Geraet erhaelt nichts. B erreichbar auf mehreren Geraeten, mehrere Anzeigen/Teilerfolge moeglich.               |
| Empfehlung         | A initial, Einstellung fuer primaeres Geraet; logischen Erst-/Folgelauf von Endpointlieferung trennen, damit B spaeter ohne neue Fachwahrheit moeglich ist. |
| Auswirkungen       | Subscriptionauswahl, Deliveryresultate, UI-Nachweise; weiterhin hoechstens erste und zweite logische Erinnerung pro Tag.                                    |
| Faellig            | Vor E12-Pushimplementierung/-abnahme.                                                                                                                       |

## O-05 - Pushbindung bei Logout und Geraetewiderruf

| Punkt              | Entscheidung                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sachverhalt        | Benachrichtigung bei abgelaufener Sitzung und Login-Deep-Link sind vorgesehen; Verhalten bei bewusstem Logout/Geraeteverlust ist nicht festgelegt.                                   |
| Optionen           | A: normale Sessionfrist/Logout beendet keinen separat freigegebenen generischen Push; expliziter Geraetewiderruf beendet beides. B: jeder Logout beendet zusaetzlich dieses Pushabo. |
| Vorteile/Nachteile | A Erinnerung bleibt ohne offene Anmeldung nutzbar, braucht klaren Geraetewiderruf. B Logout ist strenger, Benachrichtigungen muessen danach wieder bewusst eingerichtet werden.      |
| Empfehlung         | A; keine vertraulichen Payloads, Login bleibt fuer Datenzugriff Pflicht. Aktion Geraet widerrufen stoppt Session und Subscription; Permission im OS ist davon getrennt.              |
| Auswirkungen       | Geraete-/Sessionverwaltung, Erinnerungsverfuegbarkeit, Revocationtests und Bedienung.                                                                                                |
| Faellig            | Vor E11/E12-Geraeteverwaltung.                                                                                                                                                       |

## O-06 - Kalendertag bei Vorlauf ueber Mitternacht

| Punkt              | Entscheidung                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sachverhalt        | Frueherer Zeitpunkt ist verbindlich. Ein Vorlauf kann den Versand auf den vorherigen Kalendertag legen; Bezug der erlaubten Wochentage ist dabei nicht praezisiert.                                                                   |
| Optionen           | A: Wochentage/Tageslimit beziehen sich auf Routinen-/Arbeitstag, Versand kann am Vorabend liegen. B: Erlaubnis zusaetzlich am tatsaechlichen Versandkalendertag pruefen und bei verbotenem Tag unterdruecken.                         |
| Vorteile/Nachteile | A konsistenter Routinebezug und keine heimliche Zeitverschiebung; moeglicher Sonntagsversand fuer Montag muss sichtbar sein. B respektiert auch versandfreie Kalendertage, kann Erinnerung fuer einen erlaubten Routinetag auslassen. |
| Empfehlung         | A; geplante Versandzeit samt zugehoerigem Routinetag vorab anzeigen. Kein Clamp auf Standardzeit/00:00, das wuerde die Minimumregel umdeuten.                                                                                         |
| Auswirkungen       | Dispatchkey, Date-/Weekdaylogik und Kontext-/Routinedeeplink. DST: nicht existente Lokalzeit auf naechste gueltige Zeit, doppelte Lokalzeit einmal mit definiertem fruehem Instant als technischer Startvorschlag.                    |
| Faellig            | Vor E10-Schedulerkalender und E12-Erinnerungstests.                                                                                                                                                                                   |

## O-07 - Verpasster Versand und bereits begonnene Routine

| Punkt              | Entscheidung                                                                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sachverhalt        | Verhalten nach Serverausfall/verpasster Erstzeit und bei bereits vor Erstzeit begonnener Routine ist nicht ausdruecklich festgelegt. Folge nach Beginn ist bereits ausgeschlossen.                         |
| Optionen           | A: Erstversand innerhalb maximal zwei Stunden nachholen, solange Routine unbegonnen; spaeter auslassen. B: verpassten Erstversand immer auslassen, naechster erlaubter Tag bleibt.                         |
| Vorteile/Nachteile | A hilfreich nach kurzem Restart, kann spaet erinnern. B sehr vorhersehbar, keine Erinnerung bei kurzem Ausfall.                                                                                            |
| Empfehlung         | A; auch regulaeren Erstversand bei bereits begonnener Routine unterdruecken. Keine zweite Nachricht als Ersatz fuer einen unklaren Erstversand; Folge nur nach belegtem Erstlauf und unbegonnener Routine. |
| Auswirkungen       | Scheduler-Recovery, Dispatchstatus, Racepruefung und Problemhinweis; ein schon an den Pushdienst uebergebener Versand ist nicht rueckrufbar.                                                               |
| Faellig            | Vor E12; Zeitfenster bei Abnahme bestaetigen.                                                                                                                                                              |

## O-08 - Rueckblick nach mehreren ausgelassenen Kontexttagen

| Punkt              | Entscheidung                                                                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sachverhalt        | Letzter relevanter Arbeitstag und unabhaengige Reviews sind verbindlich. Anzeige noch ungepruefter Rueckmeldungen aus mehreren aelteren bestaetigten Plaenen ist nicht im Detail festgelegt.                                            |
| Optionen           | A: primaer letzter relevanter Plan; aeltere unbekannte Rueckmeldungen historisch erhalten, nicht automatisch zusaetzlich vorlegen. B: derselbe primaere Review plus zusaetzlich angebotene aeltere offene Rueckmeldungen, dedupliziert. |
| Vorteile/Nachteile | A ruhig/kurz; aeltere Luecken koennen bestehen bleiben. B umfassender Rueckblick, potentiell laengere Routine.                                                                                                                          |
| Empfehlung         | A initial; keine unbekannte Rueckmeldung als nicht begonnen/erledigt erfinden. Aeltere Daten bleiben nachvollziehbar, nicht geloescht.                                                                                                  |
| Auswirkungen       | Review-Query, Feedbackscope und Testfaelle nach mehreren Kontextwechseln/Fehltagen.                                                                                                                                                     |
| Faellig            | Vor E7-Morgenroutineabnahme.                                                                                                                                                                                                            |

## O-09 - Fuehrende Speicherung der Wartedetails

Bestaetigt am 15. Oktober 2026: Option A, Abschnitt `## Helios – Wartedetails` mit Wartet auf/Gegenstand/Nachfassen am; bestehende Beschreibung bytegetreu erhalten. Todoist-Abschnitt Wartet fuehrt. Nachfassen nur als Hinweis.

| Punkt              | Entscheidung                                                                                                                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sachverhalt        | Wartet-Abschnitt ist Todoiststatus. Empfaenger/Gegenstand/Nachfassdatum koennen erfasst werden; deren Speicherort ist nicht konkret festgelegt.                                                                                                                 |
| Optionen           | A: menschenlesbarer Todoist-Beschreibungsabschnitt, lokal nur geparst. B: gekennzeichneter Todoist-Kommentar mit eindeutigem aktuellen Detailvertrag, lokal nur abgeleitet.                                                                                     |
| Vorteile/Nachteile | A aktueller Stand auch direkt in Todoist sichtbar, braucht verlustarmen Markdownvertrag. B bewahrt Beschreibung und Kommentarhistorie, braucht Regeln fuer die aktuell gueltige Fassung nach Bearbeitung mehrerer Kommentare. In beiden Faellen fuehrt Todoist. |
| Empfehlung         | A, nur nach ausdruecklicher Benutzeraktion, bestehende Beschreibung erhalten. Lokale Erinnerungs-/Jobdaten bleiben Helios. Nachfassen initial als Hinweis, separate Aufgabe nur bewusst erzeugen.                                                               |
| Auswirkungen       | Wartedialog, Beschreibungspatches, Sync und Auswahlfilter; kein konkurrierender zweiter Wartetstatus.                                                                                                                                                           |
| Faellig            | Vor E4-Warten/Nachfassen und finalem Taskvertrag.                                                                                                                                                                                                               |

## O-10 - Backupziel, RPO/RTO und Aufbewahrung

| Punkt              | Entscheidung                                                                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sachverhalt        | Konsistentes Backup/Restore ist Pflicht. Speicherziel, akzeptierter Datenverlust/Wiederanlauf, Aufbewahrung und Schluesselhinterlegung fehlen.                                                                                   |
| Optionen           | A: taeglicher verschluesselter Dump auf getrenntem Speicher, RPO 24 h/RTO 4 h, sieben taegliche/vier woechentliche Sicherungen. B: kleinere Verlustgrenze mit haeufigeren Dumps oder WAL-/PITR-Konzept und mehr Betriebspflege.  |
| Vorteile/Nachteile | A einfach und ausreichend, falls ein Tag lokale Datenverlust akzeptiert wird. B engerer Verlustrahmen, mehr Speicher-/Restore-/Monitoringkomplexitaet.                                                                           |
| Empfehlung         | A plus Backup vor jedem Release und regelmaessiger isolierter Restore. Ziel getrennt vom Host, verschluesselte Secretmitnahme gesondert sichern; kein automatischer Operations-/Pushreplay nach Restore.                         |
| Auswirkungen       | Backupjob/-runbook, Restoregate, Speicher-/Schluesselrechte und Problemstatus. Keine Sicherung nur als zweiter Ordner auf demselben Datentraeger.                                                                                |
| Faellig            | Produktion: NAS-Zielpfad/Zugang, Automation und Betriebsdetails bei Produktivinstallation festlegen. E3: lokale verschluesselte Backups plus isolierte Restore-Proben genuegen (Benutzerfreigabe 14.10.2026); keine NAS-Pflicht. |

## O-11 - Aufbewahrung und mobile Offline-Entwuerfe

| Punkt              | Entscheidung                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sachverhalt        | Freitext darf bei gescheiterter Speicherung nicht verloren gehen, Routinefortschritt ist serverseitig. Langfristige Detailaufbewahrung und persistenter Browser-Offlinespeicher sind noch offen.                                                                                                                                                                          |
| Optionen           | A: Serverentwuerfe/gespeicherte Routine plus nur statische PWA-Shell, keine dauerhaften privaten Browserdaten. B: zusaetzlicher expliziter Offline-Draftcache auf freigegebenen Geraeten mit klarer Loesch-/Schutzpolicy.                                                                                                                                                 |
| Vorteile/Nachteile | A geringer Datenschutz-/Syncaufwand; noch nicht serverseitig angenommener Freitext bleibt bei Netzfehler nur in der offenen Ansicht. B ueberlebt mehr Browser-/Netzfaelle, erzeugt sensible lokale Daten und Konflikt-/Loeschaufwand.                                                                                                                                     |
| Empfehlung         | A initial; Originaltext nach angenommener Draftanlage serverseitig bis erfolgreichem Anwenden erhalten, aktive UI bei Fehler nicht schliessen/leeren. B nur bei bestaetigtem Bedarf. Vorschlag: Rohtexte angewandter oder abgelehnter Entwuerfe nach 30 Tagen, detaillierte Beobachtungen nach 180 Tagen bereinigen; bestaetigte Plaene nach vereinbarter Historienfrist. |
| Auswirkungen       | Draftautopersistenz, Fehler-/Reloadtests, Cache-/Logoutverhalten, Lernbasis und Retentionjobs. Keine Behauptung vollstaendiger Offline-Schreibfaehigkeit.                                                                                                                                                                                                                 |
| Faellig            | Draft-/Serverretention vor E6, Beobachtungsretention vor E10, Offline/Geraetecache vor E11.                                                                                                                                                                                                                                                                               |

## O-12 - Lokale Modellprofile und Leistungsziele

| Punkt              | Entscheidung                                                                                                                                                                                                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sachverhalt        | Lokales Ollama ist Pflicht. Zielhardware, aktuell installierte Modelle, akzeptierte Antwortzeiten und Ressourcenbudget sind nicht verifiziert.                                                                                                                                                                              |
| Optionen           | A: kleineres lokales Modell fuer interaktive Entwuerfe plus staerkeres fuer Hintergrundverstaendnis. B: ein verifiziertes Modell fuer alle Use Cases.                                                                                                                                                                       |
| Vorteile/Nachteile | A kann Antwortzeit/Qualitaet trennen, benoetigt zwei Profile und eventuell Modellwechselkosten. B einfacher und sparsamer zu betreiben, ein gemeinsamer Qualitaets-/Latenzkompromiss.                                                                                                                                       |
| Empfehlung         | B starten, vorhandene lokale Kandidaten anhand echter Helios-Testfaelle messen; A nur bei belegtem Gewinn. Grundfunktionen ohne KI nutzbar, kein externer Modellfallback. Vorschlag fuer erste Messgrenzen: interaktiv innerhalb 30 Sekunden oder sichtbarer Jobstatus, harte Worker-Timeouts am realen Modell orientieren. |
| Auswirkungen       | Modellallowlist, Prompt-/Schemaabnahme, Jobkonkurrenz und Ressourcenlimits; syntaktisches JSON allein ist kein Qualitaetsmass.                                                                                                                                                                                              |
| Faellig            | Vor E6-KI-Pilot, Hintergrundkapazitaet vor E10.                                                                                                                                                                                                                                                                             |

## O-13 - Konkrete mobile Ansichten und Zielgeraete

| Punkt              | Entscheidung                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sachverhalt        | Funktionsgrenze und eigener mobiler URL-Bereich sind beschlossen; Smartphone-Layout, benoetigte Settings und konkrete iPhone-/Authenticator-Versionen sind nicht als Referenz geliefert.                           |
| Optionen           | A: eigener kompakter mobiler Routineentwurf auf Basis bestehender Designtokens, vor Umsetzung bestaetigen. B: dafuer gelieferte Figma-/Screenreferenz umsetzen.                                                    |
| Vorteile/Nachteile | A kann mit Fachmodell zeitnah abgestimmt werden, benoetigt gezielte mobile Designfreigabe. B eindeutige visuelle Quelle, abhaengig von deren Verfuegbarkeit. Kein kompletter Desktop-Neuentwurf in beiden Faellen. |
| Empfehlung         | A, sofern keine mobile Referenz bereits existiert; konkrete Kern-/Fehler-/Auth-/Fortschrittszustaende abstimmen, danach echte iPhone-Abnahme unter eigener HTTPS-Domain.                                           |
| Auswirkungen       | Layout/Touchflaechen/Stepnavigation, PWA/Authrueckkehr, Geraetetests. Kein zweites Backend/Repository.                                                                                                             |
| Faellig            | Vor E11; Liste der physischen Zielgeraete/Authenticator-Apps vor E1/E12-Abnahme.                                                                                                                                   |

## O-14 - Dauerhafte Dokumenten-/Notizquelle

| Punkt              | Entscheidung                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sachverhalt        | LH-006 erlaubt Dokumentenlinks; Notion/Obsidian als endgueltige Notizquelle bleibt offen.                                                                                |
| Optionen           | A: allgemeine dauerhafte Links im Task-/Epicinhalt, keine zusaetzliche Vollintegration. B: zusaetzliche konkrete Notion-/Obsidian-Verknuepfung nach festgelegtem Bedarf. |
| Vorteile/Nachteile | A klein und quellenneutral. B gezieltere Bedienung, weitere Berechtigungs-/Link-/Betriebsvertraege.                                                                      |
| Empfehlung         | A als erster vollstaendiger LH-006-Umfang; B ist kein blockierender neuer Pflichtscope.                                                                                  |
| Auswirkungen       | Linkeditor/Sanitierung und ggf. spaeterer Adapter. Keine automatische Inhaltsabfrage verlinkter Seiten durch KI.                                                         |
| Faellig            | Einfacher Linkvertrag vor E8; zusaetzliche Integration nur bei spaeter bestaetigtem Bedarf.                                                                              |

## O-15 - Kanonische Domain und getrennte HTTPS-Testumgebung

| Punkt              | Entscheidung                                                                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sachverhalt        | Eigene HTTPS-Domain ueber NPM ist beschlossen; konkreter Name, DNS/Erreichbarkeit und getrennte real erreichbare Testdomain sind noch nicht genannt.                                                                  |
| Optionen           | A: eigene Produktions- und Testsubdomain mit getrennten Daten/Secrets. B: Produktionsdomain nur fuer Produktion, vorbereitende Tests lokal und spaetere Geraeteabnahme in einem kontrollierten Wartungs-/Testfenster. |
| Vorteile/Nachteile | A prueft Proxy/Auth/iPhonepush ohne Produktivdaten, benoetigt zweiten DNS-/Proxyeintrag. B weniger DNSkonfiguration, hoehere Vermischungs-/Abnahmegefahr; localhost allein belegt iPhonepush nicht.                   |
| Empfehlung         | A, mit festen Origins/Proxyheadern und getrennter DB/Test-Todoistkonto. VPN darf zusaetzlich schuetzen, ersetzt die beschlossene regulaere Domain nicht.                                                              |
| Auswirkungen       | AuthbaseURL, Cookies, Deep Links, Service-Worker-Origin, TLS-/PWA-/Pushabnahme und NPM-Route.                                                                                                                         |
| Faellig            | Namen/Zugriff vor oeffentlicher E1-Pilotpruefung, Testdomain spaetestens E11/E12.                                                                                                                                     |
