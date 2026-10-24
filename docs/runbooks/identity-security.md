# Sicherheitskonfiguration

AUTH_SECRET: 32 zufällige Bytes oder mehr als Hex; über pnpm config:auth nur lokal erzeugen. Nicht NEXT_PUBLIC benennen. In .env oder später einem geschützten Secretmanager speichern, nie im Image/Repository. Schutz betrifft Session-MAC sowie verschlüsselte TOTP-/Recoverydaten. Verlust/Rotation nach [Recovery](identity-recovery.md) behandeln.

AUTH_ORIGIN: exakter Browserorigin, ohne Pfad/Slash/Benutzerinformation. Lokal http://127.0.0.1:3100; Production ausschliesslich eine ausdrücklich konfigurierte HTTPS-Origin. HELIOS_ENV und NODE_ENV haben unterschiedliche Aufgaben: development erlaubt loopback HTTP auch im optimierten Dockerbuild; production erlaubt dies niemals. Testorigin darf keinen Produktionsdatenbankzugang verwenden.

Nur Web bindet lokal an Loopback. Datenbank und Worker bleiben intern. NPM später nur an Web verbinden; Host unverändert kanonisch weitergeben, TLS terminieren und restriktive Timeouts/Bodygrenzen einstellen. Die Anwendung vertraut X-Forwarded-For/Host/Proto nicht als Clientnachweis. Vor öffentlichem Betrieb separaten Proxy-/HTTPS-/Cookie-/IP-Limitierungsvertrag abnehmen.

Sessioncookie HttpOnly, SameSite=Strict, host-only, Path=/; Secure bei HTTPS. Keine Sitzungen im Browserstorage, kein JWT-Fallback, keine Cookie-Sessioncaches. Anwendung prüft DB bei jedem geschützten Zugriff; Widerruf und Fristen wirken unabhängig von UIzustand.

CSP mit pro Request zufälligem Nonce und dynamischer SSR; produktive Skripte/Styles benötigen Nonce oder eigene Origin. Nur Next-Entwicklung erlaubt für Debugging unsafe-eval bzw. Inline-Styles. QR ist ein lokaler data:-PNG, unoptimiert und nicht an einen Bild-/QR-Dienst übertragen.

Die Fassade verlangt korrekten Origin für jede Mutation, validiert Fetch-Metadata/Host, begrenzt JSON auf 8 KiB und lehnt unbekannte Methoden/Aktionen ab. Der kanonische Origin wird nie aus manipulierten Proxyheaders gewonnen. Rate-Limits liegen in PostgreSQL und überstehen Neustarts; keine unendliche Kontosperre.

Keine Defaultbenutzer/Passwörter/produktiven Testaccounts. Fehler sind generisch, Logs bestehen nur aus Ereigniscodes; keine Passwörter, Rohfehler, Codes, QR-URIs, Cookies oder Setupnachweise. Adminausgabe nur interaktiv und mit explizitem Einmalcontainer ohne Logtreiber. Lokale Dateirechte/NTFS-Zugriff auf private .env und Backupidentitäten beschränken.

E2-Fachzugriffe verwenden denselben transaktionsgebundenen Guard. Integrationsverschlüsselung nutzt einen eigenen INTEGRATION_KEY; siehe [Kontexte/Todoist](../architecture/contexts-todoist.md) und [Einrichtung](todoist-setup.md).

## E9.3 – Sicherheitsdialog

Sicherheit unter Einstellungen öffnen. «Bestätigung öffnen» zeigt Passwort/TOTP als Dialog. Bei geschützten Verbindungs- und Zuordnungsänderungen führt die Serverablehnung direkt zur benötigten Bestätigung. Eingaben bleiben erhalten; danach die erhaltene Aktion bewusst erneut auslösen. Fristen, Replay-/Session-/Widerrufsprüfungen bleiben serverseitig führend.
