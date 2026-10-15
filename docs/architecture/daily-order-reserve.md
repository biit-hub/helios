# E5 – Persistente Tagesordnung und zyklische Reserve

Grundlage: LH-061, LH-065–069a sowie die jüngeren bestätigten F3/F4/F5. Derselbe Tagesplan pro Kontext und lokalem Tag, dieselben Revisionen, Authtransaktionen und dasselbe E3/E4-Operationsjournal. Keine neue Plantabelle, keine zweite Queue und keine neue Todoist-Schreibpipeline.

## Additives Modell

Migration 0007 ergänzt `daily_plans.agenda` und drei Beobachtungsfelder: Idempotency-Key, Requesthash und Detail-JSON. Alle 25 bisherigen Tabellen bleiben bestehen. Bestehende bestätigte `entries` und ihre Quellen bleiben durch den E3-Trigger unveränderlich; alte History-Snapshots werden nicht umgeschrieben. Ohne agenda werden alte Einträge unverändert als Hauptauswahl gelesen, Reserve leer und nicht pausiert.

Agenda enthält geordnete Instanzschlüssel für main/reserve, pausiert, zusätzliche unveränderliche Quellsnapshots, retirierte Instanzen und ausstehende Journalverknüpfungen. Ein Instanzschlüssel ist das Paar aus Todoist-ID und bei Wiederholungen dem bestätigten nativen Due-Wert. Inhaltliche Änderungen erzeugen keine neue Instanz; ein nachgewiesener neuer Wiederholungstermin schon. Das ist eine Planreferenz, kein zweiter Todoist-Status.

Ein Datenbanktrigger erlaubt Agendaänderungen nur am bestätigten Plan mit genau nächster Revision, verbietet doppelte Bereichszuordnung und unbekannte/retirierte Referenzen. Zusätzliche Quellen und Retirements sind append-only; Historie und Beobachtungen ebenfalls. Technische Grenze: höchstens 200 gespeicherte Instanzen pro Tagesplan, keine angezeigte Backlogzahl. Die normale Hauptvorschlagsauswahl bleibt bei höchstens fünf; bewusstes Ergänzen wird nicht automatisch wieder gekürzt.

## Lokale Kommandos

Reorder sendet immer die vollständige Permutation genau eines Bereichs. Pfeile und Drag-and-drop nutzen dasselbe Kommando. Revision, MFA, Origin, aktiver Kontext und Credentialgeneration werden im bestehenden Single-User-Transaktionslock geprüft. Lokale Idempotenz liegt in den bestehenden Beobachtungen; gleicher Key mit anderem Body ist ein Konflikt. Reihenfolge, neue Revision, History und Ereignis committen atomar. Kein Last-Write-Wins und keine Teilpermutation.

Fokuswechsel verändert weder Reihenfolge noch Todoist. Ein Bereichswechsel ist eine eigene explizite Aktion. Soll die Fokuskarte bei vorhandenen weiteren Hauptaufgaben in die Reserve, muss zuerst bewusst ein anderer Fokus gewählt werden. Kein unbeabsichtigter Ersatzfokus durch Sortieren. Ein leerer Hauptbereich hat keinen Fokus; seine erste bewusst aufgenommene Hauptaufgabe wird zum Fokus.

Skip rotiert die aktuelle nachgewiesen ausführbare Reservekarte ans Ende. Nicht verfügbare gespeicherte Referenzen werden nicht als erledigt gelöscht. Bei nur einer ausführbaren Karte bleibt die Reserve bis zur ausdrücklichen Fortsetzung pausiert, auch nach Reload. Optionaler Grund, Kontext, Zeitpunkt und Quellenrevision werden aufgezeichnet; keine wirksamen Lernhypothesen oder dauerhafte Abwertung.

## Aufnahme und Abschluss

Bewusste Zusatzaufnahme prüft die ausgewählte Instanz gegen frische native Aufgaben, Abschnitte und Vorfahren. Ungeeignete/wartende/fremde/erledigte Aufgaben werden abgewiesen. Eine neue dringende Aufgabe verändert einen bestätigten Plan nicht automatisch.

Die interne E4-Fassade speichert Journalauftrag und Planverknüpfung samt neuer Revision in derselben Transaktion. Geeignete eigenständige zusätzliche Aufgaben gehen nativ nach In Arbeit. Unteraufgaben, Container mit aktiven Kindern und bereits richtig eingeordnete Aufgaben erhalten einen nachgelesenen lokalen Auswahlschritt (`plan-select`) ohne Hierarchieänderung. Diese interne Aktion kann nicht ohne Planverknüpfung über die öffentliche Taskfassade angefordert werden.

Reserveabschluss verwendet genau die vorhandene E4-Close-Operation, mit sichtbarer Destruktiv- und nötigenfalls Hierarchiebestätigung. Erst nach vollständig nachgewiesenem E4-Erfolg wird die konkrete Instanz aus reserve entfernt und retirierte Referenz samt Ereignis gespeichert. Wiederholungen gehen nach nachgewiesenem Terminwechsel nach Offen; die aktive Folgeinstanz wird nicht mitentfernt oder erneut geschlossen. Eine bewusst geeignete Folgeinstanz kann separat aufgenommen werden.

E4-Abschlussstatus und Planübernahme committen im selben bestehenden DB-Lock. Neue Reihenfolgeänderungen werden dabei anhand des aktuellen Plans ergänzt, nicht durch einen alten Snapshot ersetzt. Nach einem Workerabsturz bleiben die vorhandenen E4-Checkpoints führend. Unknown/Fehler erhalten Karte, Eingaben und Journal; Wiederaufnahme liest zuerst nach. Neue Credentials oder fehlende Sitzung erlauben keine neuen Writes.

## Oberfläche und Grenzen

Fokus zeigt eine Hauptaufgabe und höchstens eine prominente Reservekarte. Vollständige Reserveverwaltung befindet sich nur im Tagesplan. Taskliste öffnet mit Kontext und Rückweg; sie fragt den Plan einmal gemeinsam ab, nicht pro Aufgabe.

[dnd-kit React](https://dndkit.com/react/quickstart/) 0.5.0 unterstützt die installierte React-19-Version. Browserseitiges dynamisches Laden isoliert DOM-Observer von Server- und Basistests. Separate Handles, Einfügemarkierung, native Tastatur-/Pointer-Sensoren und Pfeile; bestätigter Serverstand wird ohne Remount übernommen. Bei Konflikt bleibt der Server führend und der aktuelle Stand kann geladen werden.

Keine atomare gemeinsame Transaktion mit Todoist, kein globaler CAS-Vertrag. Direktänderungen in der kurzen Zeit zwischen Lesen und Write bleiben ein nachgeprüftes Restrisiko. Keine KI, E6, Nachtplanung, mobile Morgenroutine, NAS-Anbindung oder Produktionsfreigabe. Manuelle E3-/E4-Abnahmen bleiben offen.
