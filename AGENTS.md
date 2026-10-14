# Helios – Arbeitsregeln

- Aufträge, freigegebenes Lastenheft und ADRs beachten; aktuelle Ergänzungen gehen historischen Planungsmarkierungen vor. E1.1 endet vor echter Authentifizierung.
- Eigenständiges öffentliches Repository. Keine echten Secrets, privaten Pfade, Dumps, produktiven Konfigurationen oder realen Daten veröffentlichen. Altprojekt und dessen Container/Volumes unverändert lassen.
- develop integriert; feat/_, fix/_, docs/_, chore/_ über PR nach develop. Conventional Commits. Keine Featurecommits auf main. Keine stabilen Releases ohne ausdrücklichen menschlichen Auftrag.
- Fachlogik im frameworkfreien packages/backend; Browser nur contracts/ui. Next ist UI/HTTP-Adapter, Worker führt lange Arbeit aus. Keine unnötigen Dienste.
- Todoist bleibt führend; Eingang ohne KI; keine autonomen Inhaltsänderungen. Kontexte behalten getrennte Pläne/Reserve/Review. Fortschrittsworkflow ist gemeinsam. Ollama ausschliesslich lokal.
- E1.2: ein lokales Konto, keine offene Registrierung, Passwort+TOTP obligatorisch, widerrufbare DB-Sessions. Vertrauenswürdig maximal 30 Tage absolut, sonst 12 Stunden absolut/30 Minuten idle; Step-up fünf Minuten.
- SQL-Migrationen reviewen, kein Produktions-Schema-Push. Tests nur mit isolierter \_test-Datenbank und synthetischen Daten. Restore blockiert Jobs bis kontrollierter Freigabe.
- Vor PR: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm test:e2e, pnpm security:secrets, pnpm audit --prod und Compose-/Imagesmoke. Nicht ausführbare Checks ehrlich im Prüfbericht dokumentieren.
- Dokumentation/Changelog gehören zu jeder Änderung. Keine unbegründeten Erfolgsaussagen. Keine automatische Merge-/Release-/Produktionsaktion bei riskanten Änderungen.
