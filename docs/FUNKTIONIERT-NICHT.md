# Fehlerhilfe – „Bei mir geht es nicht“

Arbeite die Liste von oben nach unten ab. Nach jedem Schritt **neu prüfen**, nicht raten.

---

## A) Kein Schalter unter der Chat-Eingabe

1. **Tab neu laden** (`F5`) – nach einer Installation ist ein alter Tab „blind“.
2. `opera://extensions` öffnen: Steht **Arena PC Bridge 1.0.0** in der Liste und ist aktiviert?
   Wenn nicht → [Anleitung Schritt 3](ANLEITUNG-WINDOWS.md).
3. Ist der Tab wirklich auf **arena.ai**? (Nicht `lmarena.ai`, nicht ein Preview-Link.)
4. Prüfe, ob die Erweiterung auf der Seite arbeitet: **F12** → Console:

   ```js
   window.ArenaLocalTools && window.ArenaLocalTools.status()
   ```

   * Kommt ein Objekt (`{enabled:…, connected:…}`) → die Erweiterung läuft. Dann ist nur die *Platzierung* der Leiste
     nicht gelungen (die Seite hat sich geändert). Bis dahin: Popup-Symbol in der Opera-Leiste benutzen –
     dort ist derselbe Schalter.
     Zusätzlich erscheint die Leiste als **Ersatz-Anzeige unten rechts**.
   * Kommt `undefined` → Erweiterung greift nicht auf dieser Seite: `opera://extensions` → bei der Erweiterung
     auf **Aktualisieren** (⟳) → Tab neu laden. Opera einmal komplett neu starten.
5. Anderer Tab-Typ? In Seitenleisten-/Pop-up-Fenstern greift die Leiste nicht überall.
6. Erweiterungs-Konflikte: andere Skript-/Tool-Erweiterungen können DOM-Skripte blockieren – alle anderen
   Erweiterungen kurz deaktivieren und testen.

---

## B) Schalter ist AN, aber „Keine Verbindung zu 127.0.0.1:8765“

1. **Läuft der Starter?** Schwarzes Fenster **„Arena PC Bridge – Port 8765“** offen? Wenn nicht: Desktop-Verknüpfung doppelklicken.
2. **Manuell testen:** im Browser `http://127.0.0.1:8765/status` aufrufen.
   * Kommt JSON → Brücke läuft. Dann im Popup **„testen“** klicken (evtl. andere Port-Nummer drin).
   * Kommt „Seite nicht erreichbar“ → Brücke läuft nicht.
3. **Port passt nicht:** Popup → Feld **Port**. Wenn der Starter mit `-Port 8899` läuft, muss im Popup 8899 stehen.
4. **Firewall/Antivirus:** Manche Sicherheitspakete blocken sogar Loopback. Testweise deaktivieren (nur zum Test),
   oder `start.cmd` in die Ausnahmeliste aufnehmen.
5. **PowerShell blockiert:** In `installer` eine Eingabeaufforderung öffnen (Adresszeile `cmd`) und ausführen:

   ```
   start.cmd
   ```

   Die Fehlermeldung im Fenster lesen (z. B. *„Port 8765 konnte nicht geoeffnet werden“*).

---

## C) „Noch keine Zustimmung“ / 403

* Popup → **„Verbindungs-Tab öffnen (Brücke erlauben)“** → **„Jetzt erlauben“** klicken.
* Wurde die Zustimmung mit `-ResetConsent` zurückgenommen? Dann erneut erlauben.
* Meldung *„Origin 'https://…' ist nicht erlaubt“*: Du rufst die Brücke aus einer fremden Webseite auf. Nur die
  Extension, arena.ai und die lokale Seite dürfen das.

---

## D) „Befehle sind nicht freigegeben“ / „Schreiben ist nicht freigegeben“

Der Starter wurde ohne die Freigabe gestartet.

1. Starter-Fenster schließen (STRG+C oder Fenster zu).
2. Starten mit Freigabe:
   * `installer\start.cmd -Commands -Write` (alles), oder
   * Desktop-Verknüpfung **„Arena PC Bridge“** (nutzt `-Commands -Write`), oder
   * im Popup die Häkchen **„Befehle ausführen“** / **„Dateien schreiben“** setzen – **aber** der Starter muss
     zusätzlich mit `-Commands`/`-Write` laufen.
3. Im Popup auf **„testen“** – danach zeigt der Status die Rechte an.

---

## E) „Pfad liegt ausserhalb des erlaubten Ordners“

Beabsichtigt. Arena darf nur im Arbeitsordner arbeiten.
Lösung: Starter mit passendem Ordner starten, z. B.

```powershell
cd installer
start.cmd -Root "C:\Users\DEINNAME\Downloads" -Commands
```

Danach im Popup **testen** (Status zeigt den neuen Ordner).

---

## F) Antworten sind da, aber es wurden keine PC-Werkzeuge benutzt

Das kann passieren und ist **die wichtigste Einschränkung** dieses Projekts (Details: [TECHNISCH.md](TECHNISCH.md)):

* Arena ist keine offene API-Plattform. Diese Erweiterung stellt die Werkzeuge nach bekannten Web-Standards bereit
  (`#arena-local-tools` als JSON-LD, `window.ArenaLocalTools`).
  Ob das **sichtbare Modell** (Kampf-Modus, Direkt-Chat, Agent-Modus) sie automatisch annimmt, hängt von der Seite ab.
* Der Agent-Modus von Arena bringt **eigene** Werkzeuge mit (Websuche, Sandbox, Dateien). Frage dann z. B. nach einer
  Websuche und nutze die Erweiterung für lokale Dinge – oder weise im Prompt darauf hin, dass eine lokale Brücke
  existiert (siehe unten).

**Was sicher funktioniert (getestet):**

1. **Konsole** auf arena.ai:

   ```js
   await ArenaLocalTools.call("system_info")
   await ArenaLocalTools.call("list_files", { path: "" })
   await ArenaLocalTools.call("run_command", { command: "winget list" })
   ```

2. **Lokale Agenten/Programme** (Python, Node, PowerShell) gegen die HTTP-API – siehe [TECHNISCH.md](TECHNISCH.md).

**1. Einfachster Weg: der Knopf in der Leiste.**
Unter der Chat-Eingabe auf **⚙ Werkzeuge** klicken und **„Prompt-Vorlage kopieren“** drücken – der Text nennt dem
Modell alle 8 Werkzeuge und deine Freigaben. Darunter deine Aufgabe schreiben und absenden.

**2. Prompt-Formulierung, die hilft:**

> „Es läuft lokal eine Brücke namens 'Arena PC Bridge'. Werkzeuge: local_bridge_status, system_info, run_command,
> list_files, search_files, read_file, write_file, get_file_info. Wenn du lokale Informationen brauchst, sage
> genau, welches Werkzeug du aufrufen willst und mit welchen Argumenten – ich führe es dir aus.“

Damit bekommst du zumindest **ausführbare Anweisungen** und kannst sie 1:1 in der Konsole laufen lassen.

---

## G) Sonstiges

| Symptom | Lösung |
|---|---|
| Fenster verschwindet sofort | `cmd` öffnen → `start.cmd` eintippen → Fehler steht im Fenster. |
| „Sie haben nicht die Berechtigung“ beim Laden der Erweiterung | Ordner nicht im ZIP lassen, sondern erst entpacken. |
| Alles langsam | Befehle laufen synchron; lange Befehle geben nach 20 s auf (im Aufruf ist `timeout_ms` einstellbar). |
| Port belegt (z. B. von anderer Software) | `start.cmd -Port 8899` + Port im Popup ändern. |
| Windows Defender löscht `start.cmd` | Ausnahmeregel hinzufügen; der Inhalt ist reiner Text (`Rechtsklick → Bearbeiten`). |
| Nach Windows-Update weg | Verknüpfungen neu anlegen: `installer\install.cmd`. |

---

## Diagnose-Spickzettel

```powershell
# 1) Läuft der Server auf dem Port?
Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue | Select-Object State,OwningProcess

# 2) Antwortet er?
Invoke-RestMethod http://127.0.0.1:8765/status | ConvertTo-Json -Depth 4

# 3) Erlaubt er den Browser?
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8765/api/consent/allow -Headers @{ 'X-Arena-Bridge' = '1' } | ConvertTo-Json

# 4) Rechte prüfen (nach dem Start im Fenster sichtbar) und Freigaben zurücksetzen:
.\installer\uninstall.cmd -Reset
```

Im Browser (auf arena.ai, F12 → Console):

```js
ArenaLocalTools.status();          // enabled / connected / bridgeUrl / Rechte
ArenaLocalTools.list();            // alle Werkzeugnamen
await ArenaLocalTools.call("local_bridge_status");
```
