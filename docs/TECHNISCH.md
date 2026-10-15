# Technische Dokumentation

Zielgruppe: Leute, die es genau wissen wollen (oder etwas anpassen möchten).

---

## 1. Bausteine

| Datei | Welt / Rolle |
|---|---|
| `extension/manifest.json` | MV3-Manifest. Permissions: `storage`, `tabs`, `scripting`, `alarms`, `notifications`; Hosts: `http://127.0.0.1/*`, `http://localhost/*`, `https://*.arena.ai/*` |
| `extension/src/inject.js` | Content-Script in der **MAIN**-Welt (hat Zugriff auf Seiten-`window`). Baut die Leiste, JSON-LD, `window.ArenaLocalTools` |
| `extension/src/toggle.js` | Content-Script in der **ISOLATED**-Welt. Vermittelt `postMessage` ⇄ `chrome.runtime.sendMessage` |
| `extension/src/protocol.js` | Werkzeug-Definitionen + gemeinsame Helfer. Läuft im Worker (`importScripts`) **und** als normales Script in der HTML-Seite – deshalb ohne `import`/`export` |
| `extension/src/background.js` | Service Worker: Einstellungen, Rechteprüfung, HTTP-Aufrufe an die Brücke, Badge, Alarme |
| `extension/src/popup.*` | Steuerzentrale (Symbol in der Leiste) |
| `extension/src/guide.*` | Einrichtungsseite + „Jetzt erlauben“ (darf `chrome-extension://`-Fetches machen → wird von der Brücke als `chrome-extension://…`-Origin akzeptiert) |
| `bridge/server.ps1` | Der lokale HTTP-Server (Windows PowerShell 5.1+, kein Admin) |
| `installer/*.cmd`, `installer/*.ps1` | Einrichtung, Start, Deinstallation |

### Warum zwei Content-Script-Welten?

`chrome.*`-APIs gibt es nur in der ISOLATED-Welt, aber nur die MAIN-Welt kann Objekte auf `window` legen,
die die Seite (und damit Modelle/Tools, die im Seitenkontext laufen) sehen. Deshalb: `inject.js` baut UI/Daten,
`toggle.js` spricht mit der Erweiterung, Kommunikation über `window.postMessage` mit festen Markern
(`arena-pc-bridge-page` / `arena-pc-bridge-ext`).

---

## 2. Warum ein Service Worker die Brücke aufruft

Eine Webseite kann `http://127.0.0.1:8765` nicht ohne CORS-Freigabe aufrufen, und Chrome blockiert zudem
Private-Network-Anfragen von öffentlichen Seiten. Der Service Worker der Erweiterung darf es, weil
`http://127.0.0.1/*` in `host_permissions` steht. Also läuft der Datenverkehr:

```
Seite ⇄ postMessage ⇄ toggle.js ⇄ chrome.runtime ⇄ background.js ⇄ fetch ⇄ 127.0.0.1:8765
```

Die Seite selbst kann die Werkzeuge also nicht heimlich aufrufen: Sie bekommt nur, was der Service Worker
(freigabegeprüft) durchlässt.

---

## 3. Werkzeuge

| Name | Argumente | Wirkung |
|---|---|---|
| `local_bridge_status` | – | Verbindung, Port, erlaubter Ordner, Rechte, Werkzeugliste. Immer der erste Aufruf. |
| `system_info` | – | Computer, Benutzer, Windows-Version, PowerShell-Version, CPU, RAM, Laufwerke, Arbeitsordner, Uhrzeit |
| `run_command` | `command`, `shell` (`powershell`/`cmd`), `cwd`, `timeout_ms` | Befehl ausführen; liefert `stdout`, `stderr`, `exit_code`, `timed_out`, `dauer_s` |
| `list_files` | `path`, `max_entries`, (`depth`) | Ordner rekursiv auflisten (ohne versteckte/System-Ordner, ohne `.git`, `node_modules`, `AppData`) |
| `search_files` | `query` (Wildcards `*`/`?`), `path`, `max_results` | Dateinamen suchen |
| `read_file` | `path`, `max_bytes`, `encoding` (`auto`/`utf-8`) | Textdatei lesen; erkennt BOM, UTF-16, sonst UTF-8, Fallback Windows-1252 |
| `write_file` | `path`, `content`, `append`, `create_dirs` | Datei schreiben/anhängen (UTF-8 ohne BOM) |
| `get_file_info` | `path` | Größe, Typ, Endung, Daten |

Jedes Werkzeug liefert JSON. Fehler kommen als Text mit `Fehler: …` und `isError: true`.

---

## 4. HTTP-API der Brücke

Basis: `http://127.0.0.1:8765`

Pflicht-Header bei allen `/api`-Routen: `X-Arena-Bridge: 1`
Erlaubte Origins: `chrome-extension://<id>` · `https://arena.ai` (und Subdomains) · `http(s)://127.0.0.1…`/`localhost…`

| Methode | Pfad | Anmerkung |
|---|---|---|
| GET | `/` | Info-Seite im Browser (mit „Jetzt erlauben“) |
| GET | `/status` | läuft ohne Zustimmung |
| POST | `/api/consent/allow` | einmalige Zustimmung erteilen (schreibt `consent.json`) |
| POST | `/api/consent/reset` | Zustimmung zurücknehmen |
| GET | `/api/system_info` | – |
| GET | `/api/list_files?path=&max_entries=&depth=` | – |
| GET | `/api/search_files?query=&path=&max_results=` | – |
| GET | `/api/read_file?path=&max_bytes=&encoding=` | – |
| GET | `/api/get_file_info?path=` | – |
| POST | `/api/write_file` | `{"path":"…","content":"…","append":false,"create_dirs":true}` |
| POST | `/api/run_command` | `{"command":"dir","shell":"cmd","cwd":"","timeout_ms":20000}` |

Antwortformat immer JSON (UTF-8). Fehler: `{ "ok": false, "error": "…" }` mit passendem Statuscode
(400 fehlende Parameter, 403 Rechte/Zustimmung/Origin, 404 unbekannt, 413 zu groß, 500 intern).

### Beispiel: eigener Agent in Python

```python
import json, urllib.request

BASE = "http://127.0.0.1:8765"
H = {"X-Arena-Bridge": "1", "Content-Type": "application/json"}

def call(path, data=None):
    req = urllib.request.Request(BASE + path, headers=H,
                                 data=None if data is None else json.dumps(data).encode())
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

print(call("/status"))
print(call("/api/system_info"))
print(call("/api/run_command", {"command": "Get-ChildItem", "shell": "powershell"}))
print(call("/api/write_file", {"path": "bericht.md", "content": "# Hallo\n"}))
```

Node/JS genauso (`X-Arena-Bridge: 1` nicht vergessen). Für Werkzeugschemata, die z. B. ein MCP-Client braucht,
`/status` lesen oder in der Extension-Konsole `ArenaLocalTools.describe()` ausführen – das liefert
JSON-Schema-Definitionen im Format `{name, description, input_schema}`.

---

## 5. Wie ein Assistent die Werkzeuge findet

Auf jeder arena.ai-Seite (sobald die Erweiterung aktiv ist) existiert im `<head>`:

```html
<script type="application/ld+json" id="arena-local-tools">
{
  "@type": "SoftwareApplication",
  "name": "Arena PC Bridge",
  "protocol": {
    "transport": "http",
    "endpoint": "http://127.0.0.1:8765",
    "local_only": true,
    "enabled": true,
    "connected": true,
    "bridge_probe": "http://127.0.0.1:8765/status"
  },
  "permissions": { "read_files": true, "write_files": true, "run_commands": true },
  "tools": [ { "name": "system_info", "description": "…", "input_schema": { … } }, … ]
}
</script>
```

Zusätzlich:

* `window.ArenaLocalTools` – Objekt mit `status()`, `list()`, `call(name, args)`, `describe()`, `promptTemplate()`, `endpoint()`.
* `document.querySelectorAll('#arena-local-tools')` – Discovery über DOM.

**Grenze, ganz offen:** Ob das jeweils ausgewählte Modell diese Beschreibung *automatisch* als Werkzeuge
benutzt, entscheidet die Arena-Weboberfläche – nicht diese Erweiterung. Die Brücke + Schalter sind die
Infrastruktur; die automatische Werkzeuganbindung hängt davon ab, welche Mittel eine Seite gerade anbietet
(und ändert sich mit jedem Frontend-Update). Getestete Wege sind Konsole und lokale Agenten (Abschnitt 4),
plus der Prompt-Hinweis aus [FUNKTIONIERT-NICHT.md](FUNKTIONIERT-NICHT.md#f-antworten-sind-da-aber-es-wurden-keine-pc-werkzeuge-benutzt).

---

## 6. Sicherheitsmodell (Kurzfassung)

1. Nur `127.0.0.1` – nicht im LAN/Internet erreichbar.
2. `Host`- und `Origin`-Prüfung + Pflicht-Header → andere Webseiten kommen nicht durch (DNS-Rebinding/CORS).
3. Einmalige Zustimmung (`consent.json`), sperrbar per `-ResetConsent`.
4. Pfad-Auflösung + Grenzprüfung → kein Ausbruch aus dem Arbeitsordner.
5. Rechte-Schalter in Erweiterung **und** Starter.
6. Timeouts, Output-Kürzung, Mengenlimits.
7. Alles im Startfenster geloggt.

Details und „was ist nicht geschützt“: [SICHERHEIT.md](SICHERHEIT.md).

---

## 6b. Tests

```bash
npm install && npm test
```

* `tools/check-contract.mjs` – Vertrag zwischen den Teilen: Nachrichtentypen (Seite ⇄ `toggle.js` ⇄ Worker),
  Werkzeugnamen (`protocol.js` ⇄ `background.js`), HTTP-Pfade (`background.js` ⇄ `server.ps1`),
  Protokollversion (`protocol.js` ⇄ `server.ps1`), Manifest-Dateien.
* `tools/test-extension.mjs` – jsdom-Test der Seitenskripte: Platzierung der Leiste unter der Chat-Eingabe,
  Schalterverhalten, JSON-LD-Inhalt, `ArenaLocalTools.call`, Ersatz-Anzeige, SPA-Nachziehen.
* `tools/test-background.mjs` – Service Worker mit nachgebildeten `chrome.*`-APIs und einer Mock-Bruecke:
  jedes Werkzeug muss den passenden Endpunkt mit den passenden Parametern treffen; Freigaben und
  Hauptschalter müssen blockieren.

---

## 7. Erweitern

**Neues Werkzeug hinzufügen:**

1. Definition in `extension/src/protocol.js` → `TOOL_DEFINITIONS` (`name`, `description`, `input_schema`).
2. Route in `bridge/server.ps1` im `switch ($path)` ergänzen (`/api/…`).
3. Aufruf in `extension/src/background.js` → `executeTool` (Mapping `name` → Pfad/Parameter + Rechteprüfung).
4. Falls es Lesen/Schreiben/Befehle ist: Freigabe in `permissionProblem` ergänzen.

**Protokollversion:** Bei Änderungen an Endpunkten/Formaten `PROTOCOL_VERSION` in `protocol.js` erhöhen
(erscheint in `/status` als `protocol`).

---

## 8. Grenzen / bekannte Schwächen

* **UI-Erkennung:** Die Leiste findet die Chat-Eingabe heuristisch (Größe, Position, Attribute). Ändert arena.ai sein
  Layout, kann die Platzierung abweichen → Ersatz: Popup und Eck-Anzeige (`state.mode`).
* **Kein Streaming** von Befehlsausgaben – Antwort kommt am Ende.
* **Befehle laufen in deinem Benutzerkontext** und ohne zusätzliche Sandbox.
* **Windows-fokussiert:** `server.ps1` nutzt PowerShell/Windows-Pfade. Auf Linux/macOS würde der Server nicht laufen
  (die Extension selbst schon).
* **Kein Auto-Start:** Absicht.
