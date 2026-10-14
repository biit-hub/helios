# Mitwirken

Helios befindet sich in E1.1. Für Fehler und Featurewünsche die Issuevorlagen verwenden; Sicherheitslücken nach [SECURITY.md](SECURITY.md) privat melden.

Von develop einen feat/_, fix/_, docs/_ oder chore/_ Branch erstellen. Conventional Commits verwenden (feat:, fix:, docs:, chore:, test:, ci:). PRs gehen nach develop; nachvollziehbare kleine Änderungen und synthetische Beispiele bevorzugen. Beschreibung nennt Problem, Verhalten, relevante LH-/ADR-Referenzen und tatsächlich ausgeführte Checks.

[Entwicklungsanleitung](docs/development/workflow.md) befolgen. Tests dürfen keine echten Konten oder Produktionsdaten benutzen. Dokumentation und Changelog aktualisieren. SQL-Migrationen explizit prüfen. Kein automatischer Merge bei Auth-, Secret-, destruktiven DB- oder Releaseänderungen.

main ist Releasebranch. Ein Release benötigt einen ausdrücklichen Auftrag des Projektverantwortlichen und die geschützte Releaseumgebung. Releases werden nicht durch gewöhnliche Pushes oder Merges ausgelöst.
