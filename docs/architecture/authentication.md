# Authentifizierungsarchitektur – E1.2

## Bibliotheken und Grenzen

Better Auth 1.7.7 mit Username- und Two-Factor-Plugin, Drizzle/PostgreSQL; argon2 0.45.1 (Argon2id: 64 MiB, drei Iterationen, Parallelität eins), qrcode 1.5.4 lokal. otplib 13.5.0 wird ausschliesslich in Tests als unabhängiger Authenticator verwendet. Signaturen, TOTP, Backupcodegenerierung und Secretverschlüsselung stammen aus etablierten Bibliotheken, keine selbst entworfenen Kryptoverfahren. Versionen und Lockfile sind gepinnt.

Referenzen: [Better Auth Two Factor](https://better-auth.com/docs/plugins/2fa), [Session Management](https://better-auth.com/docs/concepts/session-management), [Drizzle Adapter](https://better-auth.com/docs/adapters/drizzle), [Credential-Hashadapter](https://better-auth.com/docs/authentication/email-password). Die installierten Quellverträge wurden zusätzlich gelesen und tatsächlich getestet.

Next bleibt UI/HTTP-Adapter. Der frameworkfreie Backendkern enthält engine, policy, schema, service und lokales CLI. Der Better-Auth-Handler wird nicht als HTTP-Router registriert. Nur die expliziten Helios-Aktionen unter /api/identity/ sind erreichbar; rohe Signup-, Disable-MFA-, Reset-, OTP- und Sessionpatch-Endpunkte existieren öffentlich nicht.

## Persistenz und Transaktionen

Bibliothekstabellen: auth_user, auth_account, auth_session, auth_verification, auth_two_factor und auth_rate_limit. Das Single-User-Constraint erzwingt einen einzigen Benutzer auch bei parallelen Bootstrapprozessen. Lokale Status-, Sitzungs- und Übergangsmetadaten liegen in auth_identity_state, auth_session_policy und auth_flows; dies sind Helios-Policies, keine zweite Credential- oder TOTP-Wahrheit. auth_totp_uses schützt gegen Replay, auth_limits persistiert die Fassade-Limitierung und security_events speichert nur Ereigniscodes/Zeitpunkte.

Alle Identitätsübergänge verwenden einen gebundenen pg-Client mit BEGIN/COMMIT und einem PostgreSQL-Advisory-Lock. Der Drizzle-Better-Auth-Adapter öffnet dabei keine unabhängige Transaktion/Verbindung. Deshalb können Bootstrap, Recoveryverbrauch, MFA, Widerruf und Aktivierung nicht gegeneinander laufen. Erwartete Authfehler werden mit Fehlversuchsänderungen committed; unerwartete Fehler zurückgerollt.

## Einrichtung und Recovery

Bootstrap nutzt die Bibliotheks-Kontoanlage ausschliesslich lokal, mit echten Argon2id-Funktionen und internem nicht zustellbarem Mail-Identifier. Kein zweiter Passwortspeicher. Der hochentropische Setupnachweis wird nur gehasht und für zehn Minuten gespeichert; das CLI verlangt ein interaktives Terminal und verborgene Passworteingabe.

Passwort plus Nachweis schaffen nur eine eingeschränkte Einrichtungssitzung. Secret/QR werden lokal erzeugt; TOTP-Prüfung und anschliessende ausdrückliche Recovery-Sicherungsbestätigung sind getrennte Schritte. Erst dann steht der Status active und eine vollwertige Sitzung. Das alte Einrichtungscookie wird beim Bibliothekswechsel verworfen; Helios liest die neue Cookiesitzung statt einem möglicherweise veralteten Tokenfeld im Enrollment-JSON.

Recovery benötigt das Passwort und einen noch unbenutzten Backupcode. Die Bibliothek speichert Codes verschlüsselt und verbraucht sie per bedingtem atomarem Update. Der zusätzliche Transaktionslock serialisiert Statuswechsel. Bestehende Sitzungen und Challenges werden widerrufen, das Konto wird recovery und die neue Sitzung bleibt eingeschränkt. Eine neue TOTP-Einrichtung mit neuen Recovery-Codes samt Sicherungsbestätigung ist Pflicht. Kein dauerhafter MFA-Downgrade. Lokale administrative Recovery bleibt ausschliesslich ein Server-CLI.

## Sitzungs- und Step-up-Policy

Jeder geschützte Zugriff prüft die aktuelle DB-Sitzung, aktiven Benutzer, abgeschlossene MFA, Zweck full, harte absolute Frist und normale Inaktivitätsfrist. Normale Sitzungen zwölf Stunden/30 Minuten idle; vertrauenswürdig maximal 30 Tage absolut. Keine Cookie-/JWT-Sessioncaches, keine sekundäre Sessionablage und keine automatische Verlängerung. Die Cookiefristen entsprechen der DB-Policy. Device-Informationen bestehen aus grober Browser-/Plattformklasse; IP und rohe User-Agent-Strings werden nicht gespeichert.

Das UI-Trustflag wird erst mit erfolgreicher MFA freigeschaltet. Better Auth trustDevice wird immer false übergeben; keine TOTP-Umgehung durch bekannte Geräte. Step-up wird nur nach erneutem Passwort plus neuem gültigem TOTP aktualisiert; Frische strikt unter fünf Minuten. Sicherheitsaktionen prüfen denselben serverseitigen Guard. Passwortwechsel widerruft alle Sitzungen; TOTP-Rotation startet einen eingeschränkten Recoveryablauf.

TOTP-Verbrauch wird für das gültige Zeitfenster in einem HMAC-identifizierten Replayledger festgehalten (90 Sekunden). Gegenstände sind keine Klartextcodes. Nach Login oder einer Sicherheitsbestätigung muss der nächste Authenticator-Code verwendet werden.

## HTTP und Browser

Host und Origin müssen dem exakten konfigurierten AUTH_ORIGIN entsprechen. JSON-Mutationen benötigen Origin und zulässige Fetch-Metadata; andere Methoden werden auch im Backend abgewiesen. Der Adapter begrenzt Body auf 8 KiB und Lesezeit auf fünf Sekunden. Returnpfade sind eine explizite relative Allowlist.

Cookies sind HttpOnly, SameSite=Strict, Path=/, ohne Domainattribut und unter HTTPS Secure. Produktionskonfiguration erlaubt ausschliesslich HTTPS; lokales HTTP nur auf Loopback und nur in development/test, auch bei optimiertem NODE_ENV=production-Build.

Die Fassade limitert in PostgreSQL vor teurem Hashing: Login global 20/min und fünf je Benutzerkennung; andere Aktionen global 30/min und fünf je Cookiesitzung/Challenge. Better Auth ergänzt Challenge- und MFA-Accountgrenzen. X-Forwarded-\* werden nicht als Identitäts-/IP-/Hostnachweis verwendet. Da Next am HTTP-Adapter keinen verifizierten Peer liefert, ist der globale/Benutzer-/Challenge-Schutz absichtlich unabhängig von einer spoofbaren Client-IP. Eine spätere NPM-IP-Limitierung setzt einen separat verifizierten Proxyvertrag voraus.

Nonce-CSP schützt produktive Skripte/Styles; kein unsafe-eval/unsafe-inline im Produktionsbuild. Next-spezifischer Proxy setzt nur Header, keine Autorisierung. Alle Server Components und HTTP-Fachadapter rufen den gleichen Backendguard auf. Authantworten sind no-store; volle Dokumentnavigation bei Login/Logout verwirft Clientzustand. RESTORE_MODE sperrt Fachzugriff und Authmutationen.
