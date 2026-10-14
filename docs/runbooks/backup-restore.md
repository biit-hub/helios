# PostgreSQL Backup und Restore

## Grundkonzept

Konsistente logische Backups mit PostgreSQL pg_dump im Customformat; pg_dump erzeugt einen Transaktionssnapshot. Dump und Wiederherstellung mit gepinnter PostgreSQL-Majorversion durchführen. Datenbank plus separat geschützte Konfiguration/Schlüssel/Versionsreferenz sichern; Git ist kein Secretsbackup.

Dumps immer vor externem Transport mit der etablierten age-Implementierung verschlüsseln. Empfängerdatei und privaten Identity-Schlüssel getrennt verwalten, Recovery offline sichern. Restic oder ein dedizierter externer SFTP-/Objektspeicher kann verschlüsselte Sicherungen übernehmen. Ein zweiter Ordner auf derselben Platte reicht nicht. Weder Ziel, Aufbewahrung noch RPO/RTO sind bereits als Produktionsvorgabe freigegeben.

Skript [backup.mjs](../../scripts/backup.mjs) führt pg_dump über docker compose aus, verschlüsselt im Speicher per age und schreibt ausschliesslich .age. Voraussetzungen: age lokal im PATH, private Empfängerdatei mit age-Public-Key.

```sh
node scripts/backup.mjs /secure/recipients.txt /secure/backup/helios.dump.age
```

Zeitpläne können später über systemd timer/cron/Windows Task Scheduler diesen Befehl ausführen, Exitcode/Alter/externen Upload überwachen und nur nach verifiziertem Upload alte Sicherungen gemäss freigegebener Retention entfernen. Keine produktive Aufgabe wird in E1.1 eingerichtet. Vor Release sichern, regelmässig isoliert wiederherstellen. Dieses einfache Skript puffert den Dump im Speicher; bei wachsenden Daten auf Streaming umstellen.

## Isolierte manuelle Probe

1. Nur neue Testumgebung mit infra/compose.test.yaml starten. Keine alten Volumes verwenden. HELIOS_ENV=test und helios_test konfigurieren; Integrationstests erzeugen synthetische Proben.
2. `node scripts/restore-probe.mjs` erstellt einen konsistenten Dump, legt eine neue leere helios_restore_test in der isolierten Testinstanz an, spielt den Dump zurück und vergleicht UUIDs/Probezahl. Es wird keine existierende DB gelöscht/überschrieben; vorhandene Restore-DB führt zum Abbruch. Kein Worker wird für Restore gestartet.
3. Verschlüsselung zusätzlich prüfen: age-Empfänger/Identity im privaten lokalen Verzeichnis erzeugen; Dump verschlüsseln, entschlüsseln und Bytevergleich durchführen. Private Schlüssel/Dumps niemals committen.
4. Nach Prüfung nur neue Testcontainer stoppen; Test-tmpfs ist bewusst flüchtig. Kein `down -v` auf dev/prod.

## Späterer produktiver Restore

Worker/Push/Sync zuerst ausschalten; RESTORE_MODE=true. In ein **neues** isoliertes Composeprojekt und leere DB der gesicherten Version wiederherstellen. Keine externen Netzwerk-/Integrationstokens einbinden. age-Identity lokal eingeben/geschützt bereitstellen, Entschlüsselung direkt zu pg_restore, keine öffentlichen Logs. Tabellen, Migrationen und Sicherungsalter prüfen.

Vor Wiederaufnahme: Sessions/Challenges widerrufen; externe Todoistzustände lesend abgleichen; in-flight/unknown Operationen und Versandnachweise prüfen. Alte pg-boss-Jobs/Schedules dürfen nicht blind wieder anlaufen. Nach fehlenden Versandnachweisen für einen vergangenen Zeitraum keine Pushnachholung automatisch erlauben. Erst durch kontrollierte Freigabe Jobs neu einreihen. Die zukünftigen Fachmodule müssen diese Restorebarriere testen; E1.1 besitzt nur den technischen Job.

Bei verlorenem age-/Integrations-/TOTP-Schlüssel können Daten nicht einfach rekonstruiert werden. RPO/RTO, externes Ziel, Retention und Schlüsselhinterlegung bleiben vor Nutzung echter Pläne zu entscheiden.

E1.2 ergänzt AUTH_SECRET und die Authentifizierungstabellen als geschützte Sicherungsbestandteile. Nach Restore mit RESTORE_MODE arbeiten und den [lokalen administrativen Recoveryablauf](identity-recovery.md) abschliessen, bevor Zugriffe wieder freigegeben werden. Restaurierte Sessions, Challenges und Recoverycodes dürfen nicht ungeprüft erneut gültig werden.
