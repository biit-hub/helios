# Recovery und administrativer Wiederherstellungsweg

## Authenticator verloren, Passwort und Code vorhanden

Normalen Benutzernamen und Passwort prüfen lassen. Bei TOTP-Eingabe Recovery-Code verwenden wählen und einen gesicherten Code eingeben. Der Code wird atomar einmal verbraucht; parallele Wiederverwendung wird abgewiesen.

Alle bisherigen Sitzungen und Challenges werden widerrufen. Die neue Sitzung ermöglicht ausschliesslich /setup mit Passwort zur neuen TOTP-Einrichtung. Neuen QR scannen, neuen Authenticator-Code prüfen und neue Recovery-Codes sichern/bestätigen. Erst dann wieder Fachzugriff. Es gibt keine dauerhafte Anmeldung nur mit einem Recoverycode.

## Passwort, Authenticator und Codes fehlen oder Einrichtung abgelaufen

Ausschliesslich unter Kontrolle über den Server, niemals über einen öffentlichen Endpoint:

```sh
docker compose -f compose.yaml -f infra/compose.admin.yaml run --rm --no-deps -it worker node_modules/.bin/tsx packages/backend/src/identity/cli.ts recover
```

RECOVER eingeben, um den bewussten lokalen administrativen Vorgang zu bestätigen. Neues Passwort zweimal verborgen eingeben. Alle Sitzungen/Challenges und alten Setupnachweise werden widerrufen; der Benutzer bleibt erhalten, bekommt aber den Zustand recovery. Der Vorgang erzeugt einen reduzierten security_events-Nachweis. Keine echten Passwörter/Nachweise in Docker- oder Anwendungslogs.

Mit dem neuen einmaligen zehnminütigen Setupnachweis und neuen Passwort /setup öffnen. TOTP und Recovery-Codes neu einrichten und bestätigen. Alte TOTP-/Recoverydaten werden dabei kontrolliert ersetzt. Nicht wiederholt bootstrap ausführen, nicht manuell ein zweites Konto in SQL anlegen und keine öffentliche Passwortreset-/MFA-Abschaltroute hinzufügen.

## Verschlüsselungsschlüssel verloren / Backuprestore

AUTH_SECRET separat geschützt sichern. Ist der Schlüssel verloren, unter Serverkontrolle einen neuen zufälligen Schlüssel konfigurieren und Web/Worker neu starten; danach lokalen recover-Ablauf nutzen. Alte verschlüsselte Faktoren können nicht entschlüsselt werden, werden aber durch das kontrollierte Enrollment ersetzt. Keine automatische Secretrotation beim Start.

Bei Restore Web/Worker isolieren, RESTORE_MODE=true setzen. Niemals restaurierte Sitzungen/Challenges oder bereits benutzte Recoverycodes blind weiterverwenden. Vor Wiederaufnahme im lokalen recover-Ablauf ein neues Passwort, TOTP und neue Recovery-Codes einrichten; öffentliche Erreichbarkeit bleibt bis zum Ende gesperrt. Externe Operationen/Push bleiben ebenfalls gesperrt, siehe [Backup/Restore](backup-restore.md). Kein produktiver Restore wurde in E1.2 ausgeführt.
