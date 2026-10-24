# Betrieb und Diagnose

E1.1 nur localhost. Startschritte stehen im [README](../../README.md). Migration explizit vor Workerstart ausführen; Queueinitialisierung ist Aufgabe des Workers.

- Web nicht erreichbar: `docker compose ps`, Portbelegung 3100 und Logs prüfen.
- Readiness 503: PostgreSQL gesund? Migration ausgeführt? Workerheartbeat aktuell? `docker compose logs --tail 50 worker web` gibt reduzierte Ereigniscodes.
- Workerstart fehlgeschlagen: HELIOS_ENV, private DATABASE_URL, Rollenrechte und Schema prüfen. Keine URLs/Passwörter in öffentliche Issues kopieren.
- Testjob: `docker compose exec worker node_modules/.bin/tsx apps/worker/src/smoke.ts`; erzeugt nur synthetische UUID. Es gibt bewusst keinen öffentlich aufrufbaren Job-POST-Endpunkt.
- Restore: Worker stoppen, RESTORE_MODE=true setzen; [isoliertes Restoreverfahren](backup-restore.md) durchführen. Jobs erst nach Reconciliation freigeben.

NPM später: nur Web in ein ausdrücklich ausgewähltes existierendes Proxy-Netz aufnehmen; dort Serviceport 3000 ansprechen. Hostports von DB/Worker geschlossen lassen. HTTPS-Origin/Trusted-Proxies/Auth/CSRF/CSP werden mit E1.2 abgestimmt und getestet. Nicht den bestehenden Proxy oder Altcontainer verändern.

Updates niemals mit blindem main-Pull vornehmen, solange kein stabiles Release existiert. Ausgangscommit/Image notieren, Backup erstellen, Worker stoppen, Migration prüfen, Images austauschen, Health/Job/Layout prüfen. Schema-Inkompatibilität verlangt einen geprüften Restore, keinen automatischen Downgrade.

E4: Vor passenden Web-/Workerimages Migration 0006 ausführen. Readiness prüft kind/payload/result im bestehenden Journal. Ausstehende Aufgabenoperationen unter Aufgaben prüfen; HTTP 202 ist kein Nachweis. Bei unknown/Create/Comment/Close kein blindes Replay. Details: [Aufgabenverwaltung und Troubleshooting](tasks.md).

## E9.3 – Diagnose und kontrolliertes Update

«Probleme» ist direkt in der Hauptnavigation erreichbar und verwendet dieselben Problem- und Operationsdaten. Kein zweites Journal und keine Bereinigung unbekannter Einträge. Vor einem lokalen Imagewechsel verschlüsselt sichern, Wiederherstellbarkeit und alle bestehenden Tabellen prüfen; nur die ausdrücklich benannte Entwicklungsinstallation aktualisieren. Der Abschlussbericht nennt den tatsächlichen Installationsstand.

## E9.4 – Datums-/Dauernachweise

TODOIST_FIELDS_UNCONFIRMED bedeutet: Todoist hat geantwortet, aber der GET-Feldvergleich passt nicht vollständig. Bestätigte und nicht bestätigte Felder sind getrennt sichtbar; die Gesamtoperation bleibt unknown. Den ursprünglichen Pending-Schritt und seine Request-ID erhalten. Bewusstes Fortsetzen liest zuerst und sendet keinen ungeklärten Schritt erneut. Timeout, Netzwerk, Server und Antwortformat werden ohne Rohpayload erläutert. Ein behobener UI-Befund bedeutet nicht, dass alte Unknown-Operationen aufgelöst sind. [Ursache und verbleibende Dauer-Liveabnahme](../development/e9.4-verification.md).
