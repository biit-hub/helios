# Releaseprozess – noch kein Release beauftragt

Nur ein ausdrücklicher Auftrag des Projektverantwortlichen startet diesen Prozess. Gewöhnliche Pushes, Merges und Tags lösen keine Veröffentlichung aus.

1. develop analysieren, SemVer bestimmen, alle Workspaceversionen und CHANGELOG.md aktualisieren. Abhängigkeiten/Migrationen/Runbooks prüfen, gesamten CI-/Sicherheitstest bestehen lassen.
2. Release-PR develop → main erstellen; HEAD-SHA und gültige Version prüfen. Der Bootstrap auf main ist noch keine Veröffentlichung.
3. Mensch startet den manuellen Workflow Release mit PR-Nummer, exakt geprüftem HEAD-SHA und Version. Geschützte GitHub-Umgebung release benötigt Review durch Projektverantwortlichen; nur develop darf den Workflow starten.
4. Workflow prüft Actor, Release-PR-Basis/Head/SHA/Version und erfolgreiche Pflichtchecks. Beide Images werden gebaut und auf HIGH/CRITICAL gescannt, bevor der Release-PR integriert wird.
5. Merge erzeugt einen nachvollziehbaren Tag/GitHub Release; Images werden mit voller Version und Minor veröffentlicht. latest wird erst nach erfolgreichen Builds/Scans und beiden versionierten Publikationen gesetzt.
6. main über einen Synchronisations-PR nach develop zurückführen; kein Ruleset umgehen. Release, Digests und Start/Restoreprobe prüfen.

Docker Hub bleibt zunächst unkonfiguriert. Später Repositoryvariable DOCKERHUB_NAMESPACE, Umgebungssecret DOCKERHUB_USERNAME und DOCKERHUB_TOKEN (minimaler Schreibzugriff nur auf helios-web/helios-worker) setzen. Keine persönlichen Passwörter verwenden. Workflow ist vorbereitet, aber ohne expliziten Auftrag und Credentials nicht produktiv ausprobiert. Keine Docker-Hub-Identität aus GitHub ableiten.

Nach dem Merge können Registry-/GitHub-Ausfälle eine teilweise Veröffentlichung erzeugen; latest nicht vor erfolgreicher Versionpublikation aktualisieren. Zwei Registrytags sind nicht atomar gemeinsam aktualisierbar. Wiederanlauf nach einem Teilfehler muss den vorhandenen Tag/Release/Digest lesen und darf keine neue Version erfinden. Bei kritischem Fund Veröffentlichung stoppen.
