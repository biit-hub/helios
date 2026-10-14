# Context-/Integration-/Task-Read-Module – E2

E2 konkretisiert LH-002/003/004/005/057/081/090/093/094/096 sowie ADR-004. Quellen: aktuelle Notion-Grundlagen und [Implementierungsplan](helios-implementation-plan.md), bestätigter [Sites-Prototyp V2](https://helios-2-prototyp.greenbream.chatgpt.site). Dessen tatsächliche Themes wurden über den bestehenden Eigentümer-Lesezugang geprüft: Kupfer, Meerblau, Waldgrün, Pflaume, Terrakotta und Gold. Keine Beispielarbeitgeber wurden als Fachkonstanten übernommen.

Next liefert UI/HTTP-Adapter; packages/backend/work enthält Konfiguration, Schema, Todoist-Reader und Anwendungsservice. Browser importiert nur contracts/ui. Die bestehende identity.withActive-Grenze bindet Domainmutationen an dieselbe PostgreSQL-Transaktion, aktuelle Session/MFA-/Frist-/Step-up-Prüfung und den E1.2-Advisory-Lock. Kein zweites Authsystem, kein öffentliches Better-Auth-Mounting. Interne Serviceaufrufe haben dieselben Guards wie HTTP.

Externe GETs laufen ausserhalb des Authlocks. Vor Abruf wird eine persistente Claim-ID samt Wartezeit gesetzt; vor Übernahme werden Session, User, Integrationsrevision/Credentialgeneration, Claim und gegebenenfalls Kontextrevision/Projekt/Aktivstatus erneut geprüft. Logout, Tokenwechsel oder Deaktivierung können einen laufenden Abruf zuverlässig entwerten. Revisionskonflikte sind 409, keine stillen Überschreibungen. Lokale Änderungen sind atomar; ein unvollständiger API-Pagesatz überschreibt keinen vollständigen Cache.

## Modelle und Migrationen

| Modell                  | Regeln                                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| contexts                | User-FK, private/employer, freie Namen, sechs Themes, active/revision, Projekt-ID, optionale TermiHub-Referenzen, letzter Sync; partielles Unique pro Benutzer für Privat sowie aktive Projektzuordnung; Privat bleibt aktiv |
| integrations            | Eine Todoist-Verbindung pro Benutzer; verschlüsselter Token, zufällige Credentialgeneration, enabled, Konfigrevision, reduzierte Status-/Abrufzeiten und Read-Claim                                                          |
| project_catalog         | Integration + externe ID als Primärschlüssel; Name, Inboxflag, Verfügbarkeit und Credentialgeneration; entfernte Einträge bleiben als fehlend erkennbar                                                                      |
| context_project_history | Unveränderliche vorherige/neue Projektzuordnung mit Kontext-FK, Revision und Zeitpunkt; kein Cloudkommando                                                                                                                   |
| task_projections        | Integration + externe Task-ID eindeutig; Kontext-/Projekt-/Generationbindung, validierter Inhalt, SHA-256-Quellfingerprint, Abrufzeit, Revision und active/completed/deleted/unknown; lesende Ableitung                      |
| integration_problems    | Stabile Schlüssel pro Integration/Kontext/Fehlercode, Wiederholungszähler, erste/letzte Zeit, checked/resolved getrennt und eigene Revision                                                                                  |

0003_fixed_living_mummy ist additiv und legt für vorhandene E1.2-Konten genau einen Privatkontext an. Neue Konten erhalten ihn spätestens beim ersten fachlichen Zugriff unter dem gemeinsamen Transaktionslock. 0004_colorful_wraith ergänzt den Abruf-Claim. Frische Installation und Upgrade eines tatsächlich provisionierten E1.2-Kontos sind isoliert geprüft. Keine Tabellen-/Task-/Projektlöschung und kein Schema-Push.

## Sicherheitsgrenzen

INTEGRATION_KEY enthält 32 zufällige Bytes als Hex ausserhalb PostgreSQL/Git. Better Auth 1.7.7 symmetricEncrypt/symmetricDecrypt verwendet die etablierte @noble/ciphers-XChaCha20-Poly1305-Implementierung mit verwalteter Zufallsnonce und authentifizierter Verschlüsselung. Die genaue installierte Implementierung wurde gelesen. AUTH_SECRET wird dafür nicht wiederverwendet. Keine selbst erfundene Verschlüsselung, keine neue Kryptodependency, kein Klartext-Fallback.

Jeder neue HTTP-Zugriff verlangt die aktuelle E1.2-Session mit MFA. Mutationen prüfen Host, Origin, Fetch-Metadata, JSON und maximal 8 KiB/fünf Sekunden Eingangslesezeit. Token hinterlegen/wechseln/entfernen, Integrationsstatus ändern sowie Projektneuzuordnungen benötigen Step-up. Token/Ciphertext/Schlüssel gelangen niemals in Snapshotantworten oder Logs. Backendfehler sind reduzierte Codes; rohe APIantworten werden nicht als Fehler ausgegeben. Clientkontext-ID ersetzt keine serverseitige Eigentumsprüfung.

Todoist-Origin ist fest verdrahtet und ausschliesslich GET freigegeben; Redirects werden abgewiesen. TODOIST_TEST_ORIGIN ist nur in HELIOS_ENV=test mit isolierter \_test-Datenbank und exakt Loopback-HTTP-/api/v1/-Pfad erlaubt. Produktionskonfiguration mit Testoverride scheitert. TermiHub-Referenzen werden nicht aufgerufen, daher entsteht daraus kein SSRF-Pfad. RESTORE_MODE blockiert auch diese Fachzugriffe.

Name/Farbe bleiben lokale Konfiguration, Eingangs- und fremde Projektaufgaben werden nicht geladen oder analysiert. Es gibt keine E2-KI-Jobs, keine need_context-Labels und keinen automatischen Cloudwrite. Keine zusätzliche Queue: aktuell nur bewusste, begrenzte Leseaktionen; eine spätere periodische Aktualisierung muss pg-boss, dieselben Domainprüfungen und Restorebarriere verwenden.

## Schlüsselverlust / Restore

INTEGRATION_KEY neben AUTH_SECRET getrennt geschützt sichern. Bei Verlust kann der alte Token nicht rekonstruiert werden. Nach bewusstem neuen Schlüssel Token mit Step-up neu hinterlegen; eine neue Credentialgeneration verhindert Vermischung alter Kontocaches. Eine automatische Schlüsselrotation oder stille Entschlüsselungsumgehung gibt es nicht. Restaurierte Jobs/Credentials niemals ungeprüft starten; RESTORE_MODE, lokale Auth-Recovery und anschliessend bewusste lesende Todoist-Prüfung vor Freigabe verwenden. Öffentlicher HTTPS-/NPM-Betrieb bleibt separat abzunehmen.
