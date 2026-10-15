# Entwicklung

## Lokale Tests

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
docker compose -f infra/compose.test.yaml up -d --wait
```

Für Integrationstests HELIOS_ENV=test und DATABASE_URL=postgresql://helios:synthetic-test-only@127.0.0.1:55432/helios_test in der aktuellen Shell setzen. Unter PowerShell: `$env:HELIOS_ENV='test'` und `$env:DATABASE_URL='postgresql://helios:synthetic-test-only@127.0.0.1:55432/helios_test'`. Der feste Testwert ist öffentliches synthetisches Testmaterial, niemals für echte Daten verwenden.

```sh
pnpm test:integration
pnpm build
pnpm test:e2e
pnpm security:secrets
pnpm audit --prod
docker compose -f infra/compose.test.yaml down
```

Test-Compose verwendet flüchtigen Speicher, ausschliesslich das neue Projekt helios-test und einen Loopbackport. Integrationstests migrieren diese isolierte Datenbank. Playwright zuerst mit `pnpm exec playwright install chromium` installieren. Browserprüfungen verlangen HELIOS_ENV=test und eine dedizierte \_test-Datenbank; sie fallen niemals auf Dev/Prod zurück. Nach pnpm build startet Playwright den gebauten Standalone-Server auf 127.0.0.1:3101. Fixtures werden ausschliesslich in der Testdatenbank lokal provisioniert. E2E_BASE_URL ist nur für einen ausdrücklich isolierten Testserver vorgesehen. Der ausführliche Lebenszyklus läuft einmal im Desktopprojekt mit zusätzlichem mobilem Browserkontext; die gleichen Schutz-/Smokechecks laufen auch im Mobileprojekt.

Für Webentwicklung `pnpm dev`; für Worker lokale DATABASE_URL/HELIOS_ENV setzen und `pnpm dev:worker`. Vollständigen lokalen Betrieb bevorzugt über Compose. Generierte Migrationen: `pnpm db:generate`, SQL reviewen, dann `pnpm db:migrate` mit passender privater Konfiguration. Kein drizzle push auf echten Daten.

## Branches, CI und Releases

main enthält zunächst nur einen Bootstraphinweis; der Entwicklungsstand bleibt auf develop bis zum ausdrücklich beauftragten ersten Release. Kurze feat/_, fix/_, docs/_, chore/_ Branches von develop, PR nach develop, Conventional Commits. GitHub CI prüft Lint/Typecheck/Unit/Integration/Build/Browser/Secrets/Abhängigkeiten/Images; CodeQL separat. Keine automatische Mergefreigabe für sicherheitskritische oder destruktive Änderungen.

[Releaseprozess](release.md) verlangt ausdrücklichen menschlichen Auftrag. Die Versionsnummer 0.1.0-dev.0 ist nur ein Workspace-Metadatenwert, kein veröffentlichtes Release.

## E2-Vertragstests

Unit- und PostgreSQL-Tests injizieren einen GET-only-Vertragsreader; Browserprüfungen starten zusätzlich den isolierten synthetischen Todoist-HTTP-Server auf 127.0.0.1:3102. Konfiguration verlangt HELIOS_ENV=test, eine \_test-Datenbank und die explizite Loopback-Testorigin. Echte Tokens werden nie an diesen Server gegeben. Die Desktop-Szenarien provisionieren jeweils ein eigenes synthetisches Konto im dedizierten Testbestand; die Mobileprojekte wiederholen nur die unabhängigen Schutzprüfungen, mobile Kontext-Pills werden in einem eigenen Kontext des Szenarios getestet.

Die Migrationsprüfung erstellt in der isolierten PostgreSQL-Testinstanz eine neue, eindeutig benannte \_test-Datenbank, provisioniert dort ein E1.2-Konto und prüft den additiven E2-Upgrade. Sie löscht ausschliesslich diese von ihr neu erzeugte Datenbank. Kein vorhandener Entwicklungs-/Produktionsbestand wird überschrieben.

## E5-Regressionsabnahme

Lokale Ordnung, Fokus und Skip dürfen keine Todoist-Writes erzeugen. E5-Aufnahme/Reserveabschluss verwenden injizierte Reader/Writer desselben E4-Journals. Wiederholungsinstanzen, Quellenkonflikte, konkurrierende Revisionen, verlorene Close-Antwort und Wiederaufnahme prüfen. Browser prüfen echte Tastatur- und Pointer-Sensoren; keine DOM-Sensoren global deaktivieren. Zusätzliche Schattenmodelle, Historienupdates oder abgeschwächte Sicherheitsregeln sind ausgeschlossen.

## E6-Regressionsabnahme

Ollama-Tests verwenden explizite synthetische Fixtures, niemals einen geerbten realen LAN-Endpunkt. Modellbenchmark mit vorhandenen lokalen Modellen getrennt von Fixture-/Regressionstests dokumentieren. Managed-only-Prüfung an Enqueue/Ausführung/Statuswrite; Browser/Formular und gespeicherte Pläne ohne KI testen. Workerabbruch, Claims, begrenzte Konkurrenz, Quellrevisionen, Einzelentscheidungen und E4-Unknown-/Teilerfolgsnachweise prüfen. Nicht parallel dieselbe Testdatenbank oder denselben Trivy-Cache verwenden.
