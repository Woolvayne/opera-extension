# Anleitung für Windows – Schritt für Schritt

Diese Anleitung ist für Einsteiger. Sie dauert ca. 5–10 Minuten.
Alles, was du brauchst: **Windows 10/11**, **Opera** und den entpackten Projektordner.

---

## Übersicht: die 3 Teile

| Teil | Was du damit machst |
|---|---|
| `installer\install.cmd` | **einmalig** einrichten (legt Verknüpfungen auf den Desktop) |
| Desktop-Verknüpfung **„Arena PC Bridge“** | **bei jeder Sitzung** doppelklicken – das ist dein PC-Zugriff |
| Ordner `extension` | **einmalig** in Opera als Erweiterung laden |

Danach gilt immer: **Starter läuft? → Schalter unter der Chat-Eingabe auf AN → los.**

---

## Schritt 0 – ZIP entpacken

1. Lade `arena-pc-bridge-komplett-v1.0.0.zip` herunter (GitHub → Releases).
2. Rechtsklick auf die ZIP → **„Alle extrahieren …“**.
3. Wähle z. B. `C:\Users\DEINNAME\Downloads\arena-pc-bridge`.
4. Öffne den Ordner und kontrolliere: darin gibt es `extension`, `installer`, `docs`, `README.md`.

> ❌ **Nicht** den Ordner im ZIP-Fenster doppelklicken und von dort starten. Erst entpacken, sonst funktioniert nichts.

Falls Windows die Dateien blockiert („Diese Datei stammt von einem anderen Computer“):
Rechtsklick auf die ZIP → **Eigenschaften** → unten Häkchen bei **„Zulassen“** → **OK** → nochmal entpacken.

---

## Schritt 1 – Einrichten

1. Öffne den Unterordner **`installer`**.
2. Doppelklick auf **`install.cmd`**.
   * Fragt Windows **„Möchten Sie zulassen, dass … Änderungen vornimmt?“** → **Ja**.
   * Fragt Smartscreen: **„Weitere Informationen“** → **„Trotzdem ausführen“**. (Es ist reiner Text-Code, den du im Editor nachlesen kannst.)
3. Du siehst:

   ```
   ============================================================
     Arena PC Bridge - Einrichtung
   ============================================================

     Projektordner: C:\Users\DEINNAME\Downloads\arena-pc-bridge\

     [1/3] Arbeitsordner angelegt: C:\Users\DEINNAME\Documents\Arena Bridge Workspace
     [2/3] Desktop-Verknuepfungen anlegen ...
           -> C:\Users\DEINNAME\Desktop\Arena PC Bridge.lnk
           -> C:\Users\DEINNAME\Desktop\Arena PC Bridge - nur lesen.lnk
     [3/3] Fertig.
   ```

4. Mit **Enter** schließen.

Auf dem Desktop liegen jetzt zwei Verknüpfungen:

* **„Arena PC Bridge“** → Lesen ✚ Schreiben ✚ Befehle
* **„Arena PC Bridge – nur lesen“** → nur Lesen (empfohlen für den ersten Test)

### Der Arbeitsordner

```
C:\Users\DEINNAME\Documents\Arena Bridge Workspace
```

Alles, was Arena über die Erweiterung darf, passiert **nur** in diesem Ordner.
Lege dort hinein, was Arena sehen soll – z. B. eine Datei `Notizen\2025-10-14.md` oder PDFs.

Eigenen Ordner benutzen? Über die Verknüpfung: Rechtsklick → **Eigenschaften** → Feld **Ziel** anpassen:

```
C:\...\installer\start.cmd -Commands -Write -Root "C:\Users\DEINNAME\Downloads"
```

---

## Schritt 2 – Starter starten

1. Desktop-Verknüpfung **„Arena PC Bridge“** doppelklicken.
2. Schwarzes Fenster mit Titel **„Arena PC Bridge – Port 8765“** öffnet sich:

   ```
   ============================================================
      Arena PC Bridge  -  lokaler Helfer fuer opera/arena.ai
   ============================================================

     Adresse        : http://127.0.0.1:8765/
     Arbeitsordner  : C:\Users\DEINNAME\Documents\Arena Bridge Workspace
     Lesen          : ERLAUBT
     Schreiben      : ERLAUBT
     Befehle        : ERLAUBT
     Zustimmung     : offen - im Browser auf "Erlauben" klicken

     Dieses Fenster offen lassen. Beenden mit STRG+C.
   ```

3. **Fenster offen lassen.** Minimieren ist ok. Schließen = PC-Zugriff aus.

Bequem testen: `http://127.0.0.1:8765/` im Browser öffnen → Seite **„Arena PC Bridge läuft ●“**.

**Wichtig:** Nur Dinge ausführen, die du eingegeben hast. Es lauscht ausschließlich auf `127.0.0.1` – also nur auf deinem PC, nicht im Netzwerk, nicht im Internet.

---

## Schritt 3 – Erweiterung in Opera laden

1. Opera öffnen.
2. In die Adresszeile tippen: **`opera://extensions`** → Enter.
3. Oben rechts **„Entwicklermodus“** (Developer mode) einschalten – der Schalter wird grün.
4. Oben links **„Entpackte Erweiterung laden“** anklicken.
5. In den entpackten Projektordner navigieren und dort **`extension`** anklicken (nur markieren!) → **„Ordner auswählen“**.
6. Jetzt steht in der Liste: **Arena PC Bridge – Version 1.0.0**.
7. Rechts oben in der Leiste auf das **Puzzle-Symbol** (Erweiterungen) klicken → beim Eintrag „Arena PC Bridge“ auf das **Pin-Symbol** klicken. Damit ist das Symbol dauerhaft sichtbar.

> Wenn du den Ordner falsch gewählt hast, kommt *„Manifest-Datei fehlt oder ist nicht lesbar“*. Dann Schritt 5 wiederholen und genau den **`extension`**-Ordner wählen.

---

## Schritt 4 – Auf arena.ai einschalten

1. Opera **komplett beenden** und neu öffnen (nötig, damit die Erweiterung auf allen Tabs greift).
2. [https://arena.ai](https://arena.ai) öffnen.
3. Unter der Chat-Eingabe – also direkt unter dem Feld, in das du deine Nachrichten tippst – erscheint:

   ```
   ( ) Arena PC Bridge: AUS    ● Aus · Arena nutzt nur die eigene Websuche     ⚙ 8 Werkzeuge
   ```

   * Findest du die Leiste nicht? Mit **F12** in der Konsole `window.ArenaLocalTools.status()` eintippen.
     Erscheint `{enabled: false, ...}`, funktioniert die Erweiterung und nur die Platzierung ist anders –
     dann hilft der Knopf im Popup (Symbol in der Leiste).
4. Auf den Schalter klicken → er springt auf **AN** (grün).
5. Symbol in der Opera-Leiste anklicken → im Popup **„Verbindungs-Tab öffnen (Brücke erlauben)“** → im neuen Tab
   **„Jetzt erlauben“** klicken. Danach steht dort `"ok": true`.
6. Zurück zum Arena-Tab – die Leiste zeigt jetzt:
   **„PC verbunden · Port 8765 · 09:15“** 🟢

---

## Schritt 5 – Erste Aufgabe

Schreibe in den Chat (Schalter **AN**):

> Fasse mir zusammen, was gestern passiert ist. Such dir passende News-Anbieter für gestern und schau
> zusätzlich in meinem Arbeitsordner nach, ob dort Notizen liegen – verbinde alles zu einem Briefing.

Arena hat nun zwei Quellen:

1. **Eigene Websuche** der Arena-Seite → News.
2. **Deine Brücke** (diese Erweiterung) → lokale Dateien, Ordner, Befehle.

Prüf-Aufträge, die garantiert auf deinem PC landen:

> Führe auf meinem PC `system_info` aus und sag mir, wie viel RAM ich habe.

> Liste meinen Arbeitsordner auf und zeig mir die 10 neuesten Dateien.

> Lies die Datei `LIESMICH.txt` in meinem Arbeitsordner und fasse sie in einem Satz zusammen.

Wenn so etwas klappt, läuft alles. 👍

---

## Alltag: die 3 Zustände

| Zustand | Was tun |
|---|---|
| Alles aus (Standard) | Nichts tun – Arena arbeitet normal weiter, nur ohne PC-Zugriff. |
| PC-Zugriff nutzen | Starter starten → Schalter AN → arbeiten. |
| Nur kurz was prüfen | Schalter AN lassen, Starter-Fenster läuft weiter; Schalter AUS = sofort Ruhe. |

---

## Freigaben jederzeit ändern

**Symbol in der Opera-Leiste** anklicken → Popup:

* **PC-Zugriff** (derselbe Schalter wie unter der Chat-Eingabe)
* **Brücke**: Adresse `http://127.0.0.1:8765` + **Port** + **testen**
* **Dateien lesen** / **Dateien schreiben** / **Befehle ausführen** (Häkchen)
* Werkzeugliste + Verlauf der letzten Aufrufe
* **„Verbindungs-Tab öffnen“**, **„Einrichtung & Fehlerhilfe“**, **„arena.ai neu laden“**

**Achtung:** „Befehle ausführen“ im Popup aktivieren reicht nur, wenn der Starter auch mit `-Commands` läuft. Sonst kommt
*„Befehle sind nicht freigegeben …“*. Die Desktop-Verknüpfung startet bereits mit `-Commands -Write`.

---

## Dateien ablegen, die Arena nutzen soll

Alles in:

```
C:\Users\DEINNAME\Documents\Arena Bridge Workspace
```

Tipp: Lege Unterordner an (`Notizen`, `Rechnungen`, `Projekte`) und nenne sie im Prompt – dann findet Arena schneller, was du meinst.

---

## Beenden

* **Zugriff sofort beenden:** Schalter unter der Chat-Eingabe auf **AUS** (oder Popup → PC-Zugriff aus).
* **Alles beenden:** Starter-Fenster schließen (oder darin **STRG+C**).
* **Zugriff dauerhaft sperren:** Starter mit `-ResetConsent` starten (oder `installer\uninstall.cmd -Reset`). Beim nächsten Mal muss wieder „Jetzt erlauben“ geklickt werden.

---

## Deinstallieren

1. `opera://extensions` → **Arena PC Bridge** → **Entfernen**.
2. `installer\uninstall.cmd` doppelklicken → löscht die Desktop-Verknüpfungen.
3. Mit `uninstall.cmd -All` auch den Arbeitsordner entfernen (mit Nachfrage).
4. Projektordner löschen. Fertig.

Es liegt nichts in der Registry, kein Dienst, kein Autostart.

---

## Häufige Stolperfallen (Kurzliste)

1. **„Ausserhalb des erlaubten Ordners“** → Starter mit `-Root "C:\…"` neu starten.
2. **Keine Verbindung** → Starter-Fenster geschlossen? Desktop-Verknüpfung doppelklicken.
3. **„Noch keine Zustimmung“** → Popup → Verbindungs-Tab → **Jetzt erlauben**.
4. **Kein Schalter zu sehen** → Tab mit `F5` neu laden; Konsole prüfen (`window.ArenaLocalTools`).
5. **Port belegt** → `start.cmd -Port 8899` + Port im Popup ändern.
6. **Antivirus meldet `start.cmd`** → Es ist eine Textdatei (Rechtsklick → Bearbeiten zeigt den Inhalt). Ggf. Ausnahme hinzufügen.
