# Changelog

Alle nennenswerten Änderungen. Format: [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung: [SemVer](https://semver.org/lang/de/).

## [1.0.0] – 2026-10-15

Erste Version.

### Hinzugefügt

* **Erweiterung (`extension/`)**
  * Ein/Aus-Schalter **unter der Chat-Eingabe** auf arena.ai (Shadow-DOM-Leiste, hell/dunkel,
    drei Zustände: AUS · AN-verbunden · AN-keine Verbindung)
  * Schalter zusätzlich im Popup (Symbol in der Opera-Leiste) und Status im Badge (`AN` / `!`)
  * Freigaben pro Bereich: Dateien lesen · Dateien schreiben · Befehle ausführen
  * 8 Werkzeuge für Assistenten: `local_bridge_status`, `system_info`, `run_command`, `list_files`,
    `search_files`, `read_file`, `write_file`, `get_file_info`
  * Veröffentlichung der Werkzeuge als JSON-LD (`#arena-local-tools`) + `window.ArenaLocalTools`
  * Einrichtungs- und Fehlerhilfe-Seite inkl. „Jetzt erlauben“-Knopf
  * Aufruf-Verlauf (lokal, löschbar), Port-Umschaltung, „arena.ai neu laden“
  * **Prompt-Vorlage kopieren** (nennt dem Modell alle Werkzeuge und aktuelle Freigaben)
  * `ArenaLocalTools.promptTemplate()` für die Konsole
* **Lokale Brücke (`bridge/server.ps1`)**
  * HTTP-Server nur auf `127.0.0.1`, keine Installation, kein Admin, kein Dienst
  * Host-/Origin-Prüfung, Pflicht-Header, einmalige Zustimmung (`consent.json`)
  * Arbeitsordner-Grenze (Pfad-Auflösung), Timeouts, Mengenlimits, Klartext-Protokoll
  * Info-Seite des Servers mit „Erlauben“-Button
* **Windows-Starter (`installer/`)**
  * `install.cmd` – legt Arbeitsordner + zwei Desktop-Verknüpfungen an („Arena PC Bridge“, „… nur lesen“)
  * `start.cmd` – Port, Arbeitsordner und Freigaben per Schalter (`-Commands`, `-Write`, `-Root`, `-Port`, `-ResetConsent`)
  * `uninstall.cmd` – Verknüpfungen entfernen, Zugriff sperren, Arbeitsordner optional löschen
* **Dokumentation**
  * README mit Schnellstart, Beispielen, Freigaben, Sicherheit, Updates, Deinstallation
  * `docs/ANLEITUNG-WINDOWS.md` (klickgenaue Anleitung), `docs/SICHERHEIT.md`,
    `docs/FUNKTIONIERT-NICHT.md`, `docs/TECHNISCH.md` (API-Referenz)
* **Werkzeuge & Tests**
  * `tools/build-zip.sh` – baut Komplett- und Erweiterungs-ZIP
  * `tools/icon-source.svg` + `tools/build-icons.mjs` – Icon-Quelle und PNG-Erzeugung
  * `tools/check-contract.mjs` – prüft Nachrichtentypen, Werkzeugnamen, HTTP-Pfade und Protokollversion
  * `tools/test-extension.mjs` – UI-/JSON-LD-/Werkzeugtest der Seitenskripte mit jsdom
  * `tools/test-background.mjs` – Werkzeug-Mapping und Freigabelogik des Service Workers (107 Prüfungen)
