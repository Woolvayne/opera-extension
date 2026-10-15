# Arena PC Bridge 🖥️⚡

**Eine Opera-Erweiterung (läuft auch in Chrome/Edge), die Arena.ai Zugriff auf deinen Windows-PC gibt – kontrolliert über einen Ein/Aus-Schalter direkt unter der Chat-Eingabe.**

> **Kurz gesagt:** Du stellst den Schalter unter der Chat-Eingabe auf **AN** und schreibst dann z. B.
> *„Fasse mir zusammen, was gestern in meinen Notizen passiert ist und such mir dazu passende News-Seiten.“*
> Arena kann dann auf deinem PC Dateien lesen, Ordner durchsuchen und (wenn du willst) Befehle ausführen – **nur lokal über `127.0.0.1`**, nichts wird nach außen gesendet.

---

## Inhalt

1. [Was das Ding macht](#1-was-das-ding-macht)
2. [Schnellstart in 5 Minuten (Windows)](#2-schnellstart-in-5-minuten-windows)
3. [Ausführliche Anleitung mit allen Klicks](#3-ausführliche-anleitung-mit-allen-klicks)
4. [So benutzt du es (Beispiele)](#4-so-benutzt-du-es-beispiele)
5. [Freigaben: was darf Arena auf dem PC?](#5-freigaben-was-darf-arena-auf-dem-pc)
6. [Wo liegen meine Dateien? (Arbeitsordner)](#6-wo-liegen-meine-dateien-arbeitsordner)
7. [Sicherheit & Datenschutz](#7-sicherheit--datenschutz)
8. [Wenn etwas nicht klappt](#8-wenn-etwas-nicht-klappt)
9. [Update auf eine neue Version](#9-update-auf-eine-neue-version)
10. [Deinstallieren](#10-deinstallieren)
11. [Wie es technisch funktioniert](#11-wie-es-technisch-funktioniert)
12. [Projektstruktur & Selbst-Bauen](#12-projektstruktur--selbst-bauen)
13. [Lizenz](#13-lizenz)

---

## 1. Was das Ding macht

Es sind zwei Teile, die zusammenspielen:

| Teil | Was es ist | Wo es läuft |
|---|---|---|
| **`extension/`** | Die Opera-Erweiterung. Sie blendet unter der Chat-Eingabe auf arena.ai den Schalter **„Arena PC Bridge: AUS/AN“** ein und vermittelt die Anfragen. | im Browser |
| **`installer/`** | Der Starter (Windows-Stapeldatei + PowerShell). Er startet einen kleinen Server, der **nur auf `127.0.0.1`** (also nur auf deinem eigenen Rechner) lauscht und die Aufgaben ausführt. | auf deinem PC |

Der Schalter unter der Chat-Eingabe hat drei Zustände:

| Anzeige | Bedeutung |
|---|---|
| 🔘 **Arena PC Bridge: AUS** | Arena bekommt **keinen** PC-Zugriff. Die Werkzeuge sind für Arena gesperrt – auch wenn der Server läuft. |
| 🟢 **AN · PC verbunden · Port 8765** | Alles läuft: Verbindung zur Brücke steht, Arena darf (je nach Freigabe) lesen, schreiben, Befehle ausführen. |
| 🟠 **AN · Keine Verbindung …** | Der Schalter ist an, aber der Starter läuft nicht. Das schwarze Fenster auf dem Desktop starten („Arena PC Bridge“). |

Zusätzlich gibt es im Bereich hinter dem Zahnrad-Symbol (⚙) einen Knopf
**„Prompt-Vorlage kopieren“**: Er legt einen fertigen Text in die Zwischenablage, der Arena die lokalen Werkzeuge
nennt – hilfreich, weil Arena.ai keine offene API für Seiten-Werkzeuge hat (siehe [Abschnitt 11](#11-wie-es-technisch-funktioniert)).

Erreichbar ist der Schalter außerdem:

* im Erweiterungs-Popup (Symbol in der Opera-Leiste, neben der Adresszeile),
* über `window.ArenaLocalTools` in der Browser-Konsole (für Profis / Tests),
* für Assistenten über ein maschinenlesbares JSON-LD (`#arena-local-tools`) im Seitenkopf.

---

## 2. Schnellstart in 5 Minuten (Windows)

### Variante A: Fertige ZIP von GitHub (empfohlen)

1. Auf GitHub die **Releases**-Seite öffnen und `arena-pc-bridge-komplett-v1.0.0.zip` herunterladen
   (oder im Repo-Ordner `release/` die gleiche Datei anklicken → „Download“).
2. ZIP entpacken, z. B. nach `C:\Users\DEINNAME\Downloads\arena-pc-bridge`.
3. In den Ordner `installer` gehen und **`install.cmd`** doppelklicken. → Die Kürzung läuft automatisch durch.
4. Auf dem Desktop liegt jetzt **„Arena PC Bridge“** – doppelklicken. Ein schwarzes Fenster geht auf:

   ```
   ============================================================
      Arena PC Bridge  -  lokaler Helfer fuer opera/arena.ai
   ============================================================

     Adresse        : http://127.0.0.1:8765/
     Arbeitsordner  : C:\Users\DEINNAME\Documents\Arena Bridge Workspace
     Lesen          : ERLAUBT
     Schreiben      : ERLAUBT
     Befehle        : ERLAUBT
   ```
   **Dieses Fenster offen lassen.** Minimieren ist ok, Schließen beendet den PC-Zugriff.
5. In Opera: `opera://extensions` in die Adresszeile → **Entwicklermodus** (oben rechts) einschalten → **„Entpackte Erweiterung laden“** → den Ordner **`extension`** auswählen.
6. Opera neu starten, [arena.ai](https://arena.ai) öffnen. Unter der Chat-Eingabe steht jetzt
   **„Arena PC Bridge: AUS“** → anklicken → **AN**.
7. Einmalig erlauben: In der Opera-Leiste auf das Erweiterungs-Symbol klicken → **„Verbindungs-Tab öffnen (Brücke erlauben)“** → im Tab auf **„Jetzt erlauben“**. Antwort: `ok: true`.

**Fertig.** Teste es mit dem Prompt aus [Abschnitt 4](#4-so-benutzt-du-es-beispiele).

### Variante B: Repository klonen

```powershell
git clone https://github.com/Woolvayne/opera-extension.git
cd opera-extension
.\installer\install.cmd        # Verknüpfungen anlegen
# danach: Desktop-Verknüpfung "Arena PC Bridge" starten
```

---

## 3. Ausführliche Anleitung mit allen Klicks

### 3.1 Voraussetzungen

* **Windows 10 oder Windows 11** (PowerShell ist ab Werk dabei – prüfen: `Win + R` → `powershell` → Enter).
* **Opera** (oder Chrome/Edge/Brave – alles Chromium-basiert, identisch).
* Kein Admin-Recht nötig, keine Installation, kein Autostart, kein Dienst.

### 3.2 Schritt 1 – Dateien herunterladen

GitHub → **Releases** → `arena-pc-bridge-komplett-v1.0.0.zip` herunterladen → Rechtsklick auf die ZIP → **„Alle extrahieren …“**.
Wenn Windows meldet *„Die Datei ist von einem anderen Computer …“*: Rechtsklick auf die ZIP → **Eigenschaften** → unten **„Zulassen“** ankreuzen → OK.

> ⚠️ **Nicht** im ZIP arbeiten! Immer erst entpacken, sonst findet Opera kein `manifest.json`.

### 3.3 Schritt 2 – Starter einrichten

1. Im entpackten Ordner `installer` öffnen.
2. **`install.cmd`** doppelklicken. Windows fragt eventuell *„Möchten Sie zulassen …“* → **Ja**.
3. Das Skript legt den Arbeitsordner an und zwei Verknüpfungen auf den Desktop:

   | Verknüpfung | Rechte |
   |---|---|
   | **Arena PC Bridge** | lesen ✚ schreiben ✚ Befehle (voller Funktionsumfang) |
   | **Arena PC Bridge – nur lesen** | nur Dateien lesen (sichere Variante) |

4. Am Ende **Enter** drücken, das Fenster schließt sich.

### 3.4 Schritt 3 – Brücke starten

**„Arena PC Bridge“** auf dem Desktop doppelklicken. Das schwarze Fenster muss **offen bleiben**, solange du Arena mit PC-Zugriff nutzen willst.

Wenn Windows Defender Firewall nachfragt: **Abbrechen** bzw. **Nicht zulassen** ist völlig ausreichend – es geht nur um `127.0.0.1`, für den Zugriff von außen ist nichts nötig.

Kurz testen: im Browser `http://127.0.0.1:8765/` aufrufen → es erscheint eine kleine Seite **„Arena PC Bridge läuft ●“** mit Port, Arbeitsordner und einem Button **„Jetzt erlauben“**.

### 3.5 Schritt 4 – Erweiterung in Opera laden

1. Opera öffnen.
2. Adresszeile: **`opera://extensions`** → Enter.
3. Oben rechts den Schalter **„Entwicklermodus“ / „Developer mode“** einschalten.
4. Oben links **„Entpackte Erweiterung laden“ / „Load unpacked“** anklicken.
5. Den Ordner **`extension`** wählen (den aus dem entpackten ZIP, z. B. `…\arena-pc-bridge\extension`) → **Ordner auswählen**.
6. „Arena PC Bridge“ erscheint in der Liste. Oben rechts auf das **Puzzle-Symbol** klicken und bei „Arena PC Bridge“ das **Pin-Symbol** aktivieren – dann hast du das Symbol dauerhaft in der Leiste.

### 3.6 Schritt 5 – Arena-Tab öffnen und einschalten

1. Opera komplett neu starten (damit die Erweiterung überall greift).
2. [https://arena.ai](https://arena.ai) öffnen (kein alter Tab – neu laden).
3. Unter der Chat-Eingabe erscheint eine kleine Leiste:

   ```
   ( ) Arena PC Bridge: AUS      ●  Aus · Arena nutzt nur die eigene Websuche           ⚙ 8 Werkzeuge
   ```

4. Auf den Schalter klicken → er wird grün: **„Arena PC Bridge: AN“**.
5. Erste Prüfung: Erweiterungs-Symbol in der Leiste anklicken → **„Verbindungs-Tab öffnen (Brücke erlauben)“** → im neuen Tab auf **„Jetzt erlauben“** klicken.

   Dort steht danach etwa:

   ```
   Erlaubt! Der Browser darf ab jetzt mit der Bruecke sprechen.

   { "ok": true, "name": "Arena PC Bridge", "protocol": 1, "port": 8765,
     "root": "C:\\Users\\DEINNAME\\Documents\\Arena Bridge Workspace",
     "permissions": { "allowRead": true, "allowWrite": true, "allowCommands": true } }
   ```

6. Zurück zum Arena-Tab. Jetzt steht dort **„PC verbunden · Port 8765 · 09:15“**.

### 3.7 Schritt 6 – Funktionsprüfung in der Konsole

Willst du sehen, dass wirklich dein PC antwortet, öffne auf arena.ai die Entwicklertools (**F12**) → Reiter **Console** → tippe:

```js
await ArenaLocalTools.call("system_info")
```

Antwort z. B.:

```json
{ "ok": true, "computer": "DESKTOP-ABC", "benutzer": "DEINNAME", "windows": "Microsoft Windows NT 10.0.26100.0", "cpu": "AMD Ryzen 7 5800X ...", "ramGB": 32 }
```

---

## 4. So benutzt du es (Beispiele)

Der Schalter muss **AN** sein. Dann kannst du ganz normal schreiben – hier Beispiele, die zeigen, was die Erweiterung Arena freischaltet:

### Beispiel 1 – „Was ist gestern passiert?“

> **Prompt:** „Fasse mir zusammen, was gestern passiert ist. Such dir die News zusammen und schau parallel in meinen Ordner `Notizen` – dort liegen meine Stichpunkte von gestern. Verbinde beides zu einem kurzen Briefing.“

Ablauf: Arena nutzt die **eingebaute Websuche** (News-Anbieter, Agentur-Meldungen, …) **und** parallel die Werkzeuge dieser Erweiterung (`list_files`, `read_file`, `search_files`), um deine lokalen Notizen zu lesen. Ergebnis: ein Briefing aus News + deinen eigenen Dateien.

### Beispiel 2 – Rechnungen finden

> „Ich habe irgendwo PDF-Rechnungen von 2025. Such sie, sag mir welche fehlen, und leg mir eine Übersicht `rechnungen.md` in meinem Arbeitsordner an.“

→ `search_files` (Muster `*.pdf`), `read_file`, `write_file`.

### Beispiel 3 – Downloads aufräumen

> „Sortier mir meinen Downloads-Ordner: Bilder nach `Downloads\Bilder`, PDFs nach `Downloads\PDF` – zeig mir vorher, was du verschieben würdest.“

→ `list_files` + `run_command` (z. B. `Move-Item`, `New-Item -ItemType Directory`). Bei Änderungen wirst du gefragt, weil das Modell den Plan zuerst zeigt.

### Beispiel 4 – Lokale Entwicklung

> „Führ in meinem Arbeitsordner `git log --oneline -20` aus und fasse zusammen, was in den letzten Commits passiert ist.“

→ `run_command` mit `git` (Standard-Shell ist **PowerShell**, `cmd` ist auch möglich).

### Beispiel 5 – Wenn das Modell die Werkzeuge nicht von selbst nutzt

Ein Klick auf **⚙ Werkzeuge → „Prompt-Vorlage kopieren“** legt sowas in die Zwischenablage:

```
Lokal auf meinem PC läuft die "Arena PC Bridge" (nur unter http://127.0.0.1:8765).
Verfügbare lokale Werkzeuge:
  - local_bridge_status  (Verbindung, Ordner, Rechte prüfen)
  - system_info          (Windows-Version, CPU, RAM, Laufwerke)
  - list_files           {"path":"", "max_entries":200}
  - search_files         {"query":"*.pdf", "path":""}
  - read_file            {"path":"Notizen/heute.md"}
  - write_file           {"path":"bericht.md", "content":"..."}
  - get_file_info        {"path":"..."}
  - run_command          {"command":"...", "shell":"powershell"}
Aktuelle Freigaben: Dateien lesen=AN, Dateien schreiben=AN, Befehle=AUS.
Wenn du etwas von meinem PC brauchst: nenne mir bitte genau Werkzeug + Argumente.

Meine Aufgabe:
```

Diesen Text (vorher noch die Aufgabe darunter schreiben) in den Chat einfügen – damit kennt das Modell die Werkzeuge
namentlich und kann dir genau sagen, was ausgeführt werden soll. In der Konsole führt `await` den Aufruf direkt aus.

### Beispiel 6 – System-Infos

> „Wie viel Platz ist auf meinen Laufwerken frei und welche Windows-Version habe ich?“

→ `system_info` (Laufwerke, RAM, CPU, Windows-Build).

> 💡 **Tipp:** Sag im Prompt ruhig dazu, *wo* gesucht werden soll („in meinem Arbeitsordner“, „in `Notizen\2025`“). Das geht schneller als Suchen im Blindflug. Und: der PC-Zugriff ist ein **Zusatz** zur Websuche – beides läuft parallel.

---

## 5. Freigaben: was darf Arena auf dem PC?

Es gibt zwei Ebenen – beide müssen passen. Diese Ebenen sind Absicht: die Extension ist der „Schalter“, der Starter die „Sicherung“.

| Ebene | Wo einstellen | Was es steuert |
|---|---|---|
| **AN/AUS** | (1) unter der Chat-Eingabe, (2) Erweiterungs-Popup | Ob überhaupt PC-Aufrufe erlaubt sind |
| **Lesen** (`allowRead`) | Popup / Panel unter dem Schalter | Ordner auflisten, Dateien lesen, durchsuchen, Datei-Infos |
| **Schreiben** (`allowWrite`) | Popup / Panel | Dateien anlegen, überschreiben, anhängen |
| **Befehle** (`allowCommands`) | Popup / Panel | PowerShell/cmd ausführen (git, winget, python, …) |

Zusätzlich kannst du beim Start des Starters festlegen, was er überhaupt anbietet (die „harte“ Grenze):

```powershell
start.cmd                      # Lesen erlaubt, Schreiben/Befehle gesperrt  (Standard)
start.cmd -Write               # zusätzlich Schreiben
start.cmd -Commands            # zusätzlich Befehle
start.cmd -Commands -Write     # alles (so startet die Desktop-Verknüpfung)
start.cmd -Root "C:\Users\DEINNAME\Downloads"   # anderer Arbeitsordner
start.cmd -Port 8899           # anderer Port (dann im Popup den Port anpassen!)
start.cmd -ResetConsent        # Zugriff sperren, "Erlauben" muss neu geklickt werden
```

Passt eine Ebene nicht zusammen, antwortet der Server mit einer klaren Meldung wie
*„Befehle sind nicht freigegeben …“* – es passiert dann einfach nichts.

---

## 6. Wo liegen meine Dateien? (Arbeitsordner)

Standardmäßig darf Arena **nur** in diesem Ordner arbeiten:

```
C:\Users\DEINNAME\Documents\Arena Bridge Workspace
```

* Beim ersten Start werden dort eine `LIESMICH.txt` und der Unterordner `.arena-bridge` (Einstellungen/Zustimmung) angelegt.
* Alles außerhalb (z. B. `C:\Windows`, andere Benutzerordner) wird mit **„Pfad liegt ausserhalb des erlaubten Ordners“** abgelehnt – technisch, nicht nur durch einen Hinweis an das Modell.
* Du bestimmst den Ordner selbst: `start.cmd -Root "C:\Users\DEINNAME\Downloads"`.
  Für die Beispiele oben (Notizen, Rechnungen) lege vorher hinein, was du brauchst – oder starte den Starter mit dem passenden `-Root`.
* Der Starter liest deine **Schalter im Popup der Erweiterung nur für die Anzeige**; die Durchsetzung von Lesen/Schreiben/Befehlen passiert serverseitig im Starter.

---

## 7. Sicherheit & Datenschutz

* **Nur lokal:** Der Server bindet ausschließlich an `127.0.0.1` – er ist aus dem Internet **nicht** erreichbar, auch nicht aus dem eigenen WLAN.
* **Header-Prüfung:** Der Server prüft `Host`- und `Origin`-Header. Damit funktionieren nur Chromium-Erweiterungen, `arena.ai` selbst und die lokale Info-Seite (Schutz gegen DNS-Rebinding und fremde Webseiten).
* **Zustimmung einmalig:** Ohne den einmaligen Klick auf **„Jetzt erlauben“** antwortet die API nur mit *„Noch keine Zustimmung“*. Das lässt sich mit `start.cmd -ResetConsent` jederzeit widerrufen.
* **Schalter schlägt alles:** Steht der Schalter auf **AUS**, beantwortet die Erweiterung **keine** Werkzeug-Anfragen mehr – auch wenn der Klassenraum-Server noch läuft.
* **Arbeitsordner-Grenze:** Kein Zugriff außerhalb des erlaubten Ordners (Pfad-Auflösung inklusive `..`-Erkennung).
* **Zeitlimits:** Befehle laufen maximal 120 Sekunden, Ausgaben werden gekürzt, Lesen/Schreiben ist in der Menge begrenzt.
* **Kein Netzwerk-Versand:** Die Erweiterung selbst sendet keine Daten an Dritte. Es gibt keinen Analysedienst, kein Konto, keine Cloud.
* **Protokoll:** Das Startfenster zeigt jede Anfrage im Klartext (`GET /api/list_files -> 200`). Das Erweiterungs-Popup zeigt die letzten Aufrufe (nur lokal gespeichert, „Verlauf löschen“ löscht sie).

> **Ehrlich gesagt:** Wenn du **Befehle** freigibst, kann das Modell damit alles tun, was dein Windows-Benutzer darf (Dateien löschen, Programme starten …). Genau deshalb gibt es den Schalter und die Start-Optionen. Für den Anfang empfehle ich die Desktop-Verknüpfung **„nur lesen“**; wenn du Befehle freischaltest, schau dir vor dem Absenden kurz an, was das Modell ausführen will.

---

## 8. Wenn etwas nicht klappt

| Problem | Ursache & Lösung |
|---|---|
| **Kein Schalter unter der Chat-Eingabe** | (a) Tab ist noch alt → `F5`. (b) Erweiterung nicht geladen → `opera://extensions`. (c) Seite ist nicht arena.ai. (d) Anderer Name der Seite → dann greift die Ersatz-Anzeige unten rechts im Eck, aber die Zuordnung zum Eingabefeld fehlt. (e) Prüfen mit `F12` → Console: `ArenaLocalTools.status()`. |
| **„Keine Verbindung zu 127.0.0.1:8765“** | Starter läuft nicht → Desktop-Verknüpfung **„Arena PC Bridge“**. Alternativ: Es läuft eine Firewall und blockiert lokale Verbindungen (selten). |
| **„Noch keine Zustimmung“** | Einmalig **„Jetzt erlauben“** klicken: Symbol in der Leiste → „Verbindungs-Tab öffnen“ → Button. |
| **„Befehle sind nicht freigegeben“** | Im Popup **„Befehle ausführen“** aktivieren **und** den Starter mit `-Commands` starten (Desktop-Verknüpfung nutzt das bereits). |
| **„Schreiben ist nicht freigegeben“** | dasselbe mit **„Dateien schreiben“** / `-Write`. |
| **„Pfad liegt ausserhalb des erlaubten Ordners“** | Du hast nach einem Ordner außerhalb gefragt. Starter mit `-Root "C:\…"` neu starten. |
| **Port 8765 belegt** | Anderen Port nehmen: `start.cmd -Port 8899`, im Popup den Port auf 8899 setzen, „testen“. |
| **Antworten kommen, aber Arena „vergisst“ die Werkzeuge** | Das Modell hat je nach Modus nicht automatisch Zugriff auf Seiten-Werkzeuge. Workarounds: (1) im Prompt auf „lokale Werkzeuge/JSON-LD“ hinweisen, (2) für einen Live-Test `await ArenaLocalTools.call("run_command", {command:"winget list"})` in der Konsole benutzen, (3) Modus wechseln (Agent-Modus hat eigene Werkzeuge). Details: [docs/TECHNISCH.md](docs/TECHNISCH.md). |
| **Fenster schließt sich sofort** | Meist ist der Port belegt oder PowerShell blockiert Skripte – dann im Fenster noch einmal `installer\start.cmd` ausführen, um die Fehlermeldung zu lesen. |
| **Windows: Smartscreen-Warnung beim Start** | „Weitere Informationen“ → „Trotzdem ausführen“. Es sind nur `.cmd`/`.ps1`-Textdateien, du kannst sie im Editor nachlesen. |

Ausführlicher: **[docs/FUNKTIONIERT-NICHT.md](docs/FUNKTIONIERT-NICHT.md)**

---

## 9. Update auf eine neue Version

1. Neue ZIP herunterladen und an dieselbe Stelle entpacken (die alte Version überschreiben).
2. Starter-Fenster schließen, Desktop-Verknüpfung neu starten.
3. In Opera: `opera://extensions` → bei **Arena PC Bridge** auf **Aktualisieren** (⟳).
4. Arena-Tab neu laden. Der Port und der Arbeitsordner bleiben gleich, deine Freigaben bleiben erhalten.

---

## 10. Deinstallieren

1. In Opera: `opera://extensions` → **Arena PC Bridge** → **Entfernen**.
2. Im entpackten Ordner `installer\uninstall.cmd` doppelklicken (löscht die Desktop-Verknüpfungen).
   Zusatzoptionen: `uninstall.cmd -Reset` (Zugriff sperren), `uninstall.cmd -All` (auch den Arbeitsordner löschen).
3. Optional: den Projektordner löschen. Fertig – es bleibt nichts im System zurück.

---

## 11. Wie es technisch funktioniert

```
┌────────────────────────── Opera ──────────────────────────┐
│  arena.ai (Tab)                                            │
│    ├─ inject.js   (MAIN-Welt:  Schalter-Leiste unter der   │
│    │              Chat-Eingabe + JSON-LD + ArenaLocalTools)│
│    └─ toggle.js   (ISOLATED: vermittelt per postMessage)   │
│                          │ chrome.runtime.sendMessage      │
│  background.js (Service Worker)                            │
└──────────────────────────┼─────────────────────────────────┘
                           │  HTTP auf http://127.0.0.1:8765
                           ▼  (CORS vom Service-Worker erlaubt)
┌─────────────── dein PC: server.ps1 ────────────────────────┐
│  /status                  Verbindung + Rechte + Ordner     │
│  /api/system_info         Windows, CPU, RAM, Laufwerke     │
│  /api/list_files          Ordner auflisten                 │
│  /api/search_files        Dateien suchen                   │
│  /api/read_file           Datei lesen (UTF-8/UTF-16/1252)  │
│  /api/write_file          Datei schreiben/anhängen         │
│  /api/get_file_info       Größe, Datum, Typ                │
│  /api/run_command         PowerShell/cmd ausführen         │
│  /api/consent/allow       "Jetzt erlauben" (einmalig)      │
└────────────────────────────────────────────────────────────┘
```

* Der **Service Worker** ruft die lokale Brücke auf – er darf das ohne CORS-Preflight-Probleme, weil `http://127.0.0.1/*` in `host_permissions` steht.
* Die **Seite** selbst bekommt nie direkten Netzzugriff auf die Brücke; alles läuft über Nachrichten an den Service Worker.
* Damit ein KI-Modell die Werkzeuge **findet**, veröffentlicht die Erweiterung im Seitenkopf ein JSON-LD `#arena-local-tools` mit allen Werkzeugnamen, Beschreibungen und JSON-Schemas – plus `window.ArenaLocalTools`, wenn man Tools über den Seiten-Kontext aufrufen kann.
* Für Fremdprogramme gibt es die schlichte HTTP-API (siehe [docs/TECHNISCH.md](docs/TECHNISCH.md)) – damit kann auch ein **lokaler** Agent (z. B. ein Python-Skript oder MCP-Client) dieselben Werkzeuge benutzen.

Mehr Details, API-Doku und Grenzen: **[docs/TECHNISCH.md](docs/TECHNISCH.md)**

---

## 12. Projektstruktur & Selbst-Bauen

```
opera-extension/
├─ extension/                  ← DIESEN Ordner in Opera laden
│  ├─ manifest.json
│  ├─ icons/                   (16/32/48/128/256 px + icon.ico für Windows-Verknüpfungen)
│  └─ src/
│     ├─ background.js         Service Worker (Werkzeuge, Einstellungen, Badge)
│     ├─ inject.js             Schalter-Leiste + JSON-LD + ArenaLocalTools
│     ├─ toggle.js             Brücke zwischen Seite und Erweiterung
│     ├─ protocol.js           Werkzeug-Definitionen + gemeinsame Helfer
│     ├─ popup.html/css/js     Steuerzentrale (Symbol in der Leiste)
│     └─ guide.html/css/js     Einrichtung & Fehlerhilfe + "Jetzt erlauben"
├─ bridge/server.ps1           der lokale Server (Windows)
├─ installer/
│  ├─ install.cmd              Einrichtung (Verknüpfungen anlegen)
│  ├─ start.cmd                Starter (Port, Arbeitsordner, Freigaben)
│  └─ uninstall.cmd            Deinstallation
├─ docs/                       Anleitung, Sicherheit, Fehlerhilfe, Technik
├─ tools/                      Icon-Quelle, ZIP-Bau, Tests
└─ release/                    fertige ZIP-Dateien für den Download
```

**ZIP selbst bauen:**

```bash
bash tools/build-zip.sh 1.0.0
# -> release/arena-pc-bridge-komplett-v1.0.0.zip   (ganzes Projekt)
# -> release/arena-pc-bridge-extension-v1.0.0.zip  (nur die Erweiterung)
```

Unter Windows geht es auch mit Rechtsklick → „Senden an → ZIP-komprimierter Ordner“.
**Wichtig:** Nur den Inhalt von `extension/` packen (also `manifest.json` direkt oben in der ZIP), wenn du eine Erweiterungs-ZIP willst.

---

## 12b. Tests

Ohne Browser lauffaehig (Node + jsdom):

```bash
npm install     # einmalig (nur jsdom/resvg fuer Tests & Icons)
npm test
```

Geprueft werden u. a.:

* **Vertrag** (`tools/check-contract.mjs`): Passen Nachrichtentypen, Werkzeugnamen und HTTP-Pfade
  zwischen Seite, Erweiterung und PowerShell-Bruecke zusammen? Stimmt die Protokollversion?
* **Oberflaeche** (`tools/test-extension.mjs`): Wird die Schalter-Leiste wirklich **unter der Chat-Eingabe**
  eingefuegt, schaltet der Klick, sind JSON-LD und `ArenaLocalTools` korrekt, greift die Ersatz-Anzeige?
* **Werkzeuge** (`tools/test-background.mjs`): Ruft jedes Werkzeug den richtigen Endpunkt mit den richtigen
  Parametern auf? Blockieren Schalter und Freigaben zuverlaessig?

Aktueller Stand: **107 Prüfungen, alle grün.**

## 13. Lizenz

MIT – siehe [LICENSE](LICENSE). Benutzung auf eigene Gefahr; gib die Befehls-Freigabe nur frei, wenn du weißt, was du tust.
