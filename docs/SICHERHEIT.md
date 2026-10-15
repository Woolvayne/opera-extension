# Sicherheit & Datenschutz

Diese Seite erklärt genau, was das Projekt technisch wert ist – und was **nicht**.
Absolute Sicherheit kann eine solche Brücke nicht versprechen: wer Befehle freigibt, gibt Kontrolle ab.
Alles hier ist so gebaut, dass du **jederzeit** den Stecker ziehen kannst.

---

## 1. Schutzmechanismen (in der Reihenfolge, in der sie greifen)

| # | Mechanismus | Wo | Wirkung |
|---|---|---|---|
| 1 | **Bindung nur an 127.0.0.1** | `server.ps1` (`HttpListener` Präfix `http://127.0.0.1:PORT/`) | Aus dem Internet und aus dem eigenen LAN ist die Brücke **nicht** erreichbar. Ein zweiter Rechner im WLAN kommt nicht dran. |
| 2 | **Host-Header-Prüfung** | `Test-Access` | Der Server akzeptiert nur `127.0.0.1:PORT`, `localhost:PORT`, `[::1]:PORT`. Damit scheitern DNS-Rebinding-Angriffe (böse Domain zeigt auf `127.0.0.1`). |
| 3 | **Origin-Prüfung** | `Test-Access` | Erlaubt sind nur Chromium-Erweiterungen (`chrome-extension://…`), `arena.ai`-Seiten und `127.0.0.1` selbst. Eine beliebige Webseite bekommt 403 – auch mit passenden Headern. |
| 4 | **Pflicht-Header** | `Test-Access` | Jeder `/api`-Aufruf braucht `X-Arena-Bridge: 1`. Jede Fremdseite würde dafür einen CORS-Preflight auslösen – und der scheitert an Punkt 3. |
| 5 | **Einmalige Zustimmung** | `consent.json` | Ohne „Jetzt erlauben“ gibt es nur `GET /status`. Die Zustimmung liegt in `.arena-bridge/consent.json` und ist mit `-ResetConsent` widerrufbar. |
| 6 | **Schalter in der Erweiterung** | `background.js` | Steht der Schalter auf AUS, werden Werkzeuganfragen bevor sie den PC erreichen mit einer Klartextmeldung beantwortet – der Server wird nicht einmal aufgerufen (nur `/status` für die Anzeige). |
| 7 | **Arbeitsordner-Grenze** | `Resolve-SafePath` | Jeder Pfad wird zu einem absoluten Pfad aufgelöst und muss im erlaubten Ordner liegen. `..\..\Windows\System32` wird abgewiesen. Prüfung findet serverseitig statt (nicht „weil das Modell brav ist“). |
| 8 | **Rechte-Schalter** | `-Read/-Write/-Commands` | Lesen, Schreiben und Befehle sind unabhängig schaltbar; die Desktop-Verknüpfung lässt sich anpassen. Rechte, die der Starter nicht hat, kann auch die Erweiterung nicht erteilen. |
| 9 | **Ressourcenlimits** | `server.ps1` | Befehls-Timeout max. 120 s (Kill des Prozessbaums bei Überschreitung), Ausgabe wird gekürzt, Lese-/Schreibmengen begrenzt. |
| 10 | **Protokoll** | Startfenster | Jede Anfrage wird mit Zeitstempel, Methode, Pfad und Statuscode geloggt – auch alle abgelehnten Aufrufe. |

---

## 2. Was NICHT geschützt ist

* **Das Modell selbst.** Wenn du Befehle freigibst, kann es z. B. Dateien in deinem Arbeitsordner löschen
  (`Remove-Item`) oder Programme starten, die dein Benutzer starten darf. Genau dafür gibt es den Schalter.
* **Deine Zustimmung.** Wer Zugriff auf deinen angemeldeten Browser hat (z. B. jemand an deinem entsperrten PC),
  kann alles benutzen. Desktop-Sperre ist dein Freund.
* **Lokale Programme.** Andere Programme auf deinem PC könnten die Brücke ebenso aufrufen (sie kennen den
  Header-Wert). Ein Angreifer, der schon Befehle auf deinem PC ausführen kann, braucht diese Brücke aber nicht mehr.
* **Weitergabe des Arbeitsordners.** Was im Arbeitsordner liegt, kann an das Modell gehen, sobald du eine Aufgabe
  dazu stellst. Lege dort keine Passwörter/Kryptoschlüssel ab.
* **Die Antworten des Modells.** Sie werden nicht von dieser Erweiterung geprüft. Bei riskanten Befehlen: Plan zeigen lassen.

---

## 3. Welche Daten fließen wohin?

| Weg | Was fließt | Wohin |
|---|---|---|
| Erweiterung → Brücke | Werkzeugname + Argumente (z. B. Befehl), Port, Zustand | `http://127.0.0.1:8765` – bleibt auf deinem PC |
| Brücke → Erweiterung | Datei-Inhalte, Befehlsausgaben, Systeminfos | zurück an den Service Worker/die Seite |
| Seite (arena.ai) ↔ Modell | dein Prompt **und die Inhalte, die das Modell als Werkzeugergebnis bekommt** | an das von dir gewählte Modell über Arena |
| Irgendwohin sonst | **nichts** | – |

Es gibt **keine** Telemetrie, kein Konto, keine Cloud dieser Erweiterung. Die Dateien `.arena-bridge/settings.json`
und `.arena-bridge/consent.json` liegen im Arbeitsordner, der Verlauf liegt in `chrome.storage.local` (lokal, mit
„Verlauf löschen“ entfernbar).

> Wichtig: Sobald das Modell lokale Inhalte als Werkzeugergebnis bekommt, sind sie Teil des Chats und werden an das
> Modell übertragen. Das ist bei allen „Assistenten mit Dateizugriff“ so. Frage gezielt nach Dateien, die du teilen willst.

---

## 4. Empfehlungen

1. **Erst „nur lesen“** testen (`Arena PC Bridge - nur lesen`).
2. **Arbeitsordner begrenzen:** `-Root "C:\Users\DEINNAME\Arena-Test"` statt eines großen Ordners.
3. **Schalter AUS**, wenn du nicht mit PC-Zugriff arbeitest. (Der Server darf ruhig laufen.)
4. **Plan prüfen lassen** vor schreibenden/ausführenden Aufträgen („zeig mir zuerst, was du ausführen würdest“).
5. **`-ResetConsent`** nach Experimenten, damit nicht jede Anfrage durchgeht.
6. Nichts Persönliches (Ausweise, Passwörter, Bankdaten) in den Arbeitsordner legen.

---

## 5. Nachprüfen statt glauben

Alles ist lesbarer Text – du kannst jede Zeile prüfen:

```powershell
Get-Content .\bridge\server.ps1 | more        # Der Server
Get-Content .\extension\src\background.js     # Die Werkzeuge der Erweiterung
Get-Content .\extension\manifest.json         # Welche Rechte die Erweiterung will
```

Die Erweiterung fordert: `storage`, `tabs`, `scripting`, `alarms`, `notifications` sowie Host-Zugriff auf
`http://127.0.0.1/*`, `http://localhost/*` und `https://*.arena.ai/*`.
Kein `webRequest`, kein `<all_urls>`, kein Hintergrund-Download, keine externen Scripts (MV3 verbietet das ohnehin).
